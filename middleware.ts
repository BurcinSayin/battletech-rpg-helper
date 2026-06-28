import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// TODO(step #2 — auth): once `updateSession` refreshes the session cookie,
// return its NextResponse here so auth stays fresh across requests.
export async function middleware(request: NextRequest) {
  await updateSession(request);
  return NextResponse.next();
}

export const config = {
  // Run on app routes, skipping static assets and image optimization.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
