import { describe, it, expect, vi, beforeEach } from "vitest";

// `redirect()` throws NEXT_REDIRECT in Next; mirror that so "did it navigate?"
// is observable, and so code after a redirect cannot run in a test either.
const { createClient, redirect, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    // The literal is inlined, not referenced: vi.hoisted lifts this factory above
    // any const it would otherwise close over.
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
  revalidatePath: vi.fn(),
}));
const REDIRECT = "NEXT_REDIRECT";
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { deleteCampaign, leaveCampaign } from "./actions";

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER_GM = "99999999-9999-9999-9999-999999999999";
const CAMP = "a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3";

type Resolved = { data?: unknown; error?: unknown; count?: number | null };

/** Minimal chainable stand-in for the PostgREST builder. */
class Query {
  op: "select" | "delete" = "select";
  opts: Record<string, unknown> | undefined;
  isSingle = false;
  constructor(
    readonly table: string,
    private readonly resolve: (q: Query) => Resolved,
    private readonly log: string[],
  ) {}
  select(_cols?: string, opts?: Record<string, unknown>) {
    this.opts = opts;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq() {
    return this;
  }
  single() {
    this.isSingle = true;
    return this;
  }
  then(onOk: (v: Resolved) => unknown, onErr?: (e: unknown) => unknown) {
    this.log.push(`${this.op}:${this.table}${this.opts?.head ? ":count" : ""}`);
    return Promise.resolve(this.resolve(this)).then(onOk, onErr);
  }
}

function makeClient(opts: {
  gmId?: string;
  characters?: { id: string; version: number }[];
  count?: number | null;
  countError?: unknown;
  rpcError?: unknown;
}) {
  const log: string[] = [];
  const rpc = vi.fn(async () => ({ error: opts.rpcError ?? null }));
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: ME } } }) },
    rpc: (...args: unknown[]) => {
      log.push("rpc:update_character");
      return rpc(...(args as []));
    },
    from: (table: string) =>
      new Query(
        table,
        (q) => {
          if (q.table === "campaigns" && q.op === "select") {
            return { data: { gm_id: opts.gmId ?? OTHER_GM }, error: null };
          }
          if (q.table === "campaigns" && q.op === "delete") return { error: null };
          if (q.table === "characters" && q.opts?.head) {
            // Note the `in` check, not `??`: coalescing would turn a null count
            // into 0 and quietly defeat the very case this fake exists to drive.
            return {
              count: "count" in opts ? (opts.count as number | null) : 0,
              error: opts.countError ?? null,
            };
          }
          if (q.table === "characters") return { data: opts.characters ?? [], error: null };
          if (q.table === "campaign_members") return { error: null };
          return { data: null, error: null };
        },
        log,
      ),
  };
  createClient.mockResolvedValue(client);
  return { log, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("leaveCampaign", () => {
  it("refuses when the caller is the campaign's GM, and mutates nothing", async () => {
    const { log } = makeClient({ gmId: ME });
    const result = await leaveCampaign(CAMP);
    expect(result).toEqual({
      ok: false,
      message: "You're the GM of this campaign. Delete it instead of leaving.",
    });
    // A GM leaving would delete a membership row the on_campaign_created trigger
    // never restores, breaking shares_campaign. The DB permits it, so the refusal
    // has to be here — and nothing may have been written before it.
    expect(log).not.toContain("delete:campaign_members");
    expect(log).not.toContain("rpc:update_character");
  });

  it("keeps the membership when the count comes back null (the fail-open case)", async () => {
    // PostgREST types `count` as number | null. Written `if (count)` a null would
    // be falsy and fall through to the membership delete — the orphan state the
    // gate exists to prevent. This is the regression test for that.
    const { log } = makeClient({ count: null });
    const result = await leaveCampaign(CAMP);
    expect(result).toMatchObject({ ok: false });
    expect(log).not.toContain("delete:campaign_members");
  });

  it("keeps the membership when the count query errors", async () => {
    const { log } = makeClient({ count: 0, countError: { code: "XX000", message: "boom" } });
    const result = await leaveCampaign(CAMP);
    expect(result).toMatchObject({ ok: false });
    expect(log).not.toContain("delete:campaign_members");
  });

  it("keeps the membership when characters are still attached", async () => {
    const { log } = makeClient({ characters: [{ id: "c1", version: 1 }], count: 1 });
    const result = await leaveCampaign(CAMP);
    expect(result).toEqual({
      ok: false,
      message: "Couldn't detach all your characters. Nothing was changed — please try again.",
    });
    expect(log).not.toContain("delete:campaign_members");
  });

  it("detaches every character before dropping the membership, then redirects", async () => {
    const { log, rpc } = makeClient({ characters: [{ id: "c1", version: 4 }], count: 0 });
    await expect(leaveCampaign(CAMP)).rejects.toThrow(REDIRECT);

    expect(rpc).toHaveBeenCalledWith("update_character", {
      p_id: "c1",
      p_expected_version: 4,
      p_payload: { campaign_id: null },
    });
    // Ordering is the whole point: deleting the membership first would leave the
    // GM holding write access to a departed player's character.
    expect(log.indexOf("rpc:update_character")).toBeLessThan(
      log.indexOf("delete:campaign_members"),
    );
    expect(log.indexOf("select:characters:count")).toBeLessThan(
      log.indexOf("delete:campaign_members"),
    );
    expect(redirect).toHaveBeenCalledWith("/campaigns");
  });

  it("drops the membership without any RPC when nothing is attached", async () => {
    const { log, rpc } = makeClient({ characters: [], count: 0 });
    await expect(leaveCampaign(CAMP)).rejects.toThrow(REDIRECT);
    expect(rpc).not.toHaveBeenCalled();
    expect(log).toContain("delete:campaign_members");
  });
});

describe("deleteCampaign", () => {
  it("deletes the campaign and redirects to the index", async () => {
    const { log } = makeClient({});
    await expect(deleteCampaign(CAMP)).rejects.toThrow(REDIRECT);
    expect(log).toContain("delete:campaigns");
    expect(redirect).toHaveBeenCalledWith("/campaigns");
  });
});
