import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Auth route group layout. Reverse of the (app) guard: signed-in users have no
// business on /login or /signup, so send them to the dashboard. Middleware
// intentionally carries no redirect logic — guarding lives in these layouts.
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return <>{children}</>;
}
