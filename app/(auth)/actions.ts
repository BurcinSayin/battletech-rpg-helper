"use server";

import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/auth/schema";

export type AuthResult = { error: string };

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
