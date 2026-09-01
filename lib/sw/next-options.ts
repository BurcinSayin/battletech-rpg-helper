// Options for @serwist/next's build-time plugin, kept in their own module so
// lib/sw/config.test.ts can assert them. `withSerwistInit` captures its argument
// in a closure and never surfaces it on the exported Next config, so importing
// next.config.ts would not reveal these.
//
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// next.config.ts imports this with a RELATIVE path. The `@/*` alias cannot resolve
// there — next.config.ts is loaded outside webpack — and a lint pass that
// "normalizes" it to `@/` breaks the build. See CLAUDE.md.

/**
 * Revision for additionalPrecacheEntries.
 *
 * A content hash of the sources that determine what those five URLs render, so it
 * changes exactly when their output changes and is stable otherwise. It must be
 * deterministic: next.config.ts is evaluated several times per build, so anything
 * random (crypto.randomUUID(), Date.now()) would emit a different revision for the
 * same assets. A build id would also work but churns the precache on every build
 * even when nothing changed.
 */
const REVISION_SOURCES = [
  "app/offline/page.tsx",
  "app/manifest.ts",
  "app/layout.tsx",
  "lib/branding/icon.tsx",
  "app/icons/192/route.tsx",
  "app/icons/512/route.tsx",
  "app/icons/512-maskable/route.tsx",
  "components/layout/page-container.tsx",
];

export const precacheRevision = createHash("sha256")
  .update(REVISION_SOURCES.map((f) => readFileSync(f, "utf8")).join("\0"))
  .digest("hex")
  .slice(0, 16);

/**
 * Routes whose output lives in .next/server/app/** and is therefore never a
 * candidate for Serwist's injected manifest (which is built from the *client*
 * compilation and excludes anything under server/). These must be listed
 * explicitly or they are not precached and /offline 404s while offline.
 *
 * NOTE: supplying additionalPrecacheEntries REPLACES @serwist/next's public/ glob
 * scan rather than adding to it. public/ holds only .gitkeep today; the first file
 * added there must be listed here by hand or it silently stops being precached.
 */
export const additionalPrecacheEntries = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/192",
  "/icons/512",
  "/icons/512-maskable",
].map((url) => ({ url, revision: precacheRevision }));

export const serwistOptions = {
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",

  // Defaults to TRUE upstream, and would reload the page on every offline->online
  // transition — discarding unsaved character-editor state, which has no dirty
  // tracking and no beforeunload guard. That is data loss on exactly the network
  // transition this feature exists to handle. Guarded by lib/sw/config.test.ts and
  // by the editor regression test in e2e-pwa/pwa.spec.ts.
  reloadOnOnline: false,

  // Already the upstream default; pinned deliberately. If it flipped, Serwist would
  // write authenticated soft-navigation HTML into the Cache API from a worker
  // lib/sw/config.ts does not control, defeating the whole cache boundary.
  cacheOnNavigation: false,

  additionalPrecacheEntries,
};
