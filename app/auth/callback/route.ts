import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/reset-password";

  // Prevent open redirect attacks: ensure next is a relative path.
  const destination =
    next.startsWith("/") && !next.startsWith("//") ? next : "/reset-password";

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-reset-link", origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(
      "[auth] exchangeCodeForSession failed:",
      error.code,
      error.message,
    );
    return NextResponse.redirect(
      new URL("/login?error=invalid-reset-link", origin),
    );
  }

  return NextResponse.redirect(new URL(destination, origin));
}

