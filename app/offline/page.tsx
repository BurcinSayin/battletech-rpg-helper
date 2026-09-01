import { PageContainer } from "@/components/layout/page-container";

// Offline fallback. Deliberately a TOP-LEVEL route, outside both (app) and (auth)
// route groups, so neither layout guard runs and there is no getUser() network call
// to make while offline. Statically prerendered and precached by the service worker,
// which serves it for any navigation that fails.
export const metadata = { title: "Offline — BattleTech RPG Helper" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center py-8">
      <PageContainer width="narrow" className="flex flex-col gap-4 text-center">
        <div className="rounded-xl border border-hud-line bg-hud-bg p-6 text-hud-text">
          <h1 className="text-xl font-semibold">BattleTech RPG Helper</h1>
          <p className="mt-3 text-sm text-hud-muted">
            You&rsquo;re offline. Character data lives in the cloud, so reconnect to
            load your pilots.
          </p>
          {/*
            A plain anchor, not a client-component button. Under the fallback path the
            service worker returns this document in response to a navigation to some
            other URL, so the address bar and the HTML disagree and React hydrates
            against a mismatched pathname — a JS onClick may be dead on the one screen
            whose whole purpose is recovery. A hard navigation needs no JS and
            re-enters the SW's navigate handler correctly.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
              A <Link> is exactly what must NOT be used here: it soft-navigates via
              JS, and this page is served by the service worker in response to a
              navigation to some *other* URL, so React hydrates against a mismatched
              pathname and the handler may never attach. A plain anchor is a hard
              navigation that works with no JS at all. */}
          <a
            href="/"
            className="mt-5 inline-block rounded-md border border-hud-line px-4 py-2 text-xs font-medium uppercase tracking-wider text-hud-text transition hover:border-hud-amber hover:text-hud-amber"
          >
            Try again
          </a>
        </div>
      </PageContainer>
    </main>
  );
}
