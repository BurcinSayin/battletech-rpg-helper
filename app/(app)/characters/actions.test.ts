import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializeBtcc } from "@/lib/btcc";
import { computeXp, rowToDraft, type CharacterRow } from "@/lib/characters";
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
