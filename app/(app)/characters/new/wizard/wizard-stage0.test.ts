import { describe, it, expect } from "vitest";
import { emptyDraft } from "@/lib/btcc";
import { computeXp } from "@/lib/characters";
import type { Stage0Catalog, Stage0Layer, Stage0Choice } from "@/lib/rules/stage0-contract";
import { initializeWizardDraft, rebuildStage0, type Stage0Selection } from "./wizard-stage0";
import { stage0Catalog } from "@/lib/rules/load";

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const source = { file: "fixture", line: 1 };
const layer: Stage0Layer = { attrDeltas: {}, skillGrants: [], traitGrants: [], prerequisites: { attrs: {}, skills: [], traits: [] }, choices: [], source };
const english = { kind: "skill", value: "Language/English" } as const;
const french = { kind: "skill", value: "Language/French" } as const;
const pick: Stage0Choice = { id: "affElem1", label: "Languages", candidates: [english, french], xp: 15, selectionCount: 2, unique: true, candidateSelection: { mode: "all" }, source };
const catalog: Stage0Catalog = freeze({
  affiliations: [
    { id: 7, name: "Major Periphery State", xpCost: 75, startingLanguages: { mode: "base", candidates: ["Language/English"], source }, casteRequired: false, castes: [], base: { ...layer, traitGrants: [{ name: "Equipped", xp: -50 }] }, subAffiliations: [{ id: 0, affiliationId: 7, name: "None", layer, startingLanguages: null, castes: null, source }], source },
    { id: 9, name: "Clan", xpCost: 100, startingLanguages: { mode: "base", candidates: ["Language/English"], source }, casteRequired: true, castes: ["Scientist", "Worker"], base: layer, subAffiliations: [{ id: 0, affiliationId: 9, name: "Wolf", layer, startingLanguages: null, castes: ["Scientist"], source }], source },
    { id: 11, name: "Terran", xpCost: 200, startingLanguages: { mode: "base", candidates: ["Language/English"], source }, casteRequired: false, castes: [], base: { ...layer, attrDeltas: { EDG: -150 }, choices: [pick], skillGrants: [{ name: "Zeta", xp: 10 }, { name: "Erase", xp: 10 }], prerequisites: { attrs: { INT: 200 }, skills: [{ name: "Science", xp: 30 }], traits: [{ name: "Rank", xp: 100 }] } }, subAffiliations: [{ id: 1, affiliationId: 11, name: "Martian", startingLanguages: null, castes: null, source, layer: { ...layer, skillGrants: [{ name: "Erase", xp: -10 }, { name: "Alpha", xp: 5 }, { name: "Zeta", xp: 5 }], prerequisites: { attrs: { INT: 100, WIL: 150 }, skills: [{ name: "Science", xp: 50 }], traits: [{ name: "Rank", xp: 50 }] }, choices: [{ ...pick, id: "penalty", xp: -5, selectionCount: 1, candidates: [english], candidateSelection: { mode: "includeSelected", references: [{ scope: "base", choiceId: "affElem1" }] } }, { ...pick, id: "other", xp: 5, selectionCount: 1, candidateSelection: { mode: "excludeSelected", references: [{ scope: "layer", choiceId: "penalty" }, { scope: "startingLanguage" }] } }] } }], source },
  ],
  castes: [{ name: "Scientist", layer: { ...layer, choices: [pick], traitGrants: [{ name: "Caste", xp: 20 }] } }, { name: "Worker", layer }], overlays: [],
});
const baseline = freeze({ characterName: "Intro name" });
const major: Stage0Selection = freeze({ affiliationId: 7, subAffiliationId: 0, casteId: null, startingLanguage: "Language/English", choices: [] });
const clan: Stage0Selection = freeze({ ...major, affiliationId: 9, casteId: "Scientist", choices: [{ layer: "caste", choiceId: "affElem1", candidates: [english, french] }] });
const terran: Stage0Selection = freeze({ ...major, affiliationId: 11, subAffiliationId: 1, choices: [{ layer: "base", choiceId: "affElem1", candidates: [english, french] }, { layer: "subAffiliation", choiceId: "penalty", candidates: [english] }, { layer: "subAffiliation", choiceId: "other", candidates: [french] }] });

describe("Stage 0 characterization", () => {
  it("charges full attribute values when the shared draft has no explicit attributes", () => {
    // Given the unchanged shared initializer.
    const draft = emptyDraft();
    // When valued by the existing authority.
    const xp = computeXp(draft);
    // Then missing attributes cost their full baseline, without wizard grants.
    expect(draft.attrs).toEqual({});
    expect(draft.skills).toEqual([]);
    expect(xp.spent).toBe(800);
    expect(xp.remaining).toBe(4200);
  });
});

