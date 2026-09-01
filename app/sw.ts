// Service worker entry. Two lines of policy-free glue — everything that decides
// what may be cached lives in lib/sw/config.ts, where the config test can see it.
//
// The import is relative on purpose: `@/*` would most likely resolve here (webpack's
// child compiler shares the parent resolver) but cannot resolve from next.config.ts,
// and both Serwist-adjacent files use relative paths so nobody "normalizes" the
// wrong one. See CLAUDE.md.
import { createServiceWorker } from "../lib/sw/config";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

createServiceWorker(self.__SW_MANIFEST ?? []).addEventListeners();
