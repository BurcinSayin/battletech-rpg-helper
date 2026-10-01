import { describe, it, expect } from "vitest";
import {
  traits,
  subtraits,
  findTrait,
  resolveTraitName,
  opposingTrait,
  traitsByCategory,
  compositeTraitNames,
  TRAIT_ALIASES,
  OPPOSING_TRAITS,
} from "./load";

describe("trait catalog and lookups", () => {
  it("contains exactly 56 canonical base traits", () => {
    expect(traits).toHaveLength(56);
    for (const t of traits) {
      expect(t.name).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.trait_type).toBeTruthy();
      expect(t.tp_score).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.page).toMatch(/^p\.\d+$/);
    }
  });

  it("resolves canonical traits directly", () => {
    const trait = findTrait("Combat Sense");
    expect(trait).toBeDefined();
    expect(trait?.name).toBe("Combat Sense");
    expect(trait?.tp_score).toBe("+4 TP");
    expect(trait?.page).toBe("p.110");
  });

  it("resolves legacy desktop aliases", () => {
    expect(TRAIT_ALIASES.Dependent).toBe("Dependents");
    expect(resolveTraitName("Dependent")).toBe("Dependents");
    expect(findTrait("Dependent")?.name).toBe("Dependents");

    expect(resolveTraitName("Except Attribute")).toBe("Exceptional Attribute");
    expect(findTrait("Except Attribute")?.name).toBe("Exceptional Attribute");

    expect(resolveTraitName("TDS")).toBe("TDS — Transit Disorientation Syndrome");
    expect(findTrait("TDS")?.name).toBe("TDS — Transit Disorientation Syndrome");

    expect(resolveTraitName("Transit Disorientation Syndrome")).toBe(
      "TDS — Transit Disorientation Syndrome",
    );
    expect(findTrait("Transit Disorientation Syndrome")?.name).toBe(
      "TDS — Transit Disorientation Syndrome",
    );

    expect(resolveTraitName("Vehicle")).toBe("Vehicle Level");
    expect(findTrait("Vehicle")?.name).toBe("Vehicle Level");
  });

  it("exposes known subtraits mapping and sub_traits on canonical traits", () => {
    expect(subtraits.Compulsion).toHaveLength(20);
    expect(subtraits.Compulsion).toContain("Berserker");
    expect(subtraits.Citizenship).toContain("Trueborn");
    expect(subtraits.Citizenship).toContain("Clan");
    expect(subtraits.Implant).toContain("EI Neural Implant");
    expect(subtraits.Title).toContain("Bloodname");

    const compulsion = findTrait("Compulsion");
    expect(compulsion?.sub_traits).toHaveLength(20);
    expect(compulsion?.sub_traits).toContain("Berserker");

    const ambidextrous = findTrait("Ambidextrous");
    expect(ambidextrous?.sub_traits).toEqual([]);
  });

  it("resolves composite sub-traits to parent trait definition", () => {
    const compulsionSub = findTrait("Compulsion/Berserker");
    expect(compulsionSub).toBeDefined();
    expect(compulsionSub?.name).toBe("Compulsion");
    expect(compulsionSub?.tp_score).toBe("–5 to –1 TP");

    // Alias in composite sub-trait
    const paranoidSub = findTrait("Compulsion/Paranoid");
    expect(paranoidSub).toBeDefined();
    expect(paranoidSub?.name).toBe("Compulsion");

    // Natural Aptitude composite
    const aptitudeSub = findTrait("Natural Aptitude/Protocol");
    expect(aptitudeSub).toBeDefined();
    expect(aptitudeSub?.name).toBe("Natural Aptitude");

    // Citizenship composite
    const citizenshipSub = findTrait("Citizenship/Inner Sphere");
    expect(citizenshipSub).toBeDefined();
    expect(citizenshipSub?.name).toBe("Citizenship/Trueborn");

    // Implant composite
    const implantSub = findTrait("Implant/EI Neural Implant");
    expect(implantSub).toBeDefined();
    expect(implantSub?.name).toBe("Implant/Prosthetic");

    // Title composite
    const titleSub = findTrait("Title/Clan");
    expect(titleSub).toBeDefined();
    expect(titleSub?.name).toBe("Title/Bloodname");
  });

  it("returns undefined for unknown trait names", () => {
    expect(findTrait("Totally Nonexistent Trait")).toBeUndefined();
    expect(findTrait("Fake/Subtrait")).toBeUndefined();
  });

  it("filters traits by category", () => {
    const identityTraits = traitsByCategory("Character (Identity)");
    expect(identityTraits.length).toBeGreaterThan(0);
    expect(identityTraits.map((t) => t.name)).toContain("Alternate ID");
    expect(identityTraits.map((t) => t.name)).toContain("Bloodmark");

    const vehicleTraits = traitsByCategory("Vehicle");
    expect(vehicleTraits.map((t) => t.name)).toContain("Custom Vehicle");
    expect(vehicleTraits.map((t) => t.name)).toContain("Vehicle Level");
  });

  it("identifies opposing traits", () => {
    expect(OPPOSING_TRAITS["Animal Empathy"]).toBe("Animal Antipathy");
    expect(opposingTrait("Animal Empathy")?.name).toBe("Animal Antipathy");
    expect(opposingTrait("Animal Antipathy")?.name).toBe("Animal Empathy");
    expect(opposingTrait("Attractive")?.name).toBe("Unattractive");
    expect(opposingTrait("Unattractive")?.name).toBe("Attractive");
    expect(opposingTrait("Combat Sense")?.name).toBe("Combat Paralysis");
    expect(opposingTrait("Combat Paralysis")?.name).toBe("Combat Sense");
    expect(opposingTrait("Fast Learner")?.name).toBe("Slow Learner");
    expect(opposingTrait("Slow Learner")?.name).toBe("Fast Learner");
    expect(opposingTrait("Fit")?.name).toBe("Handicap");
    expect(opposingTrait("Handicap")?.name).toBe("Fit");
    expect(opposingTrait("Glass Jaw")?.name).toBe("Toughness");
    expect(opposingTrait("Toughness")?.name).toBe("Glass Jaw");
    expect(opposingTrait("Good Hearing")?.name).toBe("Poor Hearing");
    expect(opposingTrait("Poor Hearing")?.name).toBe("Good Hearing");
    expect(opposingTrait("Good Vision")?.name).toBe("Poor Vision");
    expect(opposingTrait("Poor Vision")?.name).toBe("Good Vision");
    expect(opposingTrait("Gregarious")?.name).toBe("Introvert");
    expect(opposingTrait("Introvert")?.name).toBe("Gregarious");
    expect(opposingTrait("Gremlins")?.name).toBe("Tech Empathy");
    expect(opposingTrait("Tech Empathy")?.name).toBe("Gremlins");
    expect(opposingTrait("Impatient")?.name).toBe("Patient");
    expect(opposingTrait("Patient")?.name).toBe("Impatient");
    expect(opposingTrait("Thick-Skinned")?.name).toBe("Thin-Skinned");
    expect(opposingTrait("Thin-Skinned")?.name).toBe("Thick-Skinned");

    // Trait without an opposing pair
    expect(opposingTrait("Ambidextrous")).toBeUndefined();
  });

  it("builds composite trait names for all subtraits", () => {
    const composites = compositeTraitNames();
    expect(composites.length).toBeGreaterThan(20);
    expect(composites).toContain("Compulsion/Berserker");
    expect(composites).toContain("Compulsion/Smoking");
    expect(composites).toContain("Citizenship/Clan");
    expect(composites).toContain("Natural Aptitude/Computers");
  });
});
