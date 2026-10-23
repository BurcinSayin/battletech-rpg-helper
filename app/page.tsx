import { redirect } from "next/navigation";

// Supabase can fall back to the Site URL when a recovery redirect is not
// accepted. Preserve the PKCE code so the callback can establish the session
// before the dashboard's auth guard runs.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await searchParams;
  if (typeof code === "string" && code) {
    const params = new URLSearchParams({ code });
    redirect(`/auth/callback?${params.toString()}`);
  }

  redirect("/dashboard");
}
