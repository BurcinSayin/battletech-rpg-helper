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

type Resolved = { data?: unknown; error?: unknown };

/** Minimal chainable stand-in for the PostgREST builder. */
class Query {
  op: "select" | "delete" = "select";
  constructor(
    readonly table: string,
    private readonly resolve: (q: Query) => Resolved,
    private readonly log: string[],
  ) {}
  select() {
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
    return this;
  }
  then(onOk: (v: Resolved) => unknown, onErr?: (e: unknown) => unknown) {
    this.log.push(`${this.op}:${this.table}`);
    return Promise.resolve(this.resolve(this)).then(onOk, onErr);
  }
}

function makeClient(opts: {
  authenticated?: boolean;
  campaign?: { gm_id: string } | null;
  campaignError?: unknown;
  membershipDeleteError?: unknown;
}) {
  const log: string[] = [];
  const deleteMembership = vi.fn(() => ({ error: opts.membershipDeleteError ?? null }));
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: opts.authenticated === false ? null : { id: ME } },
      }),
    },
    from: (table: string) =>
      new Query(
        table,
        (q) => {
          if (q.table === "campaigns" && q.op === "select") {
            return {
              data: opts.campaign === undefined ? { gm_id: OTHER_GM } : opts.campaign,
              error: opts.campaignError ?? null,
            };
          }
          if (q.table === "campaigns" && q.op === "delete") return { error: null };
          if (q.table === "campaign_members" && q.op === "delete") return deleteMembership();
          return { data: null, error: null };
        },
        log,
      ),
  };
  createClient.mockResolvedValue(client);
  return { log, deleteMembership };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("leaveCampaign", () => {
  it("redirects unauthenticated callers to login without changing membership", async () => {
    const { deleteMembership } = makeClient({ authenticated: false });

    await expect(leaveCampaign(CAMP)).rejects.toThrow(REDIRECT);

    expect(redirect).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(deleteMembership).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses when the caller is the campaign's GM without changing membership", async () => {
    const { deleteMembership } = makeClient({ campaign: { gm_id: ME } });

    expect(await leaveCampaign(CAMP)).toMatchObject({ ok: false });

    expect(deleteMembership).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", { campaign: null }],
    ["failed", { campaignError: { code: "XX000", message: "lookup failed" } }],
  ])("keeps membership when campaign lookup is %s", async (_label, opts) => {
    const { deleteMembership } = makeClient(opts);

    expect(await leaveCampaign(CAMP)).toMatchObject({ ok: false });

    expect(deleteMembership).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports membership deletion failure without navigating or revalidating", async () => {
    const { deleteMembership } = makeClient({
      membershipDeleteError: { code: "XX000", message: "delete failed" },
    });

    expect(await leaveCampaign(CAMP)).toMatchObject({ ok: false });

    expect(deleteMembership).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("deletes membership, revalidates affected pages, and redirects to the index", async () => {
    const { deleteMembership } = makeClient({});

    await expect(leaveCampaign(CAMP)).rejects.toThrow(REDIRECT);

    expect(deleteMembership).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledTimes(3);
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns");
    expect(revalidatePath).toHaveBeenCalledWith(`/campaigns/${CAMP}`);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(redirect).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/campaigns");
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
