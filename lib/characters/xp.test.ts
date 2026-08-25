import { describe, expect, it } from "vitest";
import { parseBtcc } from "@/lib/btcc";
import { readFixture } from "@/lib/btcc/test-fixtures";
import { attributeXp, computeXp } from "./xp";

describe("computeXp", () => {
  const draft = parseBtcc(readFixture("lisa.btcc"));

  it("sums skills, traits, and attributes per the desktop formula", () => {
    // lisa: attributes 1505 (Σ value), skills 1280, traits 825.
    // gmxpmod is -30.
    // remaining = 5000 - 3610 - (-30) = 1420
    const xp = computeXp(draft);
    expect(xp.byCategory).toEqual({ attributes: 1505, skills: 1280, traits: 825 });
    expect(xp.spent).toBe(3610);
    expect(xp.budget).toBe(5000);
    expect(xp.remaining).toBe(1420);
  });

  it("incorporates gmxpmod into the remaining budget", () => {
    const customDraft = {
      ...draft,
      scalars: {
        ...draft.scalars,
        gmxpmod: 100,
      }
    };
    const xp = computeXp(customDraft);
    // spent is still 3610. 5000 - 3610 - 100 = 1290
    expect(xp.remaining).toBe(1290);
  });
});

describe("attributeXp", () => {
  it("charges the full attribute value", () => {
    expect(attributeXp({ STR: 100, BOD: 150 })).toBe(850);
  });

  it("treats missing attributes as the base (100 cost each), so an all-100 character consumes 800 XP", () => {
    expect(attributeXp({})).toBe(800);
  });

  it("charges full value for below-base values", () => {
    expect(attributeXp({ STR: 80 })).toBe(780);
  });
});
