import type { Stage0Candidate, Stage0Choice, Stage0Layer, Stage0Source } from "../lib/rules/stage0-contract";
import { Stage0SourceError } from "./stage0-source";
import { Stage0Statements } from "./stage0-statements";
import { dispatchedCandidate, type Stage0Dispatch } from "./stage0-dispatch";

export type LayerContext = {
  readonly affiliationId: number;
  readonly subAffiliationId: number | null;
  readonly source: Stage0Source;
  readonly baseLabels: ReadonlyMap<string, string>;
  readonly dispatch: Stage0Dispatch;
};

export function stage0Layer(state: Stage0Statements, context: LayerContext): Stage0Layer {
  const choices: Stage0Choice[] = [];
  for (const [id, values] of state.lists) {
    const baseSlot = /^affElem([12])$/.exec(id);
    const subSlot = /^subAffElem([1-4])(More)?$/.exec(id);
    const labelKey = subSlot ? `subAffElem${subSlot[1]}Label${subSlot[2] ?? ""}` : "";
    if (values.length === 0 && !state.texts.get(labelKey)) continue;
    const source = state.sources.get(id) ?? state.sources.get(labelKey) ?? context.source;
    if (values.length === 0) {
      // wizard.cpp:426-428 and s0moredialog.cpp:83-86 copy only this empty list,
      // never the scratch list or slot 3 populated by text_resurce.cpp:1375.
      if (context.affiliationId === 7 && context.subAffiliationId === 3 && id === "subAffElem2More") continue;
      throw new Stage0SourceError(source, `Empty selectable choice: ${id}`);
    }
    if (baseSlot && context.subAffiliationId === null) {
      if (context.affiliationId === 9 || context.affiliationId === 10) continue;
      const slot = baseSlot[1];
      const terran = context.affiliationId === 11;
      const traitXp = state.numbers.get(`elem${slot}XPTraits`) ?? 0;
      const skillXp = state.numbers.get(`elem${slot}XPSkills`) ?? 0;
      if (!terran && [traitXp, skillXp, state.numbers.get(`elem${slot}XPAttr`) ?? 0].filter((xp) => xp !== 0).length !== 1) {
        throw new Stage0SourceError(source, `Ambiguous base rate: ${id}`);
      }
      const kind = terran ? (slot === "1" ? "skill" : "attribute") : traitXp !== 0 ? "trait" : "skill";
      const xp = terran ? (slot === "1" ? 15 : 50) : traitXp || skillXp;
      if (xp === 0) throw new Stage0SourceError(source, `No dispatcher XP for ${id}`);
      choices.push({ id, label: context.baseLabels.get(id) ?? null,
        candidates: values.map((value) => ({ kind, value })), xp,
        selectionCount: terran ? 2 : 1, unique: true,
        candidateSelection: { mode: "all" }, source });
    }
    if (subSlot) {
      const [, slot, more] = subSlot;
      const suffix = more ?? "";
      const skillXp = state.numbers.get(`affSkillsElem${slot}${suffix}`) ?? 0;
      const traitXp = state.numbers.get(`affTraitsElem${slot}${suffix}`) ?? 0;
      const attrXp = state.numbers.get(`affAttrElem${slot}${suffix}`) ?? 0;
      if ([skillXp, traitXp, attrXp].filter((xp) => xp !== 0).length !== 1) throw new Stage0SourceError(source, `Ambiguous choice rate: ${id}`);
      const xp = skillXp || traitXp || attrXp;
      if (xp === 0) throw new Stage0SourceError(source, `No dispatcher XP for ${id}`);
      const ordinaryKind = attrXp !== 0 ? "attribute" : traitXp !== 0 ? "trait" : "skill";
      const ranges = more ? context.dispatch.get(`${context.affiliationId}/${slot}`) : undefined;
      const candidates = values.map((value, index): Stage0Candidate => {
        if (ranges) return dispatchedCandidate(ranges, value, index);
        return { kind: ordinaryKind, value };
      });
      const dependent = context.affiliationId === 11 && [3, 6].includes(context.subAffiliationId ?? -1) && id === "subAffElem1";
      const previous: Stage0Choice[] = more && context.affiliationId === 12
        ? choices.filter((choice) => choice.id.endsWith("More"))
        : [];
      const pairUnique = id === "subAffElem2" && (
        (context.affiliationId === 9 && context.subAffiliationId === 7) ||
        (context.affiliationId === 10 && context.subAffiliationId === 4) ||
        (context.affiliationId === 11 && [1, 4].includes(context.subAffiliationId ?? -1)) ||
        (context.affiliationId === 12 && [1, 2].includes(context.subAffiliationId ?? -1)));
      if (pairUnique) previous.push(...choices.filter((choice) => choice.id === "subAffElem1"));
      if (context.affiliationId === 3 && id === "subAffElem2More") previous.push(...choices.filter((choice) => choice.id === "subAffElem1More"));
      choices.push({ id, label: state.texts.get(`subAffElem${slot}Label${suffix}`) ?? null,
        candidates, xp, selectionCount: 1, unique: true, source,
        candidateSelection: dependent
          ? { mode: "includeSelected", references: [{ scope: "base", choiceId: "affElem1" }] }
          : previous.length > 0
            ? { mode: "excludeSelected", references: previous.map((choice) => ({ scope: "layer", choiceId: choice.id })) }
            : { mode: "all" } });
    }
    if (id === "comElem") choices.push({ id, label: null,
      candidates: values.map((value) => ({ kind: "skill", value })),
      xp: state.numbers.get("comElemInt") ?? 0, selectionCount: 1, unique: true,
      candidateSelection: { mode: "all" }, source });
  }
  if (context.affiliationId === 10 && context.subAffiliationId === 4) {
    const candidates = (state.lists.get("affElem2") ?? []).map((value): Stage0Candidate => ({ kind: "attribute", value }));
    for (const [id, xp] of [["affElem2:1", 75], ["affElem2:2", -20]] as const) {
      choices.push({ id, label: null, candidates, xp, selectionCount: 1, unique: true,
        source: state.sources.get("affElem2") ?? context.source,
        candidateSelection: xp > 0 ? { mode: "all" } : { mode: "excludeSelected", references: [{ scope: "layer", choiceId: "affElem2:1" }] } });
    }
  }
  return { attrDeltas: { ...state.attrs }, skillGrants: [...state.skills], traitGrants: [...state.traits],
    prerequisites: { attrs: { ...state.preAttrs }, skills: [], traits: [] },
    choices, source: context.source };
}
