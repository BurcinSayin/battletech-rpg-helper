import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/app-header";

// Authed route group layout. Guards the session server-side and redirects
// unauthenticated users to the login page. Authorization beyond "is signed in"
// is enforced by RLS, not here.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />
      <main className="py-6">{children}</main>
    </div>
  );
}
