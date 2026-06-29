import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Refresh the Supabase session cookie on every matched request and return the
// response carrying it, so auth stays fresh across navigations.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on app routes, skipping static assets and image optimization.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
