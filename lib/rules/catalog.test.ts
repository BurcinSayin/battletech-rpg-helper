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
  stage0Catalog,
} from "./load";
import {
  skillsSchema,
  traitsSchema,
  subskillsSchema,
  stringListSchema,
  stage0CatalogSchema,
} from "@/lib/validation/catalog";
import { parseBtcc } from "@/lib/btcc";
import { readFixture } from "@/lib/btcc/test-fixtures";
import modulesJson from "@/data/rules/modules.json";

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
      gating: modulesJson.gating.length,
    };

    // Then: the established Stage 1-4 contract remains unchanged.
    expect(inventory).toEqual({
      modules: 115,
      stageCounts: { 1: 11, 2: 13, 3: 66, 4: 25 },
      gating: 71,
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
    expect(identities).toEqual(
      expectedNames.map((name, id) => ({ id, name })),
    );
    expect(identities.map(({ name }) => name)).toEqual(
      modulesJson.meta.affiliations,
    );
    expect(modulesJson.meta.source.rev).toBe(
      "a1d800982b2b0659aa230ca8fc8882750a2c350d",
    );
    expect(Object.keys(modulesJson.meta.source.files)).toEqual([
      "stage1_resurce.cpp",
      "stage2_resurce.cpp",
      "stage3_resurce.cpp",
      "stage4_resurce.cpp",
      "text_resurce.cpp",
      "wizard.cpp",
      "s0moredialog.cpp",
      "resource/affilations.dat",
    ]);
    expect(stage0Catalog.affiliations.map(({ casteRequired }) => casteRequired)).toEqual([
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
