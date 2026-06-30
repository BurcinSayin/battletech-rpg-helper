import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type Database } from "./database.types";
import { type CookieToSet } from "./types";

// Server Supabase client factory (RLS-gated, cookie-bound). Call per-request in
// Server Components, Route Handlers, and Server Actions — never cache it.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
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
}
