import { emptyDraft, type BtccDraft } from "@/lib/btcc";
import {
  ATTRIBUTE_KEYS,
  CHARACTER_START_XP,
  computeXp,
  mergePrerequisites,
  type XpSummary,
} from "@/lib/characters";
import { mergeRows } from "@/lib/characters/grants";
import type {
  Stage0Candidate,
  Stage0Catalog,
  Stage0Choice,
  Stage0Layer,
} from "@/lib/rules/stage0-contract";

export type WizardBaseline = { readonly characterName: string };
export type Stage0LayerId = "base" | "subAffiliation" | "caste";
export type Stage0ChoiceSelection = {
  readonly layer: Stage0LayerId;
  readonly choiceId: string;
  readonly candidates: readonly Stage0Candidate[];
};
export type Stage0Selection = {
  readonly affiliationId: number | null;
  readonly subAffiliationId: number | null;
  /** The contract identifies castes by exact name, not numeric id. */
  readonly casteId: string | null;
  readonly startingLanguage: string | null;
  readonly choices: readonly Stage0ChoiceSelection[];
};
export type Stage0Failure = {
  readonly status: "incomplete" | "invalid";
  readonly reason:
    | "affiliation"
    | "subAffiliation"
    | "caste"
    | "startingLanguage"
    | "choice"
    | "choiceCount"
    | "candidate"
    | "duplicateCandidate";
};
export type Stage0Result =
  | Stage0Failure
  | {
      readonly status: "complete";
      readonly draft: BtccDraft;
      readonly xp: XpSummary;
      readonly moduleXpSpent: number;
      readonly wizardXpRemaining: number;
    };

