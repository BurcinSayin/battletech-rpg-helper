import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Refresh the Supabase session cookie on every matched request and return the
// response carrying it, so auth stays fresh across navigations.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on app routes, skipping static assets, image optimization, and the PWA
  // surface. The service worker, manifest, icons and /offline are public and static;
  // matching them made every precache-install fetch pay a Supabase auth round-trip,
  // and precache install is all-or-nothing — one transient failure aborts the whole
  // install. Excluding paths removes work rather than running code between client
  // creation and getUser(), so this does not risk the random logouts CLAUDE.md warns
  // about. `icon` unsuffixed covers both /icons/* and the /icon file convention.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icon|apple-icon|offline).*)",
  ],
};
