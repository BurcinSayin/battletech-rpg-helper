import type { Stage0Catalog, Stage0Languages, Stage0Source } from "../lib/rules/stage0-contract";
import { extractFunction, stripTrailingComment } from "./extract-rules-lib";
import { readStage0Dispatch } from "./stage0-dispatch";
import { stage0Layer } from "./stage0-choices";
import { selectedStatements, sourceFunction, Stage0SourceError, type SourceBlock } from "./stage0-source";
import { Stage0Statements } from "./stage0-statements";

type Reader = (path: string) => string;
type Subskills = Readonly<Record<string, readonly string[]>>;

function switchCases(block: SourceBlock, parameter: string): ReadonlyMap<number | "default", SourceBlock> {
  const node = block.nodes.find((node) => node.kind === "switch" && node.parameter === parameter);
  if (!node || node.kind !== "switch") throw new Stage0SourceError(block.source, `Missing switch(${parameter})`);
  return node.cases;
}

function validateActive(block: SourceBlock, state: Stage0Statements): void {
  for (const node of block.nodes) {
    switch (node.kind) {
      case "statement": state.consume(node.statement); break;
      case "if": validateActive(node.yes, state); validateActive(node.no, state); break;
      case "switch": for (const arm of node.cases.values()) validateActive(arm, state); break;
      default: { const unreachable: never = node; throw new Stage0SourceError(block.source, String(unreachable)); }
    }
  }
}

function languages(state: Stage0Statements, source: Stage0Source): Stage0Languages {
  const candidates = state.lists.get("listLang") ?? [];
  const override = candidates.includes("Use sub-Affilation");
  if (override && candidates.length !== 1) throw new Stage0SourceError(source, "Mixed sentinel/language list");
  return { mode: override ? "subAffiliationOverride" : "base", candidates: override ? [] : [...candidates],
    source: state.sources.get("listLang") ?? source };
}

function baseLabels(wizard: string): ReadonlyMap<string, string> {
  const fn = extractFunction(wizard, /Wizard::addAffElem\(/);
  const labels = new Map<string, string>();
  let affiliation = -1;
  const widgets = new Map<string, string>();
  for (const code of fn.lines.map(stripTrailingComment)) {
    const arm = /^\s*case (\d+):/.exec(code);
    if (arm) { affiliation = Number(arm[1]); widgets.clear(); }
    const label = /ui->(Affl_Add_Label(?:_2)?)->setText\("([^"]+)"\)/.exec(code);
    if (label) widgets.set(label[1] === "Affl_Add_Label" ? "ComBoxTried" : "ComBoxFor", label[2]);
    const list = /ui->(ComBoxTried|ComBoxFor)->addItems\(txt_res->(affElem[12])\)/.exec(code);
    if (list) {
      const text = widgets.get(list[1]);
      if (text === undefined) throw new Stage0SourceError({ file: "wizard.cpp", line: fn.startLine }, code);
      labels.set(`${affiliation}/${list[2]}`, text);
    }
  }
  return labels;
}

