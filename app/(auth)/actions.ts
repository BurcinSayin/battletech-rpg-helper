"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/auth/schema";

export type AuthResult = { error: string };

// Sign in with email/password. Returns an error for the form to render, or
// redirects to the dashboard on success.
export async function signIn(values: unknown): Promise<AuthResult | void> {
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid email or password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

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