export function initializeWizardDraft(
  baseline: WizardBaseline,
  language: string | null = null,
): BtccDraft {
  const draft = emptyDraft();
  return {
    ...draft,
    scalars: { ...draft.scalars, name: baseline.characterName },
    attrs: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 100])),
    skills: [
      { name: "Perception", xp: 10 },
      ...(language === null ? [] : [{ name: language, xp: 20 }]),
    ],
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected Stage 0 variant: ${String(value)}`);
}
function sameCandidate(a: Stage0Candidate, b: Stage0Candidate): boolean {
  return a.kind === b.kind && a.value === b.value;
}

export function resolveStage0Candidates(
  choice: Stage0Choice,
  layer: Stage0LayerId,
  selection: Stage0Selection,
): readonly Stage0Candidate[] {
  const rule = choice.candidateSelection;
  switch (rule.mode) {
    case "all":
      return choice.candidates;
    case "includeSelected":
    case "excludeSelected": {
      const referenced = rule.references.flatMap(
        (reference): readonly Stage0Candidate[] => {
          switch (reference.scope) {
            case "startingLanguage":
              return selection.startingLanguage === null
                ? []
                : [{ kind: "skill", value: selection.startingLanguage }];
            case "base":
            case "layer":
              return (
                selection.choices.find(
                  (pick) =>
                    pick.layer ===
                      (reference.scope === "base" ? "base" : layer) &&
                    pick.choiceId === reference.choiceId,
                )?.candidates ?? []
              );
            default:
              return assertNever(reference);
          }
        },
      );
      return rule.mode === "includeSelected"
        ? referenced
        : choice.candidates.filter(
            (candidate) =>
              !referenced.some((picked) => sameCandidate(candidate, picked)),
          );
    }
    default:
      return assertNever(rule);
  }
}

type SelectedLayer = {
  readonly id: Stage0LayerId;
  readonly layer: Stage0Layer;
};
type ResolvedStage0 = {
  readonly status: "complete";
  readonly affiliation: Stage0Catalog["affiliations"][number];
  readonly subAffiliation: Stage0Catalog["affiliations"][number]["subAffiliations"][number];
  readonly layers: readonly SelectedLayer[];
};

export function validateStage0Selection(
  catalog: Stage0Catalog,
  selection: Stage0Selection,
): Stage0Failure | ResolvedStage0 {
  const affiliation = catalog.affiliations.find(
    (entry) => entry.id === selection.affiliationId,
  );
  if (!affiliation)
    return {
      status: selection.affiliationId === null ? "incomplete" : "invalid",
      reason: "affiliation",
    };
  const subAffiliation = affiliation.subAffiliations.find(
    (entry) =>
      entry.id === selection.subAffiliationId &&
      entry.affiliationId === affiliation.id,
  );
  if (!subAffiliation)
    return {
      status: selection.subAffiliationId === null ? "incomplete" : "invalid",
      reason: "subAffiliation",
    };
  const caste = catalog.castes.find(
    (entry) => entry.name === selection.casteId,
  );
  if (affiliation.casteRequired && selection.casteId === null)
    return { status: "incomplete", reason: "caste" };
  if (
    selection.casteId !== null &&
    (!affiliation.casteRequired ||
      !caste ||
      !(subAffiliation.castes ?? affiliation.castes).includes(
        selection.casteId,
      ))
  )
    return { status: "invalid", reason: "caste" };
  if (selection.startingLanguage === null)
    return { status: "incomplete", reason: "startingLanguage" };
  const languages =
    subAffiliation.startingLanguages ?? affiliation.startingLanguages;
  if (
    languages.mode !== "base" ||
    !languages.candidates.includes(selection.startingLanguage)
  )
    return { status: "invalid", reason: "startingLanguage" };
  const layers: SelectedLayer[] = [
    { id: "base", layer: affiliation.base },
    { id: "subAffiliation", layer: subAffiliation.layer },
  ];
  if (caste) layers.push({ id: "caste", layer: caste.layer });
  const keys = new Set<string>();
  for (const picked of selection.choices) {
    const key = `${picked.layer}:${picked.choiceId}`;
    if (
      keys.has(key) ||
      !layers.some(
        (entry) =>
          entry.id === picked.layer &&
          entry.layer.choices.some((choice) => choice.id === picked.choiceId),
      )
    )
      return { status: "invalid", reason: "choice" };
    keys.add(key);
  }
  for (const entry of layers) {
    for (const choice of entry.layer.choices) {
      const picks =
        selection.choices.find(
          (picked) =>
            picked.layer === entry.id && picked.choiceId === choice.id,
        )?.candidates ?? [];
      if (picks.length !== choice.selectionCount)
        return {
          status:
            picks.length < choice.selectionCount ? "incomplete" : "invalid",
          reason: "choiceCount",
        };
      const candidates = resolveStage0Candidates(choice, entry.id, selection);
      if (
        picks.some(
          (picked) =>
            !candidates.some((candidate) => sameCandidate(candidate, picked)),
        )
      )
        return { status: "invalid", reason: "candidate" };
      if (
        choice.unique &&
        picks.some((picked, index) =>
          picks
            .slice(0, index)
            .some((earlier) => sameCandidate(earlier, picked)),
        )
      )
        return { status: "incomplete", reason: "duplicateCandidate" };
    }
  }
  return { status: "complete", affiliation, subAffiliation, layers };
}

function add(a: number, b: number): number {
  return a + b;
}

/** Only fresh local accumulators are mutated; zero rows survive until finalization to retain first insertion order. */
export function rebuildStage0(
  baseline: WizardBaseline,
  catalog: Stage0Catalog,
  selection: Stage0Selection,
): Stage0Result {
  const resolved = validateStage0Selection(catalog, selection);
  switch (resolved.status) {
    case "incomplete":
    case "invalid":
      return resolved;
    case "complete":
      break;
    default:
      return assertNever(resolved);
  }
  const draft = initializeWizardDraft(baseline, selection.startingLanguage);
  draft.scalars.aff = resolved.affiliation.name;
  draft.scalars.subaff = resolved.subAffiliation.name;
  draft.scalars.clancaste = selection.casteId ?? "";
  const prerequisites = mergePrerequisites(
    resolved.layers.map((entry) => entry.layer.prerequisites),
  );
  for (const entry of resolved.layers) {
    const layer = entry.layer;
    for (const [key, delta] of Object.entries(layer.attrDeltas))
      draft.attrs[key] = (draft.attrs[key] ?? 0) + delta;
    draft.skills = mergeRows(draft.skills, layer.skillGrants, add);
    draft.traits = mergeRows(draft.traits, layer.traitGrants, add);
    for (const choice of layer.choices) {
      const picks =
        selection.choices.find(
          (pick) => pick.layer === entry.id && pick.choiceId === choice.id,
        )?.candidates ?? [];
      for (const candidate of picks) {
        const grant = { name: candidate.value, xp: choice.xp };
        switch (candidate.kind) {
          case "attribute":
            draft.attrs[candidate.value] =
              (draft.attrs[candidate.value] ?? 0) + choice.xp;
            break;
          case "skill":
            draft.skills = mergeRows(draft.skills, [grant], add);
            break;
          case "trait":
            draft.traits = mergeRows(draft.traits, [grant], add);
            break;
          default:
            return assertNever(candidate.kind);
        }
      }
    }
  }
  draft.preAttrs = prerequisites.attrs;
  draft.preSkills = prerequisites.skills;
  draft.preTraits = prerequisites.traits;
  draft.skills = draft.skills.filter((row) => row.xp !== 0);
  draft.traits = draft.traits.filter((row) => row.xp !== 0);
  return {
    status: "complete",
    draft,
    xp: computeXp(draft),
    moduleXpSpent: resolved.affiliation.xpCost,
    wizardXpRemaining: CHARACTER_START_XP - resolved.affiliation.xpCost,
  };
}
