import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";

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
      <header className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
        <span className="text-sm font-medium">BattleTech RPG Helper</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-foreground/70">{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