export function extractStage0(read: Reader, subskills: Subskills): Stage0Catalog {
  const text = read("text_resurce.cpp");
  const functions = new Map(["rSubAff", "subAffAttr", "clanCaste", "comstarAttr", "comstarSub", "WoBSub"].map((name) => {
    const block = sourceFunction(text, name);
    validateActive(block, new Stage0Statements(subskills));
    return [name, block] as const;
  }));
  const required = (name: string): SourceBlock => {
    const block = functions.get(name);
    if (!block) throw new Stage0SourceError({ file: "text_resurce.cpp", line: 1 }, name);
    return block;
  };
  const run = (name: string, selection: Readonly<Record<string, string | number | boolean>>): Stage0Statements => {
    const state = new Stage0Statements(subskills);
    for (const statement of selectedStatements(required(name), selection)) state.consume(statement);
    return state;
  };
  const labels = baseLabels(read("wizard.cpp"));
  const dispatch = readStage0Dispatch(read("s0moredialog.cpp"));
  const baseArms = switchCases(required("rSubAff"), "affStrNum");
  const subArms = switchCases(required("subAffAttr"), "primPos");
  const names = read("resource/affilations.dat").replace(/\r\n?/g, "\n").split("\n");
  if (names.at(-1) === "") names.pop();
  for (const [id, arm] of baseArms) {
    if (typeof id === "number" && names[id] === undefined) throw new Stage0SourceError(arm.source, `Unknown affiliation ${id}`);
  }
  if (names.some((name) => !name || name !== name.trim()) || names.length !== baseArms.size - 1) {
    throw new Stage0SourceError({ file: "resource/affilations.dat", line: 1 }, "Affiliation/switch mismatch");
  }
  const affiliations = names.map((name, id) => {
    const arm = baseArms.get(id);
    const subArm = subArms.get(id);
    if (!arm || !subArm) throw new Stage0SourceError(required("rSubAff").source, `Missing affiliation ${id}`);
    const state = run("rSubAff", { affStrNum: id });
    const casteRequired = id === 9 || id === 10;
    const baseLabels = new Map([...labels].filter(([key]) => key.startsWith(`${id}/`)).map(([key, value]) => [key.slice(key.indexOf("/") + 1), value]));
    const context = { affiliationId: id, subAffiliationId: null, baseLabels, dispatch, source: arm.source };
    const base = stage0Layer(state, context);
    const children = state.lists.get("subAffList") ?? [];
    const childArms = switchCases(subArm, "secPos");
    for (const key of childArms.keys()) {
      if (typeof key !== "number" || !children[key]) throw new Stage0SourceError(subArm.source, `Unknown child ${key}`);
    }
    const subAffiliations = children.map((child, subId) => {
      const childArm = childArms.get(subId);
      if (subId !== 0 && !childArm) throw new Stage0SourceError(subArm.source, `Missing child ${subId}`);
      const subState = new Stage0Statements(subskills);
      for (const key of ["primLang", "secLang", "listLang"]) subState.lists.set(key, [...(state.lists.get(key) ?? [])]);
      for (const statement of selectedStatements(required("subAffAttr"), { primPos: id, secPos: subId })) subState.consume(statement);
      const source = childArm?.source ?? subArm.source;
      return { id: subId, affiliationId: id, name: child,
        layer: stage0Layer(subState, { ...context, subAffiliationId: subId, source }),
        startingLanguages: subState.sources.has("listLang") ? languages(subState, source) : null,
        castes: casteRequired && subState.sources.has("affElem1") ? subState.lists.get("affElem1") ?? [] : null,
        source: state.sources.get("subAffList") ?? arm.source };
    });
    const xpCost = state.numbers.get("xpCostModule");
    if (xpCost === undefined) throw new Stage0SourceError(arm.source, "Missing xpCostModule");
    return { id, name, xpCost, startingLanguages: languages(state, arm.source), casteRequired,
      castes: casteRequired ? state.lists.get("affElem1") ?? [] : [], base, subAffiliations,
      source: { file: "resource/affilations.dat", line: id + 1 } };
  });
  const castes = required("clanCaste").nodes.flatMap((node) => {
    if (node.kind !== "if") return [];
    if (typeof node.value !== "string") throw new Stage0SourceError(node.yes.source, "Invalid caste");
    return [{ name: node.value, layer: stage0Layer(run("clanCaste", { nameCaste: node.value }), {
      affiliationId: 9, subAffiliationId: null, baseLabels: new Map(), dispatch, source: node.yes.source,
    }) }];
  });
  for (const aff of affiliations) for (const caste of [...aff.castes, ...aff.subAffiliations.flatMap((sub) => sub.castes ?? [])]) {
    if (!castes.some(({ name }) => name === caste)) throw new Stage0SourceError(aff.base.source, `Unknown caste ${caste}`);
  }
  const overlayState = run("comstarAttr", { chk: true });
  const overlayContext = { affiliationId: -1, subAffiliationId: null, baseLabels: new Map<string, string>(), dispatch, source: required("comstarAttr").source };
  const overlayBase = stage0Layer(overlayState, overlayContext);
  return { affiliations, castes, overlays: [["ComStar", "comstarSub"], ["Word of Blake", "WoBSub"]].map(([name, fn]) => ({
    name, xpCost: overlayState.numbers.get("xpCostModule") ?? 0, base: overlayBase,
    layer: stage0Layer(run(fn, { chk: true }), { ...overlayContext, source: required(fn).source }),
  })) };
}
