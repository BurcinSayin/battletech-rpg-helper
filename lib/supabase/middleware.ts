import type { NextRequest } from "next/server";

// Session-refresh helper used by the root middleware.
//
// TODO(step #2 — auth): refresh the Supabase session cookie on each request
// using `createServerClient` from `@supabase/ssr` and return the NextResponse.
export async function updateSession(_request: NextRequest): Promise<void> {
  // no-op until auth lands
}
