import { createBrowserClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";
import { type Database } from "./database.types";

// Browser Supabase client factory. Safe to call in client components; the anon
// key is public by design and all access is gated by RLS.
//
// The explicit `SupabaseClient<Database>` return bridges @supabase/ssr 0.5.2's
// older client generic to postgrest-js 2.108, which otherwise infers `never` for
// typed `.from()`/`.rpc()` calls (the runtime client is identical).
export function createClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as unknown as SupabaseClient<Database>;
}
