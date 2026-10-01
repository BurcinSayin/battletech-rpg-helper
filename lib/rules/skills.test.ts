import { describe, it, expect } from "vitest";
import {
  skills,
  subskills,
  findSkill,
  resolveSkillName,
  defaultSubskill,
  tieredSkills,
  compositeSkillNames,
  SKILL_ALIASES,
} from "./load";
import { skillComplexity } from "./skill-complexity";

describe("skill catalog and lookups", () => {
  it("contains exactly 51 canonical base skills", () => {
    expect(skills).toHaveLength(51);
    for (const s of skills) {
      expect(s.name).toBeTruthy();
      expect(s.attributes).toBeTruthy();
      expect(s.targetNumber).toBeGreaterThanOrEqual(7);
      expect(["SB", "CB", "SA", "CA"]).toContain(s.category);
      expect(s.description).toBeTruthy();
      expect(s.page).toMatch(/^p\.\d+$/);
      expect(Array.isArray(s.subskills)).toBe(true);
      expect(typeof s.tiered).toBe("boolean");
    }

    const medTech = findSkill("MedTech")!;
    expect(medTech.alias_list).toEqual(["Medtech"]);
    expect(medTech.default_sub).toBe("General");

    const interest = findSkill("Interest")!;
    expect(interest.alias_list).toEqual(["Interests"]);
    expect(interest.default_sub).toBeUndefined();

    const surgery = findSkill("Surgery")!;
    expect(surgery.default_sub).toBe("General");
  });

  it("supports tiered skills with Basic and Advanced tiers", () => {
    const tiered = tieredSkills();
    expect(tiered).toHaveLength(6);
    const tieredNames = tiered.map((s) => s.name).sort();
    expect(tieredNames).toEqual([
      "Art",
      "Computers",
      "Interest",
      "Martial Arts",
      "Melee Weapons",
      "Prestidigitation",
    ]);

    const art = findSkill("Art")!;
    expect(art).toBeDefined();
    expect(art.tiered).toBe(true);
    expect(art.attributes).toBe("DEX");
    expect(art.targetNumber).toBe(8);
    expect(art.category).toBe("CB");
    expect(art.advanced).toEqual({
      attributes: "DEX+INT",
      targetNumber: 9,
      category: "CA",
    });

    const computers = findSkill("Computers")!;
    expect(computers.tiered).toBe(true);
    expect(computers.attributes).toBe("INT");
    expect(computers.targetNumber).toBe(8);
    expect(computers.category).toBe("CB");
    expect(computers.advanced).toEqual({
      attributes: "DEX+INT",
      targetNumber: 9,
      category: "CA",
    });

    const interest = findSkill("Interest")!;
    expect(interest.tiered).toBe(true);
    expect(interest.attributes).toBe("INT");
    expect(interest.targetNumber).toBe(8);
    expect(interest.category).toBe("CB");
    expect(interest.advanced).toEqual({
      attributes: "INT+WIL",
      targetNumber: 9,
      category: "CA",
    });

    const martialArts = findSkill("Martial Arts")!;
    expect(martialArts.tiered).toBe(true);
    expect(martialArts.attributes).toBe("RFL");
    expect(martialArts.targetNumber).toBe(7);
    expect(martialArts.category).toBe("SB");
    expect(martialArts.advanced).toEqual({
      attributes: "RFL+DEX",
      targetNumber: 8,
      category: "SA",
    });

    const meleeWeapons = findSkill("Melee Weapons")!;
    expect(meleeWeapons.tiered).toBe(true);
    expect(meleeWeapons.attributes).toBe("DEX");
    expect(meleeWeapons.targetNumber).toBe(7);
    expect(meleeWeapons.category).toBe("SB");
    expect(meleeWeapons.advanced).toEqual({
      attributes: "RFL+DEX",
      targetNumber: 8,
      category: "SA",
    });

    const prestidigitation = findSkill("Prestidigitation")!;
    expect(prestidigitation.tiered).toBe(true);
    expect(prestidigitation.attributes).toBe("DEX");
    expect(prestidigitation.targetNumber).toBe(7);
    expect(prestidigitation.category).toBe("SB");
    expect(prestidigitation.advanced).toEqual({
      attributes: "RFL+DEX",
      targetNumber: 8,
      category: "SA",
    });
  });

  it("resolves Disguise with correct Simple-Basic (7 / SB) rulebook stats", () => {
    const disguise = findSkill("Disguise")!;
    expect(disguise).toBeDefined();
    expect(disguise.targetNumber).toBe(7);
    expect(disguise.category).toBe("SB");
    expect(disguise.attributes).toBe("CHA");
  });

  it("resolves legacy desktop aliases and default subskills", () => {
    expect(SKILL_ALIASES.Interests).toBe("Interest");
    expect(resolveSkillName("Interests")).toBe("Interest");
    expect(findSkill("Interests")?.name).toBe("Interest");

    expect(SKILL_ALIASES.Medtech).toBe("MedTech");
    expect(resolveSkillName("Medtech")).toBe("MedTech/General");
    expect(resolveSkillName("MedTech")).toBe("MedTech/General");
    expect(resolveSkillName("Surgery")).toBe("Surgery/General");
    expect(findSkill("Medtech")?.name).toBe("MedTech");
    expect(findSkill("MedTech")?.name).toBe("MedTech");
    expect(findSkill("Surgery")?.name).toBe("Surgery");

    expect(defaultSubskill("MedTech")).toBe("General");
    expect(defaultSubskill("Medtech")).toBe("General");
    expect(defaultSubskill("Surgery")).toBe("General");
    expect(defaultSubskill("Interest")).toBeUndefined();
    expect(defaultSubskill("Acting")).toBeUndefined();

    expect(resolveSkillName("Gunnery/`Mech")).toBe("Gunnery/'Mech");
    expect(findSkill("Gunnery/`Mech")?.name).toBe("Gunnery");

    expect(resolveSkillName("Piloting/`Mech")).toBe("Piloting/'Mech");
    expect(findSkill("Piloting/`Mech")?.name).toBe("Piloting");

    expect(resolveSkillName("Technician/Jet")).toBe("Technician/Jets");
    expect(findSkill("Technician/Jet")?.name).toBe("Technician");
  });

  it("findSkill handles direct, alias, and composite parent fallback", () => {
    expect(findSkill("Interest")?.name).toBe("Interest");
    expect(findSkill("Interests")?.name).toBe("Interest");
    expect(findSkill("Interests/BattleMechs")?.name).toBe("Interest");
    expect(findSkill("Interest/BattleMechs")?.name).toBe("Interest");
    expect(findSkill("Medtech/General")?.name).toBe("MedTech");
    expect(findSkill("MedTech/General")?.name).toBe("MedTech");
    expect(findSkill("Gunnery/'Mech")?.name).toBe("Gunnery");
    expect(findSkill("Acrobatics/Free-Fall")?.name).toBe("Acrobatics");
    expect(findSkill("NonExistentSkill")).toBeUndefined();
    expect(findSkill("constructor")).toBeUndefined();
  });

  it("skillComplexity resolves tiered and non-tiered skills across levels", () => {
    expect(skillComplexity("Acting", 1)).toBe("CB");
    expect(skillComplexity("Career/Soldier", 3)).toBe("SB");
    expect(skillComplexity("Technician/BattleMech", 4)).toBe("CA");

    // Tiered skill advances at level 4
    expect(skillComplexity("Art", 3)).toBe("CB");
    expect(skillComplexity("Art", 4)).toBe("CA");

    expect(skillComplexity("Martial Arts", 3)).toBe("SB");
    expect(skillComplexity("Martial Arts", 4)).toBe("SA");

    expect(skillComplexity("Interest/BattleMechs", 2)).toBe("CB");
    expect(skillComplexity("Interest/BattleMechs", 4)).toBe("CA");

    // Aliases resolve complexity properly
    expect(skillComplexity("Interests/BattleMechs", 2)).toBe("CB");
    expect(skillComplexity("Interests/BattleMechs", 5)).toBe("CA");
    expect(skillComplexity("Medtech/General", 2)).toBe("SB");
    expect(skillComplexity("MedTech/General", 2)).toBe("SB");

    // Unknown or custom skills
    expect(skillComplexity("Custom skill", 2)).toBeUndefined();
    expect(skillComplexity("constructor", 2)).toBeUndefined();
  });

  it("reconciles subskills and builds composite skill names", () => {
    expect(subskills.Acrobatics).toContain("Free-Fall");
    expect(subskills.Acrobatics).toContain("Gymnastics");

    expect(subskills.MedTech).toContain("General");
    expect(subskills.MedTech).toContain("Veterinary");
    expect(subskills.Medtech).toContain("General");

    expect(subskills.Gunnery).toContain("'Mech");
    expect(subskills.Piloting).toContain("'Mech");

    const composites = compositeSkillNames();
    expect(composites).toContain("Acrobatics/Free-Fall");
    expect(composites).toContain("Acrobatics/Gymnastics");
    expect(composites).toContain("MedTech/General");
    expect(composites).toContain("Medtech/General");
    expect(composites).toContain("Gunnery/'Mech");
    expect(composites).toContain("Piloting/'Mech");
  });
});
