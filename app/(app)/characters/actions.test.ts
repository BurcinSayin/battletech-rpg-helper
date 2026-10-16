import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDraft, serializeBtcc } from "@/lib/btcc";
import {
  computeXp,
  draftToColumns,
  draftToForm,
  rowToDraft,
  type CharacterRow,
} from "@/lib/characters";
import { emptyMech } from "@/lib/mech/schema";
import { fullWizardState } from "./new/wizard/test-fixtures";

const { createClient, redirect, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
import {
  createCharacter,
  createWizardCharacter,
  importCharacter,
  saveCharacter,
} from "./actions";

function client(
  user: { id: string } | null = { id: "owner" },
  error: object | null = null,
) {
  const single = vi
    .fn()
    .mockResolvedValue({ data: error ? null : { id: "new-id" }, error });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn((_payload: unknown) => ({ select }));
  const from = vi.fn(() => ({ insert }));
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
    from,
  });
  return { from, insert, select };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("character creation", () => {
  it("reconciles the wizard draft server-side, inserts for the session owner, and opens the editor", async () => {
    const db = client();
    const state = fullWizardState();
    state.draft.scalars.gmxpmod = 999; // The submitted residual is never authoritative.
    await expect(
      createWizardCharacter(
        serializeBtcc(state.draft),
        state.wizardXpRemaining,
      ),
    ).rejects.toMatchObject({ path: "/characters/new-id" });
    expect(db.from).toHaveBeenCalledWith("characters");
    expect(db.insert).toHaveBeenCalledTimes(1);
    const inserted = db.insert.mock.calls[0]?.[0] as unknown as CharacterRow;
    expect(inserted).toMatchObject({ owner_id: "owner" });
    expect(inserted).not.toHaveProperty("campaign_id");
    const saved = rowToDraft(inserted);
    expect(saved.scalars.name).toBe("Wizard Pilot");
    expect(saved.scalars.gmxpmod).not.toBe(999);
    expect(computeXp(saved).remaining).toBe(state.wizardXpRemaining);
    expect(saved.skills).toEqual(state.draft.skills);
    expect(saved.preSkills).toEqual(state.draft.preSkills);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects a signed-out creator without inserting", async () => {
    const db = client(null);
    const state = fullWizardState();
    await expect(
      createWizardCharacter(
        serializeBtcc(state.draft),
        state.wizardXpRemaining,
      ),
    ).rejects.toMatchObject({ path: "/login" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid remaining XP %s without inserting",
    async (remaining) => {
      const db = client();
      expect(
        await createWizardCharacter(
          serializeBtcc(fullWizardState().draft),
          remaining,
        ),
      ).toMatchObject({ ok: false, kind: "invalid" });
      expect(db.insert).not.toHaveBeenCalled();
    },
  );

  it("rejects a non-character payload and gives a blank wizard name a usable fallback", async () => {
    const db = client();
    expect(await createWizardCharacter("garbage", 5000)).toMatchObject({
      kind: "invalid",
    });
    expect(db.insert).not.toHaveBeenCalled();
    const state = fullWizardState();
    state.draft.scalars.name = "   ";
    await expect(
      createWizardCharacter(serializeBtcc(state.draft), 0),
    ).rejects.toMatchObject({ path: "/characters/new-id" });
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Character" }),
    );
  });

  it("returns a retryable create failure without navigating", async () => {
    const db = client({ id: "owner" }, { code: "42501", message: "denied" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        await createWizardCharacter(
          serializeBtcc(fullWizardState().draft),
          1000,
        ),
      ).toMatchObject({ ok: false, kind: "error" });
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(redirect).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("preserves blank creation and import through the shared insert path", async () => {
    const db = client();
    await expect(createCharacter()).rejects.toMatchObject({
      path: "/characters/new-id",
    });
    expect(db.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "New Character",
        attributes: expect.objectContaining({ STR: 100 }),
      }),
    );
    const state = fullWizardState();
    state.draft.scalars.gmxpmod = -123;
    await expect(
      importCharacter(serializeBtcc(state.draft)),
    ).rejects.toMatchObject({ path: "/characters/new-id" });
    const inserted = db.insert.mock.calls[1]?.[0] as unknown as CharacterRow;
    expect(rowToDraft(inserted).scalars.gmxpmod).toBe(-123);
  });
});

function storedRow(mech: unknown = null): CharacterRow {
  const draft = emptyDraft();
  draft.scalars.name = "Stored Pilot";
  return {
    ...draftToColumns(draft),
    id: "c1",
    owner_id: "owner",
    campaign_id: null,
    mech,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as CharacterRow;
}

function updateClient(
  rpcResult: { data: unknown; error: unknown } = {
    data: { version: 2 },
    error: null,
  },
  row: CharacterRow | null = storedRow(),
) {
  const single = vi
    .fn()
    .mockResolvedValue({ data: row, error: row ? null : { code: "PGRST116" } });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  createClient.mockResolvedValue({ from, rpc });
  return { from, rpc };
}

function values() {
  const draft = emptyDraft();
  draft.scalars.name = "Stored Pilot";
  return draftToForm(draft);
}

function sentPayload(rpc: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return rpc.mock.calls[0]?.[1]?.p_payload as Record<string, unknown>;
}

describe("saveCharacter — mech argument", () => {
  it("leaves the stored mech alone when the mech argument is absent", async () => {
    const db = updateClient();
    expect(await saveCharacter("c1", 1, values())).toEqual({
      ok: true,
      version: 2,
    });
    expect(db.rpc).toHaveBeenCalledWith("update_character", expect.any(Object));
    expect("mech" in sentPayload(db.rpc)).toBe(false);
  });

  it("omits the key when mech is undefined even with a campaign argument", async () => {
    const db = updateClient();
    await saveCharacter("c1", 1, values(), { id: null }, undefined);
    expect("mech" in sentPayload(db.rpc)).toBe(false);
    expect("campaign_id" in sentPayload(db.rpc)).toBe(true);
  });

  it("sends JSON null to clear the stored mech", async () => {
    const db = updateClient();
    expect(await saveCharacter("c1", 1, values(), undefined, null)).toEqual({
      ok: true,
      version: 2,
    });
    const payload = sentPayload(db.rpc);
    expect("mech" in payload).toBe(true);
    expect(payload.mech).toBeNull();
  });

  it("sends the validated mech as the object to set", async () => {
    const db = updateClient();
    const mech = { ...emptyMech(), chassis: "Atlas", model: "AS7-D" };
    await saveCharacter("c1", 1, values(), { id: null }, mech);
    expect(sentPayload(db.rpc).mech).toEqual(mech);
  });

  it("strips unknown keys from the mech before it reaches the RPC", async () => {
    const db = updateClient();
    await saveCharacter("c1", 1, values(), undefined, {
      ...emptyMech(),
      injected: "drop me",
    });
    const sent = sentPayload(db.rpc).mech as Record<string, unknown>;
    expect(sent).not.toHaveProperty("injected");
  });

  it("rejects an invalid mech before touching the database", async () => {
    const db = updateClient();
    expect(
      await saveCharacter("c1", 1, values(), undefined, {
        ...emptyMech(),
        chassis: 42,
      }),
    ).toEqual({ ok: false, kind: "error", message: "Mech data is invalid." });
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-object, non-null mech", async () => {
    const db = updateClient();
    expect(
      await saveCharacter("c1", 1, values(), undefined, "Atlas"),
    ).toMatchObject({ ok: false, kind: "error" });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("still validates the campaign argument before the mech", async () => {
    const db = updateClient();
    expect(
      await saveCharacter("c1", 1, values(), { id: "not-a-uuid" }, null),
    ).toEqual({
      ok: false,
      kind: "error",
      message: "Invalid campaign selection.",
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("maps a version conflict on a mech save to conflict", async () => {
    updateClient({ data: null, error: { code: "PT409", message: "conflict" } });
    expect(
      await saveCharacter("c1", 1, values(), undefined, emptyMech()),
    ).toEqual({ ok: false, kind: "conflict" });
  });

  it("maps a forbidden campaign attach on a mech save to forbidden", async () => {
    updateClient({ data: null, error: { code: "PT403", message: "denied" } });
    expect(
      await saveCharacter(
        "c1",
        1,
        values(),
        { id: "a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3" },
        emptyMech(),
      ),
    ).toEqual({
      ok: false,
      kind: "forbidden",
      message: "You can't save to that campaign.",
    });
  });

  it("keeps the existing draft-driven payload for a no-mech save", async () => {
    const db = updateClient();
    await saveCharacter("c1", 1, values());
    const payload = sentPayload(db.rpc);
    expect(payload).toMatchObject({
      name: "Stored Pilot",
      notes: "",
    });
  });
});