describe("immutable Stage 0", () => {
  it("initializes explicit attributes and one language when given Intro state", () => {
    // Given / When
    const draft = initializeWizardDraft(baseline, "Language/English");
    // Then
    expect(draft.attrs).toEqual({ STR: 100, BOD: 100, RFL: 100, DEX: 100, INT: 100, WIL: 100, CHA: 100, EDG: 100 });
    expect(draft.scalars.name).toBe("Intro name");
    expect(draft.skills).toEqual([{ name: "Perception", xp: 10 }, { name: "Language/English", xp: 20 }]);
    expect(initializeWizardDraft(baseline).skills).toEqual([{ name: "Perception", xp: 10 }]);
  });
  it("keeps the literal Major Periphery oracle in separate ledgers when complete", () => {
    // Given / When
    const result = rebuildStage0(baseline, catalog, major);
    // Then
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new TypeError(result.status);
    expect(result.xp.spent).toBe(780);
    expect(result.xp.remaining).toBe(4220);
    expect(result.moduleXpSpent).toBe(75);
    expect(result.wizardXpRemaining).toBe(4925);
    expect(result.draft.skills).toEqual([{ name: "Perception", xp: 10 }, { name: "Language/English", xp: 20 }]);
    expect(result.draft.scalars).toMatchObject({ name: "Intro name", aff: "Major Periphery State", subaff: "None", clancaste: "", gmxpmod: 0 });
  });
  it("rebuilds idempotently and removes caste effects when an ancestor is replaced", () => {
    // Given
    const previous = freeze(rebuildStage0(baseline, catalog, clan));
    const snapshot = structuredClone(previous);
    // When
    const replacement = rebuildStage0(baseline, catalog, major);
    // Then
    expect(previous).toEqual(snapshot);
    expect(replacement).toEqual(rebuildStage0(baseline, catalog, major));
    expect(previous.status).toBe("complete");
    if (replacement.status !== "complete") throw new TypeError(replacement.status);
    expect(replacement.draft.traits).toEqual([{ name: "Equipped", xp: -50 }]);
    expect(replacement.draft.scalars.clancaste).toBe("");
  });
  it("preserves signed Terran deltas, source order and maximum prerequisites when choices complete", () => {
    // Given / When
    const result = rebuildStage0(baseline, catalog, terran);
    // Then
    if (result.status !== "complete") throw new TypeError(result.status);
    expect(result.draft.attrs.EDG).toBe(-50);
    expect(result.draft.skills).toEqual([{ name: "Perception", xp: 10 }, { name: "Language/English", xp: 30 }, { name: "Zeta", xp: 15 }, { name: "Language/French", xp: 20 }, { name: "Alpha", xp: 5 }]);
    expect(result.draft.preAttrs).toEqual({ INT: 200, WIL: 150 });
    expect(result.draft.preSkills).toEqual([{ name: "Science", xp: 50 }]);
    expect(result.draft.preTraits).toEqual([{ name: "Rank", xp: 100 }]);
  });
  it.each<{ selection: Stage0Selection; status: string; reason: string }>([
    { selection: { ...major, affiliationId: null }, status: "incomplete", reason: "affiliation" },
    { selection: { ...major, affiliationId: 99 }, status: "invalid", reason: "affiliation" },
    { selection: { ...major, subAffiliationId: null }, status: "incomplete", reason: "subAffiliation" },
    { selection: { ...major, subAffiliationId: 1 }, status: "invalid", reason: "subAffiliation" },
    { selection: { ...major, startingLanguage: null }, status: "incomplete", reason: "startingLanguage" },
    { selection: { ...major, startingLanguage: "Language/French" }, status: "invalid", reason: "startingLanguage" },
    { selection: { ...major, casteId: "Scientist" }, status: "invalid", reason: "caste" },
    { selection: { ...clan, casteId: null }, status: "incomplete", reason: "caste" },
    { selection: { ...clan, casteId: "Worker" }, status: "invalid", reason: "caste" },
    { selection: { ...clan, choices: [] }, status: "incomplete", reason: "choiceCount" },
    { selection: { ...clan, choices: [{ layer: "caste", choiceId: "affElem1", candidates: [english, english] }] }, status: "incomplete", reason: "duplicateCandidate" },
    { selection: { ...clan, choices: [{ layer: "caste", choiceId: "affElem1", candidates: [english] }] }, status: "incomplete", reason: "choiceCount" },
    { selection: { ...clan, choices: [{ layer: "caste", choiceId: "affElem1", candidates: [english, french, english] }] }, status: "invalid", reason: "choiceCount" },
    { selection: { ...clan, choices: [{ layer: "caste", choiceId: "affElem1", candidates: [english, { kind: "trait", value: french.value }] }] }, status: "invalid", reason: "candidate" },
    { selection: { ...major, choices: clan.choices }, status: "invalid", reason: "choice" },
    { selection: { ...clan, choices: [...clan.choices, ...clan.choices] }, status: "invalid", reason: "choice" },
    { selection: { ...terran, choices: [...terran.choices.slice(0, 2), { layer: "subAffiliation", choiceId: "other", candidates: [english] }] }, status: "invalid", reason: "candidate" },
  ])("returns $status/$reason with frozen inputs when selection is $selection", ({ selection, status, reason }) => {
    // Given
    const inputs = freeze({ baseline, catalog, selection });
    const snapshot = structuredClone(inputs);
    // When
    const result = rebuildStage0(inputs.baseline, inputs.catalog, inputs.selection);
    // Then
    expect(result).toMatchObject({ status, reason });
    expect(result).not.toHaveProperty("draft");
    expect(inputs).toEqual(snapshot);
  });
  it("replaces includeSelected literals when the prior pick is not a literal candidate", () => {
    // Given
    const selection = freeze({ ...terran, choices: [...terran.choices.slice(0, 1), { layer: "subAffiliation", choiceId: "penalty", candidates: [french] }, { layer: "subAffiliation", choiceId: "other", candidates: [] }] } satisfies Stage0Selection);
    // When
    const result = rebuildStage0(baseline, catalog, selection);
    // Then the French penalty was accepted before the incomplete next slot.
    expect(result).toEqual({ status: "incomplete", reason: "choiceCount" });
  });
  it("applies mixed-kind choices and keeps first insertion order across zero when source layers cancel grants", () => {
    // Given
    const mixed = [{ kind: "attribute", value: "EDG" }, { kind: "trait", value: "Echo" }, { kind: "skill", value: "Echo" }] as const;
    const custom: Stage0Catalog = freeze({ ...catalog, affiliations: catalog.affiliations.map((aff) => ({ ...aff, base: { ...layer, traitGrants: [{ name: "Echo", xp: 10 }, { name: "Gone", xp: 10 }, { name: "Later", xp: 5 }], choices: [{ ...pick, candidates: mixed, selectionCount: 3, xp: -10 }] }, subAffiliations: aff.subAffiliations.map((sub) => ({ ...sub, layer: { ...layer, traitGrants: [{ name: "Gone", xp: -10 }, { name: "Echo", xp: 20 }] } })) })) });
    const selection = freeze({ ...major, choices: [{ layer: "base", choiceId: "affElem1", candidates: mixed }] } satisfies Stage0Selection);
    // When
    const result = rebuildStage0(baseline, custom, selection);
    // Then
    if (result.status !== "complete") throw new TypeError(result.status);
    expect(result.draft.attrs.EDG).toBe(90);
    expect(result.draft.traits).toEqual([{ name: "Echo", xp: 20 }, { name: "Later", xp: 5 }]);
    expect(result.draft.skills.at(-1)).toEqual({ name: "Echo", xp: -10 });
  });
  it("uses sub-affiliation language overrides when the base has no selectable language", () => {
    // Given
    const custom: Stage0Catalog = freeze({ ...catalog, affiliations: catalog.affiliations.map((aff) => ({ ...aff, startingLanguages: { ...aff.startingLanguages, mode: "subAffiliationOverride", candidates: [] }, subAffiliations: aff.subAffiliations.map((sub) => ({ ...sub, startingLanguages: { mode: "base", candidates: ["Language/French"], source } })) })) });
    // When
    const result = rebuildStage0(baseline, custom, { ...major, startingLanguage: "Language/French" });
    // Then
    if (result.status !== "complete") throw new TypeError(result.status);
    expect(result.draft.skills).toEqual([{ name: "Perception", xp: 10 }, { name: "Language/French", xp: 20 }]);
  });
  it("applies the exact Major Periphery catalog candidate without a doubled prefix", () => {
    // Given the real static catalog and the exact candidate value (no normalization).
    const selection = freeze({ affiliationId: 7, subAffiliationId: 0, casteId: null, startingLanguage: "Language/English", choices: [] } satisfies Stage0Selection);
    // When
    const result = rebuildStage0(baseline, stage0Catalog, selection);
    // Then the literal XP oracle holds and exactly one English row exists.
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new TypeError(result.status);
    expect(result.xp.spent).toBe(780);
    expect(result.xp.remaining).toBe(4220);
    expect(result.moduleXpSpent).toBe(75);
    expect(result.wizardXpRemaining).toBe(4925);
    expect(result.draft.scalars).toMatchObject({ name: "Intro name", aff: "Major Periphery State", subaff: "None", clancaste: "", gmxpmod: 0 });
    expect(result.draft.skills).toEqual([{ name: "Perception", xp: 10 }, { name: "Language/English", xp: 20 }]);
    expect(result.draft.skills.filter((row) => row.name === "Language/English")).toHaveLength(1);
    expect(result.draft.skills.some((row) => row.name === "Language/Language/English")).toBe(false);
  });
});
