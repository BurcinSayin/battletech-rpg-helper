import { describe, it, expect } from "vitest";
import {
  skills,
  traits,
  subskills,
  subtraits,
  affiliations,
  careers,
  eyeColors,
  hairColors,
  phenotypes,
  planets,
  compositeSkillNames,
  compositeTraitNames,
  findTrait,
  resolveTraitName,
  opposingTrait,
  stage0Catalog,
} from "./load";
import {
  skillsSchema,
  traitsSchema,
  subskillsSchema,
  subtraitsSchema,
  stringListSchema,
  stage0CatalogSchema,
} from "@/lib/validation/catalog";
import { parseBtcc } from "@/lib/btcc";
import { readFixture } from "@/lib/btcc/test-fixtures";
import modulesJson from "@/data/rules/modules.json";
import { parseChildhoodCatalog } from "@/lib/validation/childhood";

describe("rules catalog", () => {
  it("validates against zod schemas", () => {
    expect(() => skillsSchema.parse(skills)).not.toThrow();
    expect(() => traitsSchema.parse(traits)).not.toThrow();
    expect(() => subskillsSchema.parse(subskills)).not.toThrow();
    expect(() => subtraitsSchema.parse(subtraits)).not.toThrow();
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
    expect(traits).toHaveLength(56);
    expect(affiliations).toHaveLength(13);
    expect(careers).toHaveLength(26);
  });

  it("preserves the generated Stage 1-4 module and gating inventory", () => {
    // Given: the committed pre-Stage-0 generated catalog.
    const stageCounts = modulesJson.modules.reduce<Record<string, number>>(
      (counts, module) => ({
        ...counts,
        [module.stage]: (counts[module.stage] ?? 0) + 1,
      }),
      {},
    );

    // When: its existing module and gating inventories are observed.
    const inventory = {
      modules: modulesJson.modules.length,
      stageCounts,
    };

    // Then: the established Stage 1-4 contract remains unchanged.
    expect(inventory).toEqual({
      modules: 115,
      stageCounts: { 1: 11, 2: 13, 3: 66, 4: 25 },
    });
  });

  it("exposes a validated Stage 0 catalog through the rules boundary", () => {
    // Given: generated Stage 0 data is an external catalog boundary.
    // When: application code enters through the validation and load modules.
    const parsed = stage0CatalogSchema.parse(modulesJson.stage0);

    // Then: the statically loaded catalog is the validated generated value.
    expect(stage0Catalog).toEqual(parsed);
  });

  it("preserves Stage 0 source order, provenance, and Clan applicability", () => {
    // Given: the pinned generated Stage 0 catalog.
    const expectedNames = [
      "Federated Suns",
      "Cappelan Confederation",
      "Draconis Combine",
      "Free Worlds League",
      "Lyran Alliance",
      "Free Rasalhague Republic",
      "Minor Periphery",
      "Major Periphery State",
      "Deep Periphery",
      "Invading Clan",
      "Homeworld Clan",
      "Terran",
      "Independent",
    ];

    // When: affiliation identity and source metadata are projected.
    const identities = stage0Catalog.affiliations.map(({ id, name }) => ({
      id,
      name,
    }));

    // Then: source ordering, full revision, read files, and Clan gates are explicit.
    expect(identities).toEqual(expectedNames.map((name, id) => ({ id, name })));
    expect(identities.map(({ name }) => name)).toEqual(
      modulesJson.meta.affiliations,
    );
    expect(modulesJson.meta.source.rev).toBe(
      "a1d800982b2b0659aa230ca8fc8882750a2c350d",
    );
    expect(Object.keys(modulesJson.meta.source.files)).toEqual(
      expect.arrayContaining([
        "stage1_resurce.cpp",
        "stage2_resurce.cpp",
        "stage3_resurce.cpp",
        "stage4_resurce.cpp",
        "text_resurce.cpp",
        "wizard.cpp",
        "s0moredialog.cpp",
        "resource/affilations.dat",
        "s1moredialog.cpp",
        "s2advdialog.cpp",
        "s2flexxpdialog.cpp",
        "s2clanfielddialog.cpp",
      ]),
    );
    expect(
      stage0Catalog.affiliations.map(({ casteRequired }) => casteRequired),
    ).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(stage0Catalog.affiliations[9]?.castes.length).toBeGreaterThan(0);
    expect(stage0Catalog.affiliations[10]?.castes.length).toBeGreaterThan(0);
  });

  it("provides fulfillable candidates for every required Stage 0 choice", () => {
    // Given: every layer that can contribute a required Stage 0 choice.
    const layers = [
      ...stage0Catalog.affiliations.flatMap((affiliation) => [
        affiliation.base,
        ...affiliation.subAffiliations.map(({ layer }) => layer),
      ]),
      ...stage0Catalog.castes.map(({ layer }) => layer),
      ...stage0Catalog.overlays.flatMap(({ base, layer }) => [base, layer]),
    ];

    // When: all generated choices are collected.
    const choices = layers.flatMap(({ choices: layerChoices }) => layerChoices);

    // Then: every required selection has concrete candidates and a valid count.
    expect(choices).toHaveLength(157);
    expect(choices.every(({ candidates }) => candidates.length > 0)).toBe(true);
    expect(
      choices.every(
        ({ candidates, selectionCount }) =>
          selectionCount > 0 && selectionCount <= candidates.length,
      ),
    ).toBe(true);
  });

  it("reports a path-specific error for a foreign sub-affiliation relationship", () => {
    // Given: one sub-affiliation points at a foreign affiliation id.
    const malformed = {
      ...stage0Catalog,
      affiliations: stage0Catalog.affiliations.map((affiliation, index) =>
        index === 0
          ? {
              ...affiliation,
              subAffiliations: affiliation.subAffiliations.map(
                (subAffiliation, subIndex) =>
                  subIndex === 0
                    ? { ...subAffiliation, affiliationId: affiliation.id + 1 }
                    : subAffiliation,
              ),
            }
          : affiliation,
      ),
    };

    // When: the malformed object crosses the catalog boundary.
    const result = stage0CatalogSchema.safeParse(malformed);

    // Then: Zod identifies the exact invalid relationship field.
    expect(result).toMatchObject({
      success: false,
      error: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: ["affiliations", 0, "subAffiliations", 0, "affiliationId"],
          }),
        ]),
      },
    });
  });

  it("rejects childhood gates referencing unknown modules and affiliations", () => {
    const gate = modulesJson.childhood.gates[0];
    expect(() =>
      parseChildhoodCatalog(
        {
          ...modulesJson.childhood,
          gates: [{ ...gate, modules: ["Missing module"] }],
        },
        stage0Catalog,
      ),
    ).toThrow(/Unknown gate module/);
    expect(() =>
      parseChildhoodCatalog(
        {
          ...modulesJson.childhood,
          gates: [{ ...gate, when: { affiliations: ["Missing affiliation"] } }],
        },
        stage0Catalog,
      ),
    ).toThrow(/Unknown gate affiliation/);
  });

  it("rejects malformed fixed grants and cross-catalog caste joins", () => {
    const ruleModule = modulesJson.childhood.modules[0];
    expect(() =>
      parseChildhoodCatalog(
        {
          ...modulesJson.childhood,
          modules: [
            {
              ...ruleModule,
              layer: { ...ruleModule.layer, attrDeltas: { UNKNOWN: 10 } },
            },
          ],
        },
        stage0Catalog,
      ),
    ).toThrow(/Unknown attribute/);
    expect(() =>
      parseChildhoodCatalog(
        {
          ...modulesJson.childhood,
          modules: modulesJson.childhood.modules.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  casteLayers: [{ caste: "Missing caste", layer: entry.layer }],
                }
              : entry,
          ),
        },
        stage0Catalog,
      ),
    ).toThrow(/Unknown caste/);
  });

  it("parses skill metadata correctly", () => {
    const gunnery = skills.find((s) => s.name === "Gunnery/'Mech");
    expect(gunnery).toEqual({
      name: "Gunnery/'Mech",
      attributes: "RFL+DEX",
      targetNumber: 8,
      category: "SA",
    });
    // The one row with a stray space ("INT, 8/CB") trims cleanly.
    const appraisal = skills.find((s) => s.name === "Appraisal");
    expect(appraisal?.targetNumber).toBe(8);
    expect(appraisal?.attributes).toBe("INT");
  });

  it("includes known traits with rich metadata", () => {
    const combatSense = traits.find((t) => t.name === "Combat Sense");
    expect(combatSense).toBeDefined();
    expect(combatSense).toMatchObject({
      name: "Combat Sense",
      category: "Character",
      trait_type: "Positive, Opposed",
      tp_score: "+4 TP",
      page: "p.110",
    });
    expect(combatSense?.description).toContain("Combat Sense");

    // Canonical traits present
    const names = new Set(traits.map((t) => t.name));
    expect(names.has("Compulsion")).toBe(true);
    expect(names.has("Dependents")).toBe(true);
    expect(names.has("Exceptional Attribute")).toBe(true);
    expect(names.has("TDS — Transit Disorientation Syndrome")).toBe(true);
    expect(names.has("Vehicle Level")).toBe(true);

    // Duplicate removed
    expect(traits.filter((t) => t.name === "Thin-Skinned")).toHaveLength(1);
  });

  it("builds composite trait names from subtraits", () => {
    expect(subtraits.Compulsion).toContain("Berserker");
    expect(subtraits.Compulsion).toHaveLength(20);
    const composites = compositeTraitNames();
    expect(composites).toContain("Compulsion/Berserker");
    expect(composites).toContain("Compulsion/Paranoia");
    expect(composites).toContain("Citizenship/Trueborn");
  });

  it("resolves legacy trait aliases and composite sub-traits", () => {
    expect(resolveTraitName("Dependent")).toBe("Dependents");
    expect(resolveTraitName("Except Attribute")).toBe("Exceptional Attribute");
    expect(resolveTraitName("TDS")).toBe("TDS — Transit Disorientation Syndrome");
    expect(resolveTraitName("Vehicle")).toBe("Vehicle Level");
    expect(resolveTraitName("Compulsion/Paranoid")).toBe("Compulsion/Paranoia");

    // findTrait looks up directly, by alias, and falls back to parent for sub-traits
    expect(findTrait("Dependents")?.name).toBe("Dependents");
    expect(findTrait("Dependent")?.name).toBe("Dependents");
    expect(findTrait("Except Attribute")?.name).toBe("Exceptional Attribute");
    expect(findTrait("Compulsion/Berserker")?.name).toBe("Compulsion");
    expect(findTrait("Compulsion/Paranoid")?.name).toBe("Compulsion");
  });

  it("identifies opposing trait pairs", () => {
    expect(opposingTrait("Animal Empathy")?.name).toBe("Animal Antipathy");
    expect(opposingTrait("Animal Antipathy")?.name).toBe("Animal Empathy");
    expect(opposingTrait("Attractive")?.name).toBe("Unattractive");
    expect(opposingTrait("Combat Sense")?.name).toBe("Combat Paralysis");
    expect(opposingTrait("Fast Learner")?.name).toBe("Slow Learner");
    expect(opposingTrait("Thick-Skinned")?.name).toBe("Thin-Skinned");
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
