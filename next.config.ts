import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict mode helps surface effects/double-render issues early.
  reactStrictMode: true,

  // Vercel's Supabase integration provisions this project's variables under a
  // `BT_CHARGEN_` prefix and only prefixed the anon key with `NEXT_PUBLIC_` —
  // the project URL arrives unprefixed, so Next.js treats it as server-only and
  // the browser client in `lib/supabase/client.ts` would build with `undefined`.
  // Listing it here inlines it into the client bundle at build time.
  //
  // `?? ""` keeps builds from failing when the variable is absent, matching the
  // inline `process.env.X!` convention documented in lib/supabase/AGENTS.md.
  env: {
    BT_CHARGEN_SUPABASE_URL: process.env.BT_CHARGEN_SUPABASE_URL ?? "",
  },
};

// TODO(step #8 — PWA): wrap with `withSerwist({ swSrc, swDest })` from
// `@serwist/next` to ship the installable offline app shell. Deferred for now.

export default nextConfig;
