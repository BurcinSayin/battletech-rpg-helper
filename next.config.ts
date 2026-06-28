import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict mode helps surface effects/double-render issues early.
  reactStrictMode: true,
};

// TODO(step #8 — PWA): wrap with `withSerwist({ swSrc, swDest })` from
// `@serwist/next` to ship the installable offline app shell. Deferred for now.

export default nextConfig;
