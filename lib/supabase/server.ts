// Server Supabase client factory (RLS-gated, cookie-bound).
//
// TODO(step #2 — auth): implement with `createServerClient` from
// `@supabase/ssr`, wiring Next's `cookies()` for session read/write.
export function createClient(): never {
  throw new Error("Supabase server client not implemented yet (step #2).");
}
