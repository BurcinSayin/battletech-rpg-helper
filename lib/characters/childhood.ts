import type { BtccDraft, BtccRow } from "@/lib/btcc";
import type {
  ChildhoodCatalog,
  ChildhoodGate,
  ChildhoodModule,
  FlexPolicy,
  SibkoPool,
} from "@/lib/rules/childhood-contract";
import type {
  Stage0Candidate,
  Stage0Choice,
  Stage0Layer,
} from "@/lib/rules/stage0-contract";
import { mergeRows } from "./grants";
import { mergePrerequisites } from "./prereq";
import type { SibkoSelection } from "./sibko";

export type ChildhoodContext = {
  readonly affiliation: string;
  readonly subAffiliationId: number;
  readonly subAffiliation: string;
  readonly caste: string | null;
  readonly startingLanguage: string;
  readonly stage1Module: string | null;
  readonly traits: readonly BtccRow[];
};

/** The fixed selection shared by both stages; Stage 2 owns its additional flex ledger. */
export type ChildhoodSelection = {
  readonly moduleName: string;
  readonly choices: readonly {
    readonly choiceId: string;
    readonly candidates: readonly Stage0Candidate[];
  }[];
  readonly phenotype: string | null;
  readonly sibko: SibkoSelection | null;
};

export type ChildhoodFailureReason =
  | "module"
  | "availability"
  | "context"
  | "choice"
  | "candidate"
  | "choiceCount"
  | "phenotype"
  | "branch";
export type ResolvedChildhoodModule = {
  readonly stage: 1 | 2;
  readonly name: string;
  readonly xpCost: number;
  readonly layer: Stage0Layer;
  readonly parameterSkillGrants: readonly BtccRow[];
  readonly phenotype: string | null;
  readonly completionAge: number | null;
  readonly flexPolicy: FlexPolicy | null;
  readonly sibkoPools: {
    readonly basic: SibkoPool;
    readonly advanced: SibkoPool;
  } | null;
};
export type ChildhoodResolution =
  | { readonly status: "invalid"; readonly reason: ChildhoodFailureReason }
  | {
      readonly status: "incomplete";
      readonly reason: ChildhoodFailureReason;
      readonly module: ResolvedChildhoodModule | null;
    }
  | { readonly status: "complete"; readonly module: ResolvedChildhoodModule };

function matchesGate(gate: ChildhoodGate, context: ChildhoodContext): boolean {
  const { when } = gate;
  if (!when.affiliations.includes(context.affiliation)) return false;
  if (
    when.subAffiliationIds &&
    !when.subAffiliationIds.includes(context.subAffiliationId)
  )
    return false;
  if (
    when.stage1Modules &&
    (context.stage1Module === null ||
      !when.stage1Modules.includes(context.stage1Module))
  )
    return false;
  if (when.traitsAny) {
    const present = context.traits.some((trait) =>
      when.traitsAny!.names.includes(trait.name),
    );
    if (present !== when.traitsAny.present) return false;
  }
  return true;
}

/** Gates consume the completed entering-stage prefix, in source order. */
export function availableChildhoodModules(
  catalog: ChildhoodCatalog,
  stage: 1 | 2,
  context: ChildhoodContext,
): readonly ChildhoodModule[] {
  let modules = catalog.modules.filter((entry) => entry.stage === stage);
  for (const gate of catalog.gates) {
    if (gate.stage !== stage || !matchesGate(gate, context)) continue;
    if (gate.operation === "remove")
      modules = modules.filter((entry) => !gate.modules.includes(entry.name));
    else
      modules = gate.modules.map((name) =>
        catalog.modules.find(
          (entry) => entry.stage === stage && entry.name === name,
        )!,
      );
  }
  return modules;
}

/** Caste assignments replace module-local attributes; branch grants are additive. */
function mergeLayers(
  base: Stage0Layer,
  overlay: Stage0Layer,
  attributes: "replace" | "add",
): Stage0Layer {
  const attrDeltas = { ...base.attrDeltas };
  for (const [key, value] of Object.entries(overlay.attrDeltas)) {
    attrDeltas[key] =
      attributes === "replace" ? value : (attrDeltas[key] ?? 0) + value;
  }
  const prerequisites = mergePrerequisites([
    base.prerequisites,
    overlay.prerequisites,
  ]);
  const choices = new Map(base.choices.map((choice) => [choice.id, choice]));
  for (const choice of overlay.choices) choices.set(choice.id, choice);
  return {
    attrDeltas,
    skillGrants: [...base.skillGrants, ...overlay.skillGrants],
    traitGrants: [...base.traitGrants, ...overlay.traitGrants],
    prerequisites,
    choices: Array.from(choices.values()),
    source: base.source,
  };
}

