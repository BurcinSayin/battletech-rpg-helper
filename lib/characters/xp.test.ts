import { describe, expect, it } from "vitest";
import { parseBtcc } from "@/lib/btcc";
import { readFixture } from "@/lib/btcc/test-fixtures";
import { attributeXp, computeXp } from "./xp";

describe("computeXp", () => {
  const draft = parseBtcc(readFixture("lisa.btcc"));

  it("sums skills, traits, and attribute increases per the desktop formula", () => {
    // lisa: attribute increases 705 (Σ value−100), skills 1280, traits 825.
    const xp = computeXp(draft);
    expect(xp.byCategory).toEqual({ attributes: 705, skills: 1280, traits: 825 });
    expect(xp.spent).toBe(2810);
    expect(xp.budget).toBe(5000);
    expect(xp.remaining).toBe(2190);
  });
});

describe("attributeXp", () => {
  it("counts only increases above the free base of 100", () => {
    expect(attributeXp({ STR: 100, BOD: 150 })).toBe(50);
  });

  it("treats missing attributes as the base (zero cost)", () => {
    expect(attributeXp({})).toBe(0);
  });

  it("never goes negative for below-base values", () => {
    expect(attributeXp({ STR: 80 })).toBe(0);
  });
});
