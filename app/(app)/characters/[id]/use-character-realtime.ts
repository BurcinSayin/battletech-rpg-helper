"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Channel topics must be unique per subscription, not per character.
// RealtimeClient._remove filters `this.channels` by TOPIC, not by object identity:
//   this.channels = this.channels.filter((c) => c.topic !== channel.topic)
// and `removeChannel` is async (it awaits `channel.unsubscribe()`). Under
// StrictMode's mount → cleanup → mount, the first channel's deferred removal would
// therefore evict the *second* mount's channel too, leaving zero channels; the
// client then schedules a disconnect and no subscription is ever registered.
let channelSeq = 0;

/**
 * Subscribe to `postgres_changes` for one character and report remote versions
 * newer than the one this client already knows about.
 *
 * The effect depends on `[id]` alone. `version` and `onRemoteVersion` travel
 * through refs because the editor calls `watch()` and therefore re-renders on every
 * keystroke — a callback in the dependency array would tear down and rebuild the
 * channel continuously.
 */
export function useCharacterRealtime({
  id,
  version,
  onRemoteVersion,
}: {
  id: string;
  version: number;
  onRemoteVersion: (remoteVersion: number) => void;
}): void {
  const versionRef = useRef(version);
  const onRemoteVersionRef = useRef(onRemoteVersion);

  // Layout effects flush synchronously within the commit, so no websocket message
  // can observe a stale value after a render has committed.
  useLayoutEffect(() => {
    versionRef.current = version;
  }, [version]);
  useLayoutEffect(() => {
    onRemoteVersionRef.current = onRemoteVersion;
  }, [onRemoteVersion]);

  useEffect(() => {
    // `createBrowserClient` throws on a falsy URL *or* key, and next.config.ts
    // inlines "" when the variable is unset — an uncaught throw here would reach
    // the error boundary and turn the character page into an error page, which is
    // strictly worse than having no realtime. Read as static member expressions:
    // destructuring process.env defeats Next's build-time inlining.
    const url = process.env.BT_CHARGEN_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_BT_CHARGEN_SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.error(
        "[characters] realtime disabled: Supabase URL or anon key missing from the client bundle",
      );
      return;
    }

    let supabase;
    try {
      supabase = createClient();
    } catch (error) {
      console.error("[characters] realtime disabled: client init failed", error);
      return;
    }

    // Realtime must carry the USER's JWT, not the anon key: postgres_changes is
    // authorized by running characters_select_owner_or_gm (init.sql:203-205) as the
    // subscriber, and that policy is auth.uid()-scoped.
    //
    // supabase-js only calls realtime.setAuth(token) on SIGNED_IN / TOKEN_REFRESHED
    // (index.cjs:1437-1441). With @supabase/ssr the session is restored from
    // cookies and the event is INITIAL_SESSION, which takes the no-token branch —
    // so on a fresh page load the socket would authenticate as anon and the
    // subscription would be refused. Set it explicitly.
    let cancelled = false;
    channelSeq += 1;
    const topic = `character:${id}:${channelSeq}`;

    const client = supabase;
    const channel = client
      .channel(topic)
      .on(
        "postgres_changes",
        // UPDATE only: update_character is the sole statement that bumps `version`,
        // and excluding DELETE avoids a spurious "payload without version" log on
        // every delete (DELETE payloads carry only the PK under default replica
        // identity).
        { event: "UPDATE", schema: "public", table: "characters", filter: `id=eq.${id}` },
        (payload) => {
          const next = (payload.new as { version?: unknown } | null)?.version;
          if (typeof next !== "number") {
            // Walrus payload truncation. A missed early warning is a graceful
            // downgrade; acting on an unparseable payload risks a refresh loop.
            console.error("[characters] realtime payload without numeric version:", id);
            return;
          }
          if (next > versionRef.current) onRemoteVersionRef.current(next);
        },
      );

    // The token MUST be set before `subscribe()`. The socket authenticates on join,
    // so subscribing first registers the subscription under the anon role — the RLS
    // check then matches no rows and the character's updates never arrive, silently.
    void client.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const token = data.session?.access_token;
        if (token) client.realtime.setAuth(token);
        channel.subscribe((status) => {
          // PM1's discriminator: CHANNEL_ERROR / TIMED_OUT / CLOSED are logged,
          // never rendered — a missed early warning degrades gracefully (P3).
          if (status !== "SUBSCRIBED") {
            console.error("[characters] realtime channel:", status);
          }
        });
      })
      .catch((error) => {
        console.error("[characters] realtime disabled: session lookup failed", error);
      });

    // StrictMode double-mounts in dev; removing the exact channel object returned
    // above is what makes that safe.
    return () => {
      cancelled = true;
      client.removeChannel(channel);
    };
  }, [id]);
}
