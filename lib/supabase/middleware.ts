import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { type CookieToSet } from "./types";

// Session-refresh helper used by the root middleware. Rebuilds the Supabase
// session cookie on each request and returns the response carrying it. Route
// protection lives in the `(app)` layout guard, not here.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the auth server so the session cookie is refreshed if expiring.
  // IMPORTANT: do not run code between client creation and getUser() — it can
  // cause hard-to-debug random logouts (per @supabase/ssr guidance).
  await supabase.auth.getUser();

  return response;
}
