import { describe, it, expect } from "vitest";
import {
  skills,
  traits,
  subskills,
  affiliations,
  careers,
  eyeColors,
  hairColors,
  phenotypes,
  planets,
  compositeSkillNames,
} from "./load";
import {
  skillsSchema,
  traitsSchema,
  subskillsSchema,
  stringListSchema,
} from "@/lib/validation/catalog";
import { parseBtcc } from "@/lib/btcc";
import { readFixture } from "@/lib/btcc/test-fixtures";

describe("rules catalog", () => {
  it("validates against zod schemas", () => {
    expect(() => skillsSchema.parse(skills)).not.toThrow();
    expect(() => traitsSchema.parse(traits)).not.toThrow();
    expect(() => subskillsSchema.parse(subskills)).not.toThrow();
    for (const list of [
      affiliations,
      careers,
      eyeColors,
      hairColors,
      phenotypes,
      planets,
    ]) {
      expect(() => stringListSchema.parse(list)).not.toThrow();
    }
  });

  it("has the expected catalog sizes", () => {
    expect(skills).toHaveLength(92);
    expect(traits).toHaveLength(76);
    expect(affiliations).toHaveLength(13);
    expect(careers).toHaveLength(26);
  });

  it("parses skill metadata correctly", () => {
    const gunnery = skills.find((s) => s.name === "Gunnery/'Mech");
    expect(gunnery).toEqual({
      name: "Gunnery/'Mech",
      attributes: "RFL+DEX",
      cost: 8,
      category: "SA",
    });
    // The one row with a stray space ("INT, 8/CB") trims cleanly.
    const appraisal = skills.find((s) => s.name === "Appraisal");
    expect(appraisal?.cost).toBe(8);
    expect(appraisal?.attributes).toBe("INT");
  });

  it("includes known traits", () => {
    expect(traits.map((t) => t.name)).toContain("Combat Sense");
  });

  it("builds composite skill names from subskills", () => {
    const composites = compositeSkillNames();
    expect(composites).toContain("Animal Handling/Riding");
    expect(composites).toContain("Gunnery/Aerospace");
  });

  // The .btcc files contain version-drifted / hand-edited skill names (e.g. the
  // backtick "Gunnery/`Mech" in lisa.btcc, singular "Interest"). Import is
  // designed to WARN on unknowns rather than hard-fail (PLAN.md), so this is a
  // coverage guard on the converter, not a strict membership assertion.
  it("resolves the vast majority of app-generated skill names", () => {
    const known = new Set<string>([
      ...skills.map((s) => s.name),
      ...compositeSkillNames(),
    ]);
    const used = parseBtcc(readFixture("newchar.btcc")).skills.map(
      (s) => s.name,
    );
    const resolved = used.filter((n) => known.has(n));
    expect(resolved.length / used.length).toBeGreaterThan(0.9);
  });
});
