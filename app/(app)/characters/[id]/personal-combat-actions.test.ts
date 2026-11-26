import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPersonalCombat } from "./personal-combat-actions";

const { createClient, rpc, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

const id = "a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3";
const empty = { damage: 0, conditions: [] };
const privateText = "private condition text";

beforeEach(() => {
  vi.resetAllMocks();
  createClient.mockResolvedValue({ rpc });
});
afterEach(() => vi.restoreAllMocks());

describe("applyPersonalCombat", () => {
  type ActionArgs = Parameters<typeof applyPersonalCombat>;
  it.each<ActionArgs>([
    ["bad-id", 1, empty],
    [id, 0, empty],
    [id, 2_147_483_648, empty],
    [id, 1.5, empty],
    [id, "1", empty],
    [id, 1, null],
    [id, 1, { damage: 1 }],
    [id, 1, { conditions: [] }],
    [id, 1, { ...empty, extra: true }],
    ...[-1, 0.5, 1000, "1"].map<ActionArgs>((damage) => [
      id,
      1,
      { ...empty, damage },
    ]),
    ...[
      null,
      [1],
      [""],
      [" a"],
      ["a "],
      ["\u00a0\u3000"],
      ["a\0b"],
      ["a\tb"],
      ["a\nb"],
      ["a\u007fb"],
      ["a\u0085b"],
      ["a\u2028b"],
      ["a\u2029b"],
      ["\ud800"],
      ["🩹".repeat(65)],
      Array(13).fill("a"),
    ].map<ActionArgs>((conditions) => [id, 1, { ...empty, conditions }]),
  ])(
    "rejects invalid input %# before creating a client",
    async (id, version, status) => {
      expect(await applyPersonalCombat(id, version, status)).toMatchObject({
        ok: false,
        kind: "invalid",
      });
      expect(createClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each([
    empty,
    {
      damage: 999,
      conditions: [
        "Prone",
        "\u00a0Dazed",
        ...Array<string>(10).fill("🩹".repeat(64)),
      ],
    },
  ])(
    "sends the exact status and returns the stored acknowledgment",
    async (status) => {
      const stored = { damage: 3, conditions: ["Dazed", "Prone", "Dazed"] };
      rpc.mockResolvedValue({
        data: { id, version: 8, personal_combat: stored },
        error: null,
      });

      expect(await applyPersonalCombat(id, 7, status)).toEqual({
        ok: true,
        version: 8,
        status: stored,
      });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("update_character_personal_combat", {
        p_id: id,
        p_expected_version: 7,
        p_status: status,
      });
      expect(revalidatePath).toHaveBeenCalledWith(`/characters/${id}`);
    },
  );

  it.each([
    ["PT409", "conflict"],
    ["PT422", "invalid"],
    ["42501", "error"],
  ])(
    "classifies RPC error %s without disclosing condition text",
    async (code, kind) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      rpc.mockResolvedValue({
        data: null,
        error: { code, message: privateText },
      });
      const result = await applyPersonalCombat(id, 1, empty);
      expect(result).toMatchObject({ ok: false, kind });
      expect(JSON.stringify([result, log.mock.calls])).not.toContain(
        privateText,
      );
      if (kind === "error") expect(log).toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { id, personal_combat: empty },
    {
      id,
      version: 8,
      personal_combat: { damage: -1, conditions: [privateText] },
    },
  ])("requires a valid acknowledgment %# before revalidation", async (data) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data, error: null });
    const result = await applyPersonalCombat(id, 7, empty);
    expect(result).toMatchObject({ ok: false, kind: "error" });
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify([result, log.mock.calls])).not.toContain(privateText);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("handles a thrown transport failure without exposing its message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockRejectedValue(new Error(privateText));
    const result = await applyPersonalCombat(id, 7, empty);
    expect(result).toMatchObject({ ok: false, kind: "error" });
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify([result, log.mock.calls])).not.toContain(privateText);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
