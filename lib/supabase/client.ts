import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client factory. Safe to call in client components; the anon
// key is public by design and all access is gated by RLS.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
