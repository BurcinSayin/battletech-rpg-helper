import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Relative, not "@/lib/...": next.config.ts is loaded outside webpack, so the
// `@/*` alias cannot resolve here. See CLAUDE.md before "fixing" this.
import { serwistOptions } from "./lib/sw/next-options";

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

// PWA (step #8). Options live in lib/sw/next-options.ts so they can be asserted by
// lib/sw/config.test.ts — withSerwistInit closes over its argument and never
// surfaces it on the returned config.
//
// Do not add `--turbopack` to the dev/build scripts: @serwist/next does not support
// Turbopack and silently produces no service worker under it.
const withSerwist = withSerwistInit(serwistOptions);

export default withSerwist(nextConfig);