function concretePool(pool: SibkoPool, subAffiliation: string): SibkoPool {
  const resolve = (name: string) =>
    name === "Protocol/{subAffiliation}" ? `Protocol/${subAffiliation}` : name;
  return {
    ...pool,
    groups: pool.groups.map((group) => ({
      id: resolve(group.id),
      skills: group.skills.map(resolve),
    })),
  };
}

/** Missing positions are allowed here; supplied values must always be legal. */
function invalidChoices(
  choices: readonly Stage0Choice[],
  selection: ChildhoodSelection,
): ChildhoodFailureReason | null {
  const selected = new Set<string>();
  for (const pick of selection.choices) {
    const choice = choices.find((value) => value.id === pick.choiceId);
    if (!choice || selected.has(pick.choiceId)) return "choice";
    if (pick.candidates.length > choice.selectionCount) return "choiceCount";
    for (let index = 0; index < pick.candidates.length; index++) {
      const candidate = pick.candidates[index];
      if (
        !choice.candidates.some(
          (value) =>
            value.kind === candidate.kind && value.value === candidate.value,
        )
      )
        return "candidate";
      if (
        choice.unique &&
        pick.candidates.some(
          (value, earlier) =>
            earlier < index &&
            value.kind === candidate.kind &&
            value.value === candidate.value,
        )
      )
        return "candidate";
    }
    selected.add(pick.choiceId);
  }
  return null;
}

export function resolveChildhoodModule(
  catalog: ChildhoodCatalog,
  stage: 1 | 2,
  selection: ChildhoodSelection,
  context: ChildhoodContext,
): ChildhoodResolution {
  const entry = catalog.modules.find(
    (module) => module.stage === stage && module.name === selection.moduleName,
  );
  if (!entry)
    return selection.moduleName === ""
      ? { status: "incomplete", reason: "module", module: null }
      : { status: "invalid", reason: "module" };
  if (!context.affiliation)
    return { status: "incomplete", reason: "context", module: null };
  const affiliation = catalog.affiliationSkills.find(
    (value) => value.affiliation === context.affiliation,
  );
  if (
    !affiliation ||
    !Number.isInteger(context.subAffiliationId) ||
    context.subAffiliationId < 0
  )
    return { status: "invalid", reason: "context" };
  if (
    !availableChildhoodModules(catalog, stage, context).some(
      (module) => module.name === entry.name,
    )
  )
    return { status: "invalid", reason: "availability" };
  if (
    selection.phenotype !== null &&
    (stage !== 1 || !entry.phenotypes.includes(selection.phenotype))
  )
    return { status: "invalid", reason: "phenotype" };
  if (selection.sibko !== null && entry.sibkoBranches.length === 0)
    return { status: "invalid", reason: "branch" };
  if (entry.casteLayers.length > 0 && context.caste === null)
    return { status: "incomplete", reason: "context", module: null };

  let layer = entry.layer;
  const casteLayer = entry.casteLayers.find(
    (value) => value.caste === context.caste,
  );
  if (casteLayer) layer = mergeLayers(layer, casteLayer.layer, "replace");
  let xpCost = entry.xpCost;
  let flexPolicy = entry.flexPolicy;
  let sibkoPools: ResolvedChildhoodModule["sibkoPools"] = null;
  if (entry.sibkoBranches.length > 0) {
    if (!context.subAffiliation)
      return { status: "incomplete", reason: "context", module: null };
    if (selection.sibko?.branch == null) {
      if (selection.choices.length > 0) {
        let reason: ChildhoodFailureReason | null = "branch";
        for (const possible of entry.sibkoBranches) {
          if (
            possible.clans !== null &&
            !possible.clans.includes(context.subAffiliation)
          )
            continue;
          const choices = new Map(
            layer.choices.map((choice) => [choice.id, choice]),
          );
          for (const choice of possible.layer.choices)
            choices.set(choice.id, choice);
          reason = invalidChoices(Array.from(choices.values()), selection);
          if (reason === null) break;
        }
        if (reason !== null) return { status: "invalid", reason };
      }
      return { status: "incomplete", reason: "branch", module: null };
    }
    const branch = entry.sibkoBranches.find(
      (value) => value.name === selection.sibko!.branch,
    );
    if (
      !branch ||
      (branch.clans !== null && !branch.clans.includes(context.subAffiliation))
    )
      return { status: "invalid", reason: "branch" };
    layer = mergeLayers(layer, branch.layer, "add");
    xpCost = branch.xpCost;
    flexPolicy = branch.flexPolicy;
    sibkoPools = {
      basic: concretePool(branch.basic, context.subAffiliation),
      advanced: concretePool(branch.advanced, context.subAffiliation),
    };
  }
  if (xpCost === null)
    return { status: "incomplete", reason: "branch", module: null };

  const parameterSkillGrants: BtccRow[] = [];
  const parameters = entry.parametrizedGrants;
  if (parameters.language !== 0) {
    if (!context.startingLanguage)
      return { status: "incomplete", reason: "context", module: null };
    parameterSkillGrants.push({
      name: context.startingLanguage,
      xp: parameters.language,
    });
  }
  if (parameters.protocols !== 0)
    parameterSkillGrants.push({
      name: affiliation.protocol,
      xp: parameters.protocols,
    });
  if (parameters.streetwise !== 0)
    parameterSkillGrants.push({
      name: affiliation.streetwise,
      xp: parameters.streetwise,
    });
  const resolved: ResolvedChildhoodModule = {
    stage,
    name: entry.name,
    xpCost,
    layer,
    parameterSkillGrants,
    phenotype: selection.phenotype,
    completionAge: stage === 1 ? null : entry.name === "Civilian Job" ? 18 : 16,
    flexPolicy,
    sibkoPools,
  };

  // Validate every supplied value before reporting missing required input. A forged
  // later choice must not hide behind an earlier unfilled position.
  const reason = invalidChoices(layer.choices, selection);
  if (reason !== null) return { status: "invalid", reason };
  if (entry.phenotypes.length > 0 && selection.phenotype === null)
    return { status: "incomplete", reason: "phenotype", module: resolved };
  if (
    layer.choices.some(
      (choice) =>
        (selection.choices.find((pick) => pick.choiceId === choice.id)
          ?.candidates.length ?? 0) < choice.selectionCount,
    )
  )
    return { status: "incomplete", reason: "choiceCount", module: resolved };
  return { status: "complete", module: resolved };
}

