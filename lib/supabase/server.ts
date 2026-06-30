import { createServerClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { type Database } from "./database.types";
import { type CookieToSet } from "./types";

// Server Supabase client factory (RLS-gated, cookie-bound). Call per-request in
// Server Components, Route Handlers, and Server Actions — never cache it.
//
// The explicit `SupabaseClient<Database>` return type is required: @supabase/ssr
// 0.5.2's generic plumbing doesn't thread `Database` through to the (much newer)
// postgrest-js query builder, so without it `.from()`/`.rpc()` infer `never`.
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component, where cookies are
            // read-only. The session is refreshed in middleware instead, so
            // this can be safely ignored.
          }
        },
      },
    },
  );
  // ssr 0.5.2 returns an older SupabaseClient generic shape than postgrest-js
  // 2.108 expects; the runtime client is identical, so bridge the type only.
  return client as unknown as SupabaseClient<Database>;
}
