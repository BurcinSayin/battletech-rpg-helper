// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";

// Capture what the hook subscribes to, and hand back a handler we can fire.
const state = vi.hoisted(() => ({
  onArgs: [] as unknown[][],
  channelNames: [] as string[],
  removed: 0,
  handler: null as ((payload: unknown) => void) | null,
  /** Ordered log of auth/subscribe calls — the ordering is the contract. */
  order: [] as string[],
  token: "user-jwt" as string | null,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: (...args: unknown[]) => {
        state.onArgs.push(args);
        state.handler = args[2] as (payload: unknown) => void;
        return channel;
      },
      subscribe: () => {
        state.order.push("subscribe");
        return channel;
      },
    };
    return {
      channel: (name: string) => {
        state.channelNames.push(name);
        return channel;
      },
      removeChannel: () => {
        state.removed += 1;
      },
      auth: {
        getSession: async () => ({
          data: { session: state.token ? { access_token: state.token } : null },
        }),
      },
      realtime: {
        setAuth: () => {
          state.order.push("setAuth");
        },
      },
    };
  },
}));

import { useCharacterRealtime } from "./use-character-realtime";

beforeEach(() => {
  process.env.BT_CHARGEN_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_BT_CHARGEN_SUPABASE_ANON_KEY = "anon";
  state.onArgs = [];
  state.channelNames = [];
  state.removed = 0;
  state.handler = null;
  state.order = [];
  state.token = "user-jwt";
});

/** The hook subscribes only after `getSession()` resolves. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
afterEach(cleanup);

describe("useCharacterRealtime", () => {
  it("authenticates the socket BEFORE subscribing, or the subscription is anon", async () => {
    renderHook(() => useCharacterRealtime({ id: "c1", version: 1, onRemoteVersion: vi.fn() }));
    await settle();
    // supabase-js only calls setAuth on SIGNED_IN/TOKEN_REFRESHED; @supabase/ssr
    // restores from cookies and emits INITIAL_SESSION, so the hook must set the
    // token itself — and the socket authenticates on join, so order matters.
    expect(state.order).toEqual(["setAuth", "subscribe"]);
  });

  it("subscribes to UPDATE on this character only (AC 18)", async () => {
    renderHook(() => useCharacterRealtime({ id: "c1", version: 1, onRemoteVersion: vi.fn() }));
    await settle();
    // Topic is prefixed by the character but suffixed per subscription, so a
    // StrictMode remount cannot have its channel evicted by the previous mount's
    // deferred, topic-matched removal.
    expect(state.channelNames[0]).toMatch(/^character:c1:\d+$/);
    const [event, config] = state.onArgs[0];
    expect(event).toBe("postgres_changes");
    expect(config).toMatchObject({
      event: "UPDATE",
      schema: "public",
      table: "characters",
      filter: "id=eq.c1",
    });
  });

  it("reports a strictly newer version and ignores the echo (AC 19)", async () => {
    const onRemoteVersion = vi.fn();
    renderHook(() => useCharacterRealtime({ id: "c1", version: 3, onRemoteVersion }));
    await settle();

    state.handler?.({ new: { version: 4 } });
    expect(onRemoteVersion).toHaveBeenCalledWith(4);

    onRemoteVersion.mockClear();
    state.handler?.({ new: { version: 3 } }); // the user's own save echoing back
    state.handler?.({ new: { version: 2 } }); // an out-of-order straggler
    expect(onRemoteVersion).not.toHaveBeenCalled();
  });

  it("ignores a payload with no numeric version rather than acting on it", async () => {
    const onRemoteVersion = vi.fn();
    renderHook(() => useCharacterRealtime({ id: "c1", version: 1, onRemoteVersion }));
    await settle();
    state.handler?.({ new: {} });
    state.handler?.({ new: null });
    expect(onRemoteVersion).not.toHaveBeenCalled();
  });

  it("does not rebuild the channel when version or callback change (PM2)", async () => {
    const { rerender } = renderHook(
      ({ version, cb }: { version: number; cb: () => void }) =>
        useCharacterRealtime({ id: "c1", version, onRemoteVersion: cb }),
      { initialProps: { version: 1, cb: vi.fn() } },
    );
    await settle();
    const initial = state.channelNames.length;
    expect(initial).toBe(1);
    rerender({ version: 2, cb: vi.fn() });
    rerender({ version: 3, cb: vi.fn() });
    expect(state.channelNames.length).toBe(initial);
  });

  it("uses the latest version after a re-render, not the one it mounted with", async () => {
    const onRemoteVersion = vi.fn();
    const { rerender } = renderHook(
      ({ version }: { version: number }) =>
        useCharacterRealtime({ id: "c1", version, onRemoteVersion }),
      { initialProps: { version: 1 } },
    );
    await settle();
    rerender({ version: 5 });
    state.handler?.({ new: { version: 4 } });
    expect(onRemoteVersion).not.toHaveBeenCalled();
    state.handler?.({ new: { version: 6 } });
    expect(onRemoteVersion).toHaveBeenCalledWith(6);
  });

  it("opens no channel at all when the client env vars are missing (P3)", async () => {
    process.env.BT_CHARGEN_SUPABASE_URL = "";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderHook(() => useCharacterRealtime({ id: "c1", version: 1, onRemoteVersion: vi.fn() }));
    await settle();
    expect(state.channelNames).toHaveLength(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("removes the channel on unmount", async () => {
    const { unmount } = renderHook(() =>
      useCharacterRealtime({ id: "c1", version: 1, onRemoteVersion: vi.fn() }),
    );
    await settle();
    unmount();
    expect(state.removed).toBeGreaterThan(0);
  });
});
