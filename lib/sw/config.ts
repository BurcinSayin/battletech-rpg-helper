// Service-worker policy. This is the only place the cache boundary is defined.
//
// THIS FILE IS BUNDLED INTO THE SERVICE WORKER. `app/sw.ts` imports it, which pulls
// it into Serwist's InjectManifest child compilation. It must import NOTHING but
// `serwist` — any transitive app import lands in the SW bundle, and anything that
// reaches lib/supabase/client.ts makes createBrowserClient throw on a falsy URL and
// breaks the worker. It lives in lib/ next to lib/supabase/ and lib/characters/,
// where that is not obvious.
import {
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type SerwistOptions,
} from "serwist";

export const swOptions = {
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,

  // Exactly one runtime rule, and five things about it that are not obvious.
  // Each is a silent-failure mode verified in Serwist's source.
  //
  // 1. THIS IS NOT A SECURITY CONTROL. Its runtime posture is identical to having
  //    no rule at all: unmatched requests — Supabase included — are simply not
  //    handled by the service worker (Serwist.ts:795-802 returns before
  //    event.respondWith, so the browser handles them). What the rule buys is the
  //    *fallback hook*. Deleting it breaks offline and changes security not at all.
  //    Anyone who believes deleting it loosens security is reasoning backwards.
  // 2. `runtimeCaching` CANNOT BE EMPTY. `fallbacks` is consulted only inside
  //    `if (runtimeCaching !== undefined)` and is attached per-handler as a
  //    `handlerDidError` plugin (Serwist.ts:230-250). With [] it attaches to
  //    nothing and /offline never renders.
  // 3. DO NOT ADD PLUGINS TO THIS HANDLER. Serwist skips attaching the fallback
  //    plugin if the handler already has any plugin implementing `handlerDidError`
  //    (Serwist.ts:238-242). An unrelated plugin silently detaches the fallback.
  // 4. `NetworkOnly` CANNOT WRITE TO A CACHE — it accepts no `cacheName`
  //    (NetworkOnly.ts:18), and under navigationPreload the preload response is
  //    consumed and returned, never cached (StrategyHandler.ts:134-137, 498-510).
  //    `navigationPreload: true` and NetworkOnly are a pair; change them together.
  // 5. NEVER ADD A DYNAMIC OR AUTHENTICATED ROUTE to additionalPrecacheEntries in
  //    next.config.ts — the precache fetches with credentials: "same-origin", so it
  //    *can* capture authenticated responses.
  runtimeCaching: [
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],

  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
} satisfies Omit<SerwistOptions, "precacheEntries">;

/**
 * Builds the service worker. A factory rather than an exported options bag so
 * `app/sw.ts` has no spread to inject policy through: anything appended after a
 * `{ ...swOptions }` spread would pass the config test, which asserts `swOptions`.
 */
export function createServiceWorker(precacheEntries: (PrecacheEntry | string)[]) {
  return new Serwist({ ...swOptions, precacheEntries });
}
