import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyMech } from "@/lib/mech/schema";
import { emptyMechDamage } from "@/lib/mech/damage";
import type { CharacterRow } from "@/lib/characters";

const { createClient, rpc, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { applyMechDamage } from "./mech-damage-actions";

const id = "a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3";
function row(): CharacterRow {
  return {
    id,
    owner_id: id,
    campaign_id: null,
    name: "Pilot",
    info: {},
    attributes: {},
    skills: [],
    traits: [],
    prerequisites: {},
    notes: "",
    mech: null,
    mech_damage: null,
    version: 8,
    created_at: "",
    updated_at: "",
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  createClient.mockResolvedValue({ rpc });
  rpc.mockResolvedValue({ data: row(), error: null });
});

describe("applyMechDamage", () => {
  it.each([
    ["bad", 1, emptyMechDamage()],
    [id, 0, emptyMechDamage()],
    [id, 1.5, emptyMechDamage()],
    [id, "1", emptyMechDamage()],
    [id, 1, null],
    [id, 1, {}],
    [id, 1, { ...emptyMechDamage(), heat: 1000 }],
    [
      id,
      1,
      {
        ...emptyMechDamage(),
        armor: [
          { index: 0, lost: 1 },
          { index: 0, lost: 2 },
        ],
      },
    ],
  ])(
    "rejects unknown invalid input %# without creating a client or calling RPC",
    async (id, version, damage) => {
      expect(await applyMechDamage(id, version, damage)).toEqual({
        ok: false,
        kind: "invalid",
        message: "Damage values are invalid.",
      });
      expect(createClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
  it("sends empty as SQL null to the dedicated RPC, without fetching", async () => {
    expect(await applyMechDamage(id, 7, emptyMechDamage())).toEqual({
      ok: true,
      version: 8,
      damage: emptyMechDamage(),
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("update_character_mech_damage", {
      p_id: id,
      p_expected_version: 7,
      p_damage: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/characters/${id}`);
  });
  it("sorts valid input and strips extras without cross-record repair or mutation", async () => {
    const damage = {
      ...emptyMechDamage(),
      armor: [
        { index: 2, lost: 10 },
        { index: 0, lost: 5 },
      ],
      structure: [
        { index: 2, max: 10, lost: 1 },
        { index: 0, max: 4, lost: 0 },
      ],
      criticals: [
        { section: 2, slot: 0 },
        { section: 0, slot: 2 },
        { section: 0, slot: 1 },
      ],
      heat: 4,
      extra: "strip",
    };
    const before = structuredClone(damage);
    await applyMechDamage(id, 7, damage);
    expect(rpc.mock.calls[0][1].p_damage).toEqual({
      armor: [
        { index: 0, lost: 5 },
        { index: 2, lost: 10 },
      ],
      structure: [
        { index: 0, max: 4, lost: 0 },
        { index: 2, max: 10, lost: 1 },
      ],
      criticals: [
        { section: 0, slot: 1 },
        { section: 0, slot: 2 },
        { section: 2, slot: 0 },
      ],
      heat: 4,
      pilotHits: 0,
    });
    expect(damage).toEqual(before);
  });
  it("returns authoritative row damage and version, not submitted values", async () => {
    const returned = {
      ...row(),
      mech: { ...emptyMech(), armor: [{ location: "LA", value: 5 }] },
      mech_damage: {
        ...emptyMechDamage(),
        armor: [{ index: 0, lost: 2 }],
        pilotHits: 3,
      },
      version: 13,
    };
    rpc.mockResolvedValue({ data: returned, error: null });
    expect(
      await applyMechDamage(id, 7, { ...emptyMechDamage(), heat: 10 }),
    ).toEqual({ ok: true, version: 13, damage: returned.mech_damage });
  });
  it.each([{ code: "PT409" }, { message: "raised PT409" }])(
    "maps conflict without revalidation",
    async (error) => {
      rpc.mockResolvedValue({ data: null, error });
      expect(await applyMechDamage(id, 7, emptyMechDamage())).toEqual({
        ok: false,
        kind: "conflict",
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
  it.each([{ code: "PT422" }, { message: "raised PT422" }])(
    "maps DB invalid without revalidation",
    async (error) => {
      rpc.mockResolvedValue({ data: null, error });
      expect(await applyMechDamage(id, 7, emptyMechDamage())).toEqual({
        ok: false,
        kind: "invalid",
        message: "Damage no longer matches this mech. Discard and reload.",
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
  it("logs unknown errors and returns a safe retry message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      rpc.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "denied" },
      });
      expect(await applyMechDamage(id, 7, emptyMechDamage())).toEqual({
        ok: false,
        kind: "error",
        message: "Could not apply damage. Please try again.",
      });
      expect(log).toHaveBeenCalledWith(
        "[characters] mech damage apply failed:",
        "42501",
        "denied",
      );
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it("logs thrown failures and missing returned rows safely", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      rpc.mockRejectedValueOnce(new Error("network"));
      expect(await applyMechDamage(id, 7, emptyMechDamage())).toMatchObject({
        ok: false,
        kind: "error",
      });
      expect(log).toHaveBeenCalledWith(
        "[characters] mech damage apply failed:",
        undefined,
        "network",
      );
      rpc.mockResolvedValueOnce({ data: null, error: null });
      expect(await applyMechDamage(id, 7, emptyMechDamage())).toMatchObject({
        ok: false,
        kind: "error",
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