/** Apply a complete ordinary package only. Sibko fields and flex belong to replay. */
export function applyChildhoodModule(
  prefix: BtccDraft,
  resolved: ResolvedChildhoodModule,
  selection: ChildhoodSelection,
): BtccDraft {
  const layer = resolved.layer;
  const prerequisites = mergePrerequisites([
    {
      attrs: prefix.preAttrs,
      skills: prefix.preSkills,
      traits: prefix.preTraits,
    },
    layer.prerequisites,
  ]);
  const attrs = { ...prefix.attrs };
  for (const [key, delta] of Object.entries(layer.attrDeltas))
    attrs[key] = (attrs[key] ?? 0) + delta;
  const skills: BtccRow[] = [
    ...layer.skillGrants,
    ...resolved.parameterSkillGrants,
  ];
  const traits: BtccRow[] = [...layer.traitGrants];
  for (const choice of layer.choices) {
    const candidates =
      selection.choices.find((pick) => pick.choiceId === choice.id)
        ?.candidates ?? [];
    for (const candidate of candidates) {
      switch (candidate.kind) {
        case "attribute":
          attrs[candidate.value] = (attrs[candidate.value] ?? 0) + choice.xp;
          break;
        case "skill":
          skills.push({ name: candidate.value, xp: choice.xp });
          break;
        case "trait":
          traits.push({ name: candidate.value, xp: choice.xp });
          break;
      }
    }
  }
  return {
    ...prefix,
    scalars: {
      ...prefix.scalars,
      ...(resolved.stage === 1
        ? { earlychild: resolved.name }
        : { latechild: resolved.name }),
      ...(resolved.completionAge === null
        ? {}
        : { age: resolved.completionAge }),
      ...(resolved.phenotype === null ? {} : { phenotype: resolved.phenotype }),
    },
    attrs,
    skills: mergeRows(prefix.skills, skills, (a, b) => a + b).filter(
      (row) => row.xp !== 0,
    ),
    traits: mergeRows(prefix.traits, traits, (a, b) => a + b).filter(
      (row) => row.xp !== 0,
    ),
    preAttrs: prerequisites.attrs,
    preSkills: prerequisites.skills,
    preTraits: prerequisites.traits,
  };
}
