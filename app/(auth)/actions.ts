"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schema";

export type AuthResult = { error: string };

export type RequestPasswordResetResult = {
  error?: string;
  success?: boolean;
};

// Map a Supabase AuthError to a safe, user-facing message. Most errors collapse
// to the caller's generic `fallback` so we never leak account-existence details
// (e.g. "User already registered" / "Invalid login credentials"), which would
// allow account enumeration. Only a few non-enumerating codes get specific text.
function authErrorMessage(error: AuthError, fallback: string): string {
  switch (error.code) {
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please try again later.";
    case "weak_password":
      return "Please choose a stronger password.";
    default:
      return fallback;
  }
}

// Sign in with email/password. Returns an error for the form to render, or
// redirects to the dashboard on success.
export async function signIn(values: unknown): Promise<AuthResult | void> {
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid email or password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    console.error("[auth] signIn failed:", error.code, error.message);
    return { error: authErrorMessage(error, "Invalid email or password.") };
  }

  redirect("/dashboard");
}

// Sign up with email/password. Locally email confirmations are disabled, so a
// session is established immediately and we redirect to the dashboard. When
// confirmations are enabled (the Supabase default elsewhere), signUp returns no
// session, so we route to /login with a "check your email" notice instead.
export async function signUp(values: unknown): Promise<AuthResult | void> {
  const parsed = signUpSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check your details and try again." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName || undefined },
    },
  });
  if (error) {
    console.error("[auth] signUp failed:", error.code, error.message);
    return {
      error: authErrorMessage(error, "Could not create your account. Please try again."),
    };
  }

  if (!data.session) {
    // Account created but email confirmation required → no session cookie yet.
    redirect("/login?notice=check-email");
  }

  redirect("/dashboard");
}

// Sign out and return to the login page. Usable directly as a <form> action.
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

async function getOrigin(): Promise<string> {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  if (origin) return origin;

  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (host) return `${proto}://${host}`;

  return "http://localhost:3000";
}

// Request a password recovery email. To prevent email / account enumeration,
// always reports success unless rate limits are exceeded.
export async function requestPasswordReset(
  values: unknown,
): Promise<RequestPasswordResetResult> {
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please enter a valid email address." };
  }

  const supabase = await createClient();
  const origin = await getOrigin();
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  if (error) {
    console.error("[auth] resetPasswordForEmail failed:", error.code, error.message);
    if (
      error.code === "over_email_send_rate_limit" ||
      error.code === "over_request_rate_limit"
    ) {
      return { error: "Too many attempts. Please try again later." };
    }
    // Anti-enumeration: all other errors return success to avoid leaking account existence.
  }

  return { success: true };
}

// Update the user's password using the active recovery session.
// After updating, signs out the session so the user must authenticate with their new credentials.
export async function updatePassword(
  values: unknown,
): Promise<AuthResult | void> {
  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    console.error("[auth] updatePassword failed:", error.code, error.message);
    return {
      error: authErrorMessage(
        error,
        "Could not update password. Please try again.",
      ),
    };
  }

  await supabase.auth.signOut();
  redirect("/login?notice=password-reset-success");
}
