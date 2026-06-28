// Authed route group layout.
//
// TODO(step #2 — auth): guard this layout by checking the Supabase session
// server-side and redirecting unauthenticated users to a sign-in page. For now
// it just renders children so the route group compiles.
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
