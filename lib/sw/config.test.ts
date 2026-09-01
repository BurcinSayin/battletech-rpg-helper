import { describe, expect, it } from "vitest";
import { NetworkOnly } from "serwist";
import { swOptions } from "./config";
import { additionalPrecacheEntries, serwistOptions } from "./next-options";

// The cache boundary is a security property: authorization here is RLS + Supabase
// auth cookies, so anything the service worker retains outlives sign-out and is
// readable by the next person on a shared device. The end-to-end proof lives in
// e2e-pwa/pwa.spec.ts, but that lane needs a production build, .env.local and a
// running Supabase stack — so it is not what most changes will be checked against.
// These assertions run in the ordinary `npm run test` lane with no browser, no
// build and no database, so a regression fails immediately.
//
// This does not cover app/sw.ts or next.config.ts themselves; both consume these
// modules and could in principle override them. The factory in ./config.ts removes
// the worker-side override point, and the key-set assertions below catch new
// options. See .omc/plans/21-pwa-consensus-plan.md, Step 10.
describe("service worker cache boundary", () => {
  it("registers exactly one runtime rule", () => {
    expect(swOptions.runtimeCaching).toHaveLength(1);
  });

  it("handles navigations with NetworkOnly, which cannot write to a cache", () => {
    // NetworkOnly accepts no cacheName by construction, so the only handler that
    // ever sees an authenticated navigation is structurally incapable of caching it.
    expect(swOptions.runtimeCaching[0].handler).toBeInstanceOf(NetworkOnly);
  });

  it("leaves the navigation handler free of handlerDidError plugins", () => {
    // Serwist skips attaching the /offline fallback plugin if the handler already
    // has any plugin implementing handlerDidError (Serwist.ts:238-242), so adding
    // one here would silently detach the offline fallback.
    const { plugins } = swOptions.runtimeCaching[0].handler;
    expect(plugins.some((p) => "handlerDidError" in p)).toBe(false);
  });

  it("matches navigations and nothing else", () => {
    // A duck-typed stub, not `new Request(url, { mode: "navigate" })` — the Fetch
    // spec forbids script from constructing navigate-mode Requests, so that throws
    // `TypeError: Request constructor: invalid request mode navigate`. Do not
    // "fix" this into a real Request.
    const matcher = swOptions.runtimeCaching[0].matcher as unknown as (o: {
      request: { mode: string; url?: string };
    }) => boolean;

    expect(matcher({ request: { mode: "navigate" } })).toBe(true);
    // Supabase requests are unmatched because they are not navigations — the
    // matcher has no origin logic, and this assertion pins its shape, not origins.
    expect(
      matcher({
        request: {
          mode: "cors",
          url: "http://127.0.0.1:54321/rest/v1/characters",
        },
      }),
    ).toBe(false);
  });

  it("falls back to the precached /offline page", () => {
    expect(swOptions.fallbacks.entries[0].url).toBe("/offline");
  });

  it("takes control of pages without waiting for a reload", () => {
    // Not covered by the e2e lane: e2e-pwa/pwa.spec.ts reloads before asserting
    // control, and a reload yields a fresh client that an active worker controls
    // whether or not clientsClaim is set — so flipping this flag does NOT turn that
    // test red (verified). It still matters: without it the worker does not control
    // the page that installed it, so the offline fallback is inert on a first visit
    // until the user reloads. Asserted here because nothing else catches it.
    expect(swOptions.clientsClaim).toBe(true);
    expect(swOptions.skipWaiting).toBe(true);
    // navigationPreload pairs with NetworkOnly: Serwist consumes and returns the
    // preload response rather than caching it. Changing one without the other
    // either double-fetches or drops the optimization.
    expect(swOptions.navigationPreload).toBe(true);
  });

  it("declares no option beyond the reviewed set", () => {
    // A new top-level Serwist option (requestRules, precacheOptions,
    // offlineAnalyticsConfig, ...) fails here rather than passing unnoticed.
    expect(Object.keys(swOptions).sort()).toEqual([
      "clientsClaim",
      "fallbacks",
      "navigationPreload",
      "runtimeCaching",
      "skipWaiting",
    ]);
  });
});

describe("@serwist/next plugin options", () => {
  it("never reloads the page when the network returns", () => {
    // Defaults to true upstream. Left alone it reloads on every offline->online
    // transition, discarding unsaved character-editor state — data loss on exactly
    // the network transition this feature exists to handle.
    expect(serwistOptions.reloadOnOnline).toBe(false);
  });

  it("does not cache on navigation", () => {
    // Would write authenticated soft-navigation HTML into the Cache API from a
    // worker lib/sw/config.ts does not control.
    expect(serwistOptions.cacheOnNavigation).toBe(false);
  });

  it("disables the service worker in development", () => {
    expect(serwistOptions.disable).toBe(process.env.NODE_ENV === "development");
  });

  it("precaches every route whose output webpack cannot see", () => {
    // .next/server/app/** is excluded from the injected manifest, so these must be
    // listed explicitly or /offline 404s while offline.
    expect(additionalPrecacheEntries.map((e) => e.url).sort()).toEqual([
      "/icons/192",
      "/icons/512",
      "/icons/512-maskable",
      "/manifest.webmanifest",
      "/offline",
    ]);
    expect(additionalPrecacheEntries.every((e) => Boolean(e.revision))).toBe(true);
  });

  it("declares no plugin option beyond the reviewed set", () => {
    expect(Object.keys(serwistOptions).sort()).toEqual([
      "additionalPrecacheEntries",
      "cacheOnNavigation",
      "disable",
      "reloadOnOnline",
      "swDest",
      "swSrc",
    ]);
  });
});
