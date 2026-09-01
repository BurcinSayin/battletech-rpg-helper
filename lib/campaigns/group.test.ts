import { describe, expect, it } from "vitest";
import { MEMBER_FALLBACK_NAME, groupCharactersByMember } from "./group";

const gm = { user_id: "u-gm", role: "gm" as const };
const player = { user_id: "u-p", role: "player" as const };

describe("groupCharactersByMember", () => {
  it("keeps a member with zero characters, with an empty array (AC 11)", () => {
    const groups = groupCharactersByMember([gm, player], [], []);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.characters.length === 0)).toBe(true);
  });

  it("falls back when display_name is null or blank (AC 10)", () => {
    const groups = groupCharactersByMember(
      [gm, player],
      [
        { id: "u-gm", display_name: null },
        { id: "u-p", display_name: "  " },
      ],
      [],
    );
    expect(groups.map((g) => g.label)).toEqual([MEMBER_FALLBACK_NAME, MEMBER_FALLBACK_NAME]);
  });

  it("uses the trimmed display name when present", () => {
    const [group] = groupCharactersByMember([gm], [{ id: "u-gm", display_name: "  Natasha  " }], []);
    expect(group.label).toBe("Natasha");
  });

  it("files each character under its owner", () => {
    const groups = groupCharactersByMember(
      [gm, player],
      [],
      [
        { owner_id: "u-p", id: "c1" },
        { owner_id: "u-gm", id: "c2" },
        { owner_id: "u-p", id: "c3" },
      ],
    );
    const byUser = Object.fromEntries(groups.map((g) => [g.userId, g.characters.map((c) => c.id)]));
    expect(byUser["u-p"]).toEqual(["c1", "c3"]);
    expect(byUser["u-gm"]).toEqual(["c2"]);
  });

  it("does not silently drop a character whose owner is not in the member list", () => {
    const groups = groupCharactersByMember([gm], [], [{ owner_id: "u-stranger", id: "c9" }]);
    const stranger = groups.find((g) => g.userId === "u-stranger");
    expect(stranger?.characters.map((c) => c.id)).toEqual(["c9"]);
  });
});
