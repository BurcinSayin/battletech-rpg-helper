import { describe, it, expect } from "vitest";
import { parseBtcc } from "./parse";
import { readFixture } from "./test-fixtures";

describe("parseBtcc", () => {
  const lisa = parseBtcc(readFixture("lisa.btcc"));

  it("reads scalar fields", () => {
    expect(lisa.scalars.name).toBe("Lisa");
    expect(lisa.scalars.aff).toBe("Federated Suns");
    expect(lisa.scalars.sex).toBe("Female");
    expect(lisa.scalars.age).toBe(21);
    expect(lisa.scalars.height).toBe(168);
  });

  it("keeps empty scalars as empty strings (not dropped)", () => {
    expect(lisa.scalars.specschool).toBe("");
    expect(lisa.scalars.nameplanet).toBe("");
  });

  it("parses negative numeric scalars", () => {
    expect(lisa.scalars.gmxpmod).toBe(-30);
    expect(lisa.scalars.cbillmod).toBe(0);
  });

  it("parses attributes into a record", () => {
    expect(lisa.attrs.STR).toBe(195);
    expect(lisa.attrs.BOD).toBe(250);
    expect(Object.keys(lisa.attrs)).toHaveLength(8);
  });

  it("preserves skill insertion order", () => {
    expect(lisa.skills[0]).toEqual({ name: "Art/Painting", xp: 20 });
    expect(lisa.skills[1]).toEqual({ name: "Career/Pilot", xp: -30 });
    // Insertion order, not alphabetical: Military History before Battlemechs.
    const names = lisa.skills.map((s) => s.name);
    expect(names.indexOf("Interests/Military History")).toBeLessThan(
      names.indexOf("Interests/Battlemechs"),
    );
  });

  it("parses traits and pre-attributes", () => {
    expect(lisa.traits).toContainEqual({ name: "Unlucky", xp: -50 });
    expect(lisa.preAttrs).toEqual({ DEX: 400, INT: 400, RFL: 400, WIL: 300 });
  });

  it("captures notes verbatim with no trailing newline", () => {
    expect(lisa.notes.startsWith("-----Wizard Data-----")).toBe(true);
    expect(lisa.notes.endsWith('"The Time of War" rules book.')).toBe(true);
    expect(lisa.notes.endsWith("\n")).toBe(false);
  });

  describe("test.btcc passthrough sections", () => {
    const t = parseBtcc(readFixture("test.btcc"));

    it("preserves equip rows as raw 7-field values", () => {
      expect(t.equip).toHaveLength(4);
      expect(t.equip[0].split(";")).toHaveLength(7);
    });

    it("preserves weapon rows as raw 11-field values", () => {
      expect(t.weapons).toHaveLength(7);
      expect(t.weapons[0].split(";")).toHaveLength(11);
    });

    it("parses equiploc and chrweapon", () => {
      expect(Object.keys(t.equipLoc)).toHaveLength(6);
      expect(t.equipLoc.Head).toBe("Marian/Helmet");
      expect(t.chrWeapons).toEqual([
        "Sniper Rifle(Minolta 9000)",
        "Dagger",
        "Pulse Laser Pistol, Clan",
      ]);
    });

    it("keeps the desktop's trailing blank lines in notes", () => {
      expect(t.notes.endsWith("Real Life: Tour Of Duty\n\n\n\n\n\n")).toBe(true);
    });
  });

  it("normalizes CRLF to LF", () => {
    const raw = readFixture("lisa.btcc");
    const crlf = parseBtcc(raw.replace(/\n/g, "\r\n"));
    expect(crlf).toEqual(lisa);
  });

  it("ignores unknown keys without throwing", () => {
    const d = parseBtcc("name:X\nbogus:whatever\nage:5\n<notes>\n\n</notes>\n");
    expect(d.scalars.name).toBe("X");
    expect(d.scalars.age).toBe(5);
  });
});
