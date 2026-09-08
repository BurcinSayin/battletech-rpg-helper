import type {
  Stage0Candidate,
  Stage0Choice,
  Stage0Layer,
  Stage0Source,
} from "../lib/rules/stage0-contract";
import type { DeferredPick, Effects, ModuleEntry } from "./extract-rules-lib";
import { extractFunction, stripTrailingComment } from "./extract-rules-lib";

export type ChildhoodReader = (file: string) => string;
export type ChoiceDispatch = {
  readonly more: readonly [number, number];
  readonly creche: readonly [number, number];
  readonly secondLanguageXp: number;
};

function bounds(
  read: ChildhoodReader,
  file: string,
  signature: RegExp,
): readonly [number, number] {
  const fn = extractFunction(read(file), signature);
  const code = fn.lines.map(stripTrailingComment).join("\n");
  const limits = [...code.matchAll(/currentIndex\(\)\s*<\s*(\d+)/g)].map(
    (match) => Number(match[1]),
  );
  if (limits.length !== 2 || limits[0] >= limits[1])
    throw new Error(`${file}:${fn.startLine}: Unknown mixed-choice dispatch`);
  return [limits[0], limits[1]];
}

export function childhoodChoiceDispatch(read: ChildhoodReader): ChoiceDispatch {
  const fn = extractFunction(read("wizard.cpp"), /Wizard::S2ChangeElem2\(/);
  const second = /S2AddSkills\(nameElem,\s*(\d+)\)/.exec(
    fn.lines.map(stripTrailingComment).join("\n"),
  );
  if (!second)
    throw new Error(`wizard.cpp:${fn.startLine}: Missing second language XP`);
  return {
    more: bounds(
      read,
      "s1moredialog.cpp",
      /S1MoreDialog::on_S1AdvDialComBox1_activated\(/,
    ),
    creche: bounds(read, "wizard.cpp", /Wizard::S1ChangeElem4\(/),
    secondLanguageXp: Number(second[1]),
  };
}

function candidates(
  pick: DeferredPick,
  thresholds: readonly [number, number] | null,
  source: Stage0Source,
): Stage0Candidate[] {
  if (!pick.candidates?.length)
    throw new Error(
      `${source.file}:${source.line}: Missing candidates for ${pick.namespace}:${pick.slot}`,
    );
  const seen = new Set<string>();
  return pick.candidates.flatMap((value, index) => {
    const kind = thresholds
      ? index < thresholds[0]
        ? "attribute"
        : index < thresholds[1]
          ? "trait"
          : "skill"
      : pick.kind;
    const key = `${kind}:${value}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ kind, value }];
  });
}

export function childhoodChoices(
  module: Pick<ModuleEntry, "stage" | "name" | "source">,
  picks: readonly DeferredPick[],
  dispatch: ChoiceDispatch,
): Stage0Choice[] {
  return picks.flatMap((pick) => {
    if (pick.xp === null || pick.xp === 0) return [];
    const mixed =
      module.stage === 1
        ? pick.namespace === "more"
          ? dispatch.more
          : module.name === "Trueborn Creche" &&
              pick.namespace === "main" &&
              pick.slot === 4
            ? dispatch.creche
            : null
        : null;
    // Desktop repeat counts were tied to filtered combo positions. Own them by module identity instead.
    const repeated =
      module.stage === 1 &&
      pick.namespace === "main" &&
      ((module.name === "Blue Collar" && pick.slot === 2) ||
        (module.name === "Farm" && pick.slot === 1));
    const choice: Stage0Choice = {
      id: `${pick.namespace}:${pick.slot}`,
      label: pick.label,
      candidates: candidates(pick, mixed, module.source),
      xp: pick.xp,
      selectionCount: repeated ? 2 : 1,
      unique: false,
      candidateSelection: { mode: "all" },
      source: module.source,
    };
    if (
      module.stage === 2 &&
      module.name === "Mercenary Brat" &&
      choice.id === "main:2"
    ) {
      return [
        { ...choice, id: "main:2:1" },
        { ...choice, id: "main:2:2", xp: dispatch.secondLanguageXp },
      ];
    }
    return [choice];
  });
}

export function childhoodLayer(
  effects: Pick<
    Effects,
    "attrDeltas" | "skillGrants" | "traitGrants" | "prerequisites"
  >,
  source: Stage0Source,
  choices: readonly Stage0Choice[] = [],
): Stage0Layer {
  return {
    attrDeltas: effects.attrDeltas ?? {},
    skillGrants: effects.skillGrants ?? [],
    traitGrants: effects.traitGrants ?? [],
    prerequisites: effects.prerequisites ?? {
      attrs: {},
      skills: [],
      traits: [],
    },
    choices,
    source,
  };
}
