/**
 * Parsing core for `scripts/extract-rules.ts` (build step #11).
 *
 * Holds the statement vocabulary of the desktop's stage tables
 * (`RULES.md` §7.4) as a strict allowlist: any live statement inside a parsed
 * block that `BlockInterpreter` does not recognize throws, so desktop changes
 * surface as extraction failures instead of silent data loss.
 *
 * Statement shapes handled (stage prefix `sN` per file):
 * - tooltips, XP cost, flex XP (`=` and `+=`), age, attribute deltas
 *   (raw XP; stage 4 uses `s4AttrMod`), signed `SxAddTraits`/`SxAddSkills`
 *   grants, parametrized Language/Protocols/Streetwise grants,
 * - deferred "…/Any" picks (label/candidates/XP/repeats) in their per-stage
 *   spellings (`sXChildHood*`, `sXChildHood*Adv*`, `s4*Elem*`),
 * - flex-XP more-picks (`sXsubAffElemNMore`, stage 1/2), phenotype picks,
 * - prerequisites (`sXPreAttr` ×100; `qMakePair` trait/skill prereqs via the
 *   `swpstr` idiom), school field lists, sibko XP machinery,
 * - stage-4 deterministic list post-processing (`removeDuplicates`, `sort`).
 *
 * Deliberately NOT captured: wizard unwind scaffolding (`*Swp*`, `s2AdvSwp*`),
 * UI counters (`sXCountElem*`, `s1MoreTraitsAttr`), the stage-4 `s4repeat`
 * commit flag, and commented-out statements (their deferred picks are
 * re-expressed through the label/candidates/XP slots).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface Grant {
  name: string;
  xp: number;
}

export interface DeferredPick {
  slot: number;
  label: string | null;
  kind: "skill" | "trait" | "attribute";
  /** Concrete candidates; null when computed at runtime. */
  candidates: string[] | null;
  /** How candidates were sourced, when not a literal list. */
  candidatesSource: string | null;
  xp: number | null;
  repeats: number | null;
}

export interface FieldGroup {
  skills: string[];
  age: number | null;
}

export interface Fields {
  basic: FieldGroup | null;
  advanced: FieldGroup | null;
  specialist: FieldGroup | null;
}

export interface Prerequisites {
  attrs: Record<string, number>;
  traits: Grant[];
  skills: Grant[];
}

export interface Conditional {
  condition: string;
  effects: Effects;
  elseEffects: Effects | null;
  conditionals?: Conditional[];
}

export interface Effects {
  description?: string;
  desktopNumber?: number;
  xpCost?: number;
  flexXp?: number;
  flexXpDelta?: number;
  age?: number;
  attrDeltas?: Record<string, number>;
  traitGrants?: Grant[];
  skillGrants?: Grant[];
  parametrizedGrants?: { language?: number; protocols?: number; streetwise?: number };
  picks?: DeferredPick[];
  morePicks?: DeferredPick[];
  phenotypes?: string[];
  prerequisites?: Prerequisites;
  fields?: Fields;
  clanXp?: {
    basic?: { xp: number; stepXp: number; rebateXp: number };
    advanced?: { xp: number; stepXp: number; rebateXp: number };
  };
  clanFieldList?: string[];
}

export interface ModuleEntry {
  stage: number;
  kind: "module" | "field" | "school";
  name: string;
  blockIndex: number;
  desktopNumber?: number;
  description: string | null;
  xpCost: number | null;
  flexXp: number | null;
  age: number | null;
  attrDeltas: Record<string, number>;
  traitGrants: Grant[];
  skillGrants: Grant[];
  parametrizedGrants: { language: number; protocols: number; streetwise: number };
  deferredPicks: DeferredPick[];
  morePicks: DeferredPick[];
  phenotypes: string[];
  prerequisites: Prerequisites;
  conditionals: Conditional[];
  availability: string[];
  offeredBy?: { school: string; tier: "basic" | "advanced" | "specialist"; condition?: string }[];
  inDefaultSchoolList?: boolean;
  fieldClass?: "civ" | "pol" | "mil";
  schoolFlags?: string[];
  fields?: Fields;
  /** Stage-2 sibko modules only: the Basic/Advanced clan XP steps. */
  clanXp?: Effects["clanXp"];
  /** Stage-2 sibko modules only: the advanced clan field list. */
  clanFieldList?: string[];
  source: { file: string; line: number };
}

/** Index/name removal records; shapes vary per gating function. */
export interface RemovalRecord {
  condition?: string | null;
  removeAt?: number;
  resolvesTo?: string | null;
  affIndex?: number;
  subCondition?: string | null;
  traitContext?: string | null;
  removed?: string[];
}

export interface GatingEntry {
  stage: number;
  kind:
    | "affGate"
    | "hardElem"
    | "subtractive"
    | "sibkoPicker"
    | "sibkoBranch"
    | "clanFieldList"
    | "schoolListGate"
    | "schoolFieldBranch"
    | "listGate";
  name?: string;
  function?: string;
  appliesTo?: string;
  /** Raw C++ condition, verbatim modulo whitespace. */
  condition?: string;
  /** Resolved affiliation names the entry applies to. */
  affiliations?: string[];
  offered?: string[];
  offeredIf?: string[];
  offeredElse?: string[];
  requiresAnyTrait?: string[];
  removed?: string[];
  conditionedRemovals?: { condition: string; removed: string[] }[];
  /** removeAt indices with the name each index resolves to, when computable. */
  removals?: RemovalRecord[];
  branches?: { condition: string | null; offered: string[] }[];
  schools?: string[];
  effects?: Effects;
  source: { file: string; line: number };
}

export interface ModulesFile {
  meta: {
    generatedBy: string;
    source: { repo: string; rev: string; files: Record<string, number> };
    affiliations: string[];
    tableM: Record<string, { blocks: number; distinct: number }>;
    tableG: Record<string, number>;
    notes: string[];
  };
  modules: ModuleEntry[];
  gating: GatingEntry[];
}

// ---------------------------------------------------------------------------
// Lexical helpers
// ---------------------------------------------------------------------------

export function toLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** Strip a trailing `//` comment only when outside a string literal. */
export function stripTrailingComment(line: string): string {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") inStr = !inStr;
    if (!inStr && ch === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

/** Decode a C string literal body (`\n`, `\"`, `\\`). */
export function unescapeCpp(raw: string): string {
  return raw.replace(/\\(.)/g, (_m, ch: string) => (ch === "n" ? "\n" : ch === "t" ? "\t" : ch));
}

/** All `"…"` literals on a line, in order. */
export function stringLiterals(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) out.push(unescapeCpp(m[1]));
  return out;
}

export interface FnBody {
  lines: string[];
  /** 1-based file line number of the function body's first line. */
  startLine: number;
}

/** Extract a function body by brace matching from its signature line. */
export function extractFunction(text: string, signature: RegExp): FnBody {
  const all = toLines(text);
  const start = all.findIndex((l) => signature.test(l));
  if (start === -1) throw new Error(`Function not found: ${String(signature)}`);
  const body: string[] = [];
  let depth = 0;
  let opened = false;
  for (let i = start; i < all.length; i++) {
    for (const ch of all[i]) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (!opened) {
      if (all[i].includes("{")) opened = true;
      continue;
    }
    if (depth === 0) break; // closing brace line
    body.push(all[i]);
  }
  return { lines: body, startLine: start + 2 };
}

/** Split a dispatch body into top-level `if (<param> == "<name>") { … }` blocks. */
export function splitModuleBlocks(
  fn: FnBody,
  param: string,
  file: string,
): { name: string; lines: string[]; line: number }[] {
  const blocks: { name: string; lines: string[]; line: number }[] = [];
  const open = new RegExp(`^if\\s*\\(\\s*${param}\\s*==\\s*"([^"]+)"\\s*\\)\\s*\\{`);
  for (let i = 0; i < fn.lines.length; i++) {
    const m = open.exec(fn.lines[i].trim());
    if (!m) continue;
    const blockStart = fn.startLine + i;
    const body: string[] = [];
    let depth = 1;
    i++;
    while (i < fn.lines.length && depth > 0) {
      for (const ch of fn.lines[i]) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      if (depth > 0) body.push(fn.lines[i]);
      i++;
    }
    blocks.push({ name: m[1], lines: body, line: blockStart });
  }
  if (blocks.length === 0) throw new Error(`No ${param} blocks found in ${file}`);
  return blocks;
}

// ---------------------------------------------------------------------------
// Statement interpreter
// ---------------------------------------------------------------------------

export class BlockInterpreter {
  readonly effects: Effects = {};
  private lastSwpstr: string | null = null;

  constructor(
    private readonly stage: number,
    private readonly subskills: Record<string, string[]>,
  ) {}

  consume(rawLine: string): void {
    const code = stripTrailingComment(rawLine).trim().replace(/;+$/, ";");
    if (code === "" || code === "}" || code === "{") return;
    if (code.startsWith("//")) return;
    // Control scaffolding is handled by the block walker (`interpretBlock`);
    // the interpreter only ever sees plain statements.
    if (/^if\s*\(/.test(code) || /^}\s*else\s*\{$/.test(code) || /^else\s*\{$/.test(code)) return;
    if (this.tryStatement(code)) return;
    throw new Error(`Unrecognized statement in stage ${this.stage} block:\n  ${rawLine.trim()}`);
  }

  private tryStatement(code: string): boolean {
    const s = this.stage;
    const pfx = `s${s}`;

    // Local declarations, control scaffolding, returns.
    if (/^(QString|QStringList|int|bool)\s.*;$/.test(code)) return true;
    if (code.startsWith("return ") || code === "break;") return true;

    // swpstr = "Name"; — remembered for the qMakePair idiom that follows.
    const swp = /^swpstr\s*=\s*"((?:[^"\\]|\\.)*)"\s*;$/.exec(code);
    if (swp) {
      this.lastSwpstr = unescapeCpp(swp[1]);
      return true;
    }

    // tooltip
    const tip = new RegExp(`^${pfx}toolTip\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*;$`).exec(code);
    if (tip) {
      this.effects.description = unescapeCpp(tip[1]);
      return true;
    }

    // stage-1 stable block id
    const num = new RegExp(`^${pfx}ChildHoodNumber\\s*=\\s*(\\d+)\\s*;$`).exec(code);
    if (num) {
      this.effects.desktopNumber = parseInt(num[1], 10);
      return true;
    }

    // XP cost
    const cost = new RegExp(`^${pfx}XpCost\\s*=\\s*(\\d+)\\s*;$`).exec(code);
    if (cost) {
      this.effects.xpCost = parseInt(cost[1], 10);
      return true;
    }

    // flex XP (set or +=)
    const flex = new RegExp(`^${pfx}FlexXP\\s*(\\+?=)\\s*(\\d+)\\s*;$`).exec(code);
    if (flex) {
      if (flex[1] === "+=") this.effects.flexXpDelta = parseInt(flex[2], 10);
      else this.effects.flexXp = parseInt(flex[2], 10);
      return true;
    }

    // age (stage 4)
    const age = new RegExp(`^${pfx}Age\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s*;$`).exec(code);
    if (age) {
      this.effects.age = Number(age[1]);
      return true;
    }

    // attribute deltas (raw XP) — stage 4 names the map s4AttrMod
    const attrMap = s === 4 ? "s4AttrMod" : pfx + "Attr";
    const attr = new RegExp(`^${attrMap}\\["(\\w+)"\\]\\s*(\\+?=)\\s*(-?\\d+)\\s*;$`).exec(code);
    if (attr) {
      const [, key, op, val] = attr;
      const map = (this.effects.attrDeltas ??= {});
      if (op === "+=") map[key] = (map[key] ?? 0) + parseInt(val, 10);
      else map[key] = parseInt(val, 10);
      return true;
    }

    // signed grants
    const trait = new RegExp(`^S${s}AddTraits\\("((?:[^"\\\\]|\\\\.)*)"\\s*,\\s*(-?\\d+)\\s*\\)\\s*;$`).exec(code);
    if (trait) {
      (this.effects.traitGrants ??= []).push({ name: unescapeCpp(trait[1]), xp: parseInt(trait[2], 10) });
      return true;
    }
    const skill = new RegExp(`^S${s}AddSkills\\("((?:[^"\\\\]|\\\\.)*)"\\s*,\\s*(-?\\d+)\\s*\\)\\s*;$`).exec(code);
    if (skill) {
      (this.effects.skillGrants ??= []).push({ name: unescapeCpp(skill[1]), xp: parseInt(skill[2], 10) });
      return true;
    }

    // parametrized Language / Protocols / Streetwise grants
    const aff = new RegExp(`^${pfx}Aff(Lang|Prot|Street)\\s*=\\s*(-?\\d+)\\s*;$`).exec(code);
    if (aff) {
      const key = aff[1] === "Lang" ? "language" : aff[1] === "Prot" ? "protocols" : "streetwise";
      (this.effects.parametrizedGrants ??= {})[key] = parseInt(aff[2], 10);
      return true;
    }

    // phenotype candidate list (Trueborn Creche)
    const phen = new RegExp(`^${pfx}Phenotype\\s*<<\\s*(.+);$`).exec(code);
    if (phen) {
      (this.effects.phenotypes ??= []).push(...stringLiterals(phen[1]));
      return true;
    }

    // sibko XP machinery (stage-2 dispatch functions)
    const clanXp = new RegExp(`^${pfx}Clan(Basic|Adv)(XP|StepXP|RebateXP)\\s*=\\s*(\\d+)\\s*;$`).exec(code);
    if (clanXp) {
      const bucket = clanXp[1] === "Basic" ? "basic" : "advanced";
      const cx = (this.effects.clanXp ??= {});
      const g = (cx[bucket] ??= { xp: 0, stepXp: 0, rebateXp: 0 });
      if (clanXp[2] === "XP") g.xp = parseInt(clanXp[3], 10);
      else if (clanXp[2] === "StepXP") g.stepXp = parseInt(clanXp[3], 10);
      else g.rebateXp = parseInt(clanXp[3], 10);
      return true;
    }
    const clanField = new RegExp(`^${pfx}ClanAdvFieldList\\s*<<\\s*(.+);$`).exec(code);
    if (clanField) {
      (this.effects.clanFieldList ??= []).push(...stringLiterals(clanField[1]));
      return true;
    }

    if (this.tryPick(code)) return true;
    if (this.tryFields(code)) return true;
    if (this.tryPrereq(code)) return true;
    return false;
  }

  /** Deferred "…/Any" picks, flex-XP more-picks, and their bookkeeping. */
  private tryPick(code: string): boolean {
    const s = this.stage;
    const pfx = `s${s}`;

    // Labels: stage 1/2 module picks, stage 2/3 advanced picks, stage 4 elems.
    const label = new RegExp(
      `^${pfx}(?:ChildHoodLabel(\\d)|ChildHoodLabelAdv(\\d)|LabelElem(\\d))\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*;$`,
    ).exec(code);
    if (label) {
      const pick = this.openPick(parseInt(label[1] ?? label[2] ?? label[3], 10));
      pick.label = unescapeCpp(label[4]);
      return true;
    }

    // Stage-1/2 flex-XP more-picks (S1MoreButton / S2More dialog data, §4).
    const moreLabel = new RegExp(`^${pfx}subAffElem(\\d)LabelMore\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*;$`).exec(code);
    if (moreLabel) {
      const pick = this.getMorePick(parseInt(moreLabel[1], 10));
      pick.label = unescapeCpp(moreLabel[2]);
      return true;
    }
    const moreXp = new RegExp(`^${pfx}affSkillsElem(\\d)More\\s*=\\s*(-?\\d+)\\s*;$`).exec(code);
    if (moreXp) {
      const pick = this.getMorePick(parseInt(moreXp[1], 10));
      pick.xp = parseInt(moreXp[2], 10);
      return true;
    }
    const moreList = new RegExp(`^${pfx}subAffElem(\\d)More\\s*<<\\s*(.+);$`).exec(code);
    if (moreList) {
      const pick = this.getMorePick(parseInt(moreList[1], 10));
      (pick.candidates ??= []).push(...stringLiterals(moreList[2]));
      return true;
    }

    // Candidate lists — stage 1/2 module picks and stage 2/3 advanced picks.
    const attrList = new RegExp(
      `^${pfx}(ChildHoodAttr(\\d)|ChildHoodAttrAdv(\\d))\\s*(=\\s*CreateSubSkillList\\("([^"]+)"\\)|<<\\s*(.+))\\s*;\\s*$`,
    ).exec(code);
    if (attrList) {
      const pick = this.openPick(parseInt(attrList[2] ?? attrList[3], 10));
      if (attrList[5]) {
        pick.candidatesSource = `CreateSubSkillList(${attrList[5]})`;
        pick.candidates = this.subSkillCandidates(attrList[5]);
      } else {
        pick.candidatesSource = "literal";
        (pick.candidates ??= []).push(...stringLiterals(attrList[4] ?? ""));
      }
      return true;
    }

    // Stage-4 candidate lists.
    const s4skill = /^s4SkillsElem(\d)\s*(=\s*CreateSubSkillList\("([^"]+)"\)|<<\s*(.+))\s*;\s*$/.exec(code);
    if (s4skill) {
      const pick = this.openPick(parseInt(s4skill[1], 10));
      if (s4skill[3]) {
        pick.candidatesSource = `CreateSubSkillList(${s4skill[3]})`;
        pick.candidates = this.subSkillCandidates(s4skill[3]);
      } else if (s4skill[4] && s4skill[4].includes("S4FieldSkills")) {
        pick.candidatesSource = s4skill[4].trim();
        pick.candidates = null;
      } else {
        pick.candidatesSource = "literal";
        (pick.candidates ??= []).push(...stringLiterals(s4skill[4] ?? ""));
      }
      return true;
    }
    const s4dyn = /^s4SkillsElem(\d)\.append\(clanFieldSkills\[i\]\.first\)\s*;$/.exec(code);
    if (s4dyn) {
      const pick = this.openPick(parseInt(s4dyn[1], 10));
      pick.candidatesSource = "clanFieldSkills";
      pick.candidates = null;
      return true;
    }
    const s4traits = /^s4TraitsElem(\d)\s*<<\s*(.+);$/.exec(code);
    if (s4traits) {
      const pick = this.openPick(parseInt(s4traits[1], 10), "trait");
      pick.candidatesSource = "literal";
      (pick.candidates ??= []).push(...stringLiterals(s4traits[2]));
      return true;
    }
    const s4attrs = /^s4AttrElem(\d)\s*<<\s*(.+);$/.exec(code);
    if (s4attrs) {
      const pick = this.openPick(parseInt(s4attrs[1], 10), "attribute");
      pick.candidatesSource = "literal";
      (pick.candidates ??= []).push(...stringLiterals(s4attrs[2]));
      return true;
    }

    // Pick XP and repeats.
    const pickXp = new RegExp(
      `^${pfx}(?:ChildHoodSkills(\\d)|ChildHoodSkillsAdv(\\d)|Elem(\\d))\\s*=\\s*(-?\\d+)\\s*;$`,
    ).exec(code);
    if (pickXp) {
      const pick = this.openPick(parseInt(pickXp[1] ?? pickXp[2] ?? pickXp[3], 10));
      pick.xp = parseInt(pickXp[4], 10);
      return true;
    }
    const pickTraitXp = new RegExp(
      `^${pfx}(?:ChildHoodTraits(\\d)|ChildHoodTraitsAdv(\\d))\\s*=\\s*(-?\\d+)\\s*;$`,
    ).exec(code);
    if (pickTraitXp) {
      const pick = this.openPick(parseInt(pickTraitXp[1] ?? pickTraitXp[2], 10), "trait");
      pick.xp = parseInt(pickTraitXp[3], 10);
      return true;
    }
    const repit = /^s4Repit(\d)\s*=\s*(\d+)\s*;$/.exec(code);
    if (repit) {
      const pick = this.openPick(parseInt(repit[1], 10));
      pick.repeats = parseInt(repit[2], 10);
      return true;
    }

    // Stage-4 deterministic list post-processing, applied in order.
    const dedup = /^s4SkillsElem(\d)\.removeDuplicates\(\)\s*;$/.exec(code);
    if (dedup) {
      const pick = this.openPick(parseInt(dedup[1], 10));
      if (pick.candidates) pick.candidates = [...new Set(pick.candidates)];
      return true;
    }
    const sort = /^s4SkillsElem(\d)\.sort\(\)\s*;$/.exec(code);
    if (sort) {
      const pick = this.openPick(parseInt(sort[1], 10));
      pick.candidates?.sort();
      return true;
    }

    return false;
  }

  /** School field lists (stage 3 school blocks). */
  private tryFields(code: string): boolean {
    if (this.stage !== 3) return false;
    const list = /^s3(Basic|Adv|Spec)Field\s*<<\s*(.+);$/.exec(code);
    if (list) {
      const key = list[1] === "Basic" ? "basic" : list[1] === "Adv" ? "advanced" : "specialist";
      const fields = (this.effects.fields ??= { basic: null, advanced: null, specialist: null });
      const g = (fields[key] ??= { skills: [], age: null });
      g.skills.push(...stringLiterals(list[2]));
      return true;
    }
    const age = /^s3(Basic|Adv|Spec)FieldAge\s*=\s*(\d+(?:\.\d+)?)\s*;$/.exec(code);
    if (age) {
      const key = age[1] === "Basic" ? "basic" : age[1] === "Adv" ? "advanced" : "specialist";
      const fields = (this.effects.fields ??= { basic: null, advanced: null, specialist: null });
      const g = (fields[key] ??= { skills: [], age: null });
      g.age = Number(age[2]);
      return true;
    }
    return false;
  }

  private tryPrereq(code: string): boolean {
    const s = this.stage;
    const preAttr = new RegExp(`^s${s}PreAttr\\["(\\w+)"\\]\\s*(\\+?=)\\s*(\\d+)\\s*;$`).exec(code);
    if (preAttr) {
      const [, key, op, raw] = preAttr;
      const attrs = (this.effects.prerequisites ??= { attrs: {}, traits: [], skills: [] }).attrs;
      // The preamble clears the map, so the first += behaves like =; repeat
      // writes accumulate, faithful to either source form.
      const v = parseInt(raw, 10);
      attrs[key] = op === "+=" ? (attrs[key] ?? 0) + v : v;
      return true;
    }
    const prePair = new RegExp(
      `^s${s}Pre(Traits|Skills)\\.append\\(qMakePair\\((swpstr|"[^"]*"),\\s*(-?\\d+)\\)\\)\\s*;$`,
    ).exec(code);
    if (prePair) {
      const name = prePair[2] === "swpstr" ? this.lastSwpstr : unescapeCpp(prePair[2]);
      if (!name) throw new Error(`qMakePair without a known swpstr: ${code}`);
      const grant = { name, xp: parseInt(prePair[3], 10) };
      const pre = (this.effects.prerequisites ??= { attrs: {}, traits: [], skills: [] });
      if (prePair[1] === "Traits") pre.traits.push(grant);
      else pre.skills.push(grant);
      return true;
    }
    return false;
  }

  /** Resolve `CreateSubSkillList("Family")` against subskill.dat (§7.4). */
  private subSkillCandidates(family: string): string[] {
    const subs = this.subskills[family];
    if (!subs) throw new Error(`Unknown subskill family: ${family}`);
    return subs.map((sub) => `${family}/${sub}`).sort();
  }

  private openPick(slot: number, kind?: "trait" | "attribute"): DeferredPick {
    const arr = (this.effects.picks ??= []);
    let pick = arr.find((p) => p.slot === slot);
    if (!pick) {
      pick = { slot, label: null, kind: "skill", candidates: null, candidatesSource: null, xp: null, repeats: null };
      arr.push(pick);
      arr.sort((a, b) => a.slot - b.slot);
    }
    if (kind) pick.kind = kind;
    return pick;
  }

  private getMorePick(slot: number): DeferredPick {
    const arr = (this.effects.morePicks ??= []);
    let pick = arr.find((p) => p.slot === slot);
    if (!pick) {
      pick = { slot, label: null, kind: "attribute", candidates: [], candidatesSource: "literal", xp: null, repeats: null };
      arr.push(pick);
      arr.sort((a, b) => a.slot - b.slot);
    }
    return pick;
  }
}

/** Interpret a statement list into an Effects object (strict allowlist). */
export function captureEffects(
  lines: string[],
  stage: number,
  subskills: Record<string, string[]>,
): Effects {
  const it = new BlockInterpreter(stage, subskills);
  for (const l of lines) it.consume(l);
  return it.effects;
}

/**
 * Slice `lines[i]` (an `if (…) {` opener) into its body and an optional
 * `} else {` body. Returns the index just past the construct.
 */
export function sliceIfElse(
  lines: string[],
  i: number,
): { body: string[]; elseBody: string[] | null; next: number } {
  const ifBody: string[] = [];
  let depth = 1;
  let j = i + 1;
  while (j < lines.length && depth > 0) {
    // `} else {` terminates the if-body; its `{` opens the else-body and is
    // not counted here.
    if (depth === 1 && /^}\s*else\s*\{$/.test(stripTrailingComment(lines[j]).trim())) break;
    for (const ch of lines[j]) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth > 0) ifBody.push(lines[j]);
    j++;
  }
  let elseBody: string[] | null = null;
  let next = j;
  if (j < lines.length && /^}\s*else\s*\{\s*$/.test(stripTrailingComment(lines[j]).trim())) {
    const ebody: string[] = [];
    let eDepth = 1;
    let k = j + 1;
    while (k < lines.length && eDepth > 0) {
      for (const ch of lines[k]) {
        if (ch === "{") eDepth++;
        else if (ch === "}") eDepth--;
      }
      if (eDepth > 0) ebody.push(lines[k]);
      k++;
    }
    elseBody = ebody;
    next = k;
  }
  return { body: ifBody, elseBody, next };
}

/**
 * Interpret one dispatch-block body: plain statements go to the interpreter,
 * nested `if (cond) { … } [else { … }]` sub-blocks become `Conditional`s
 * (recursively) with their own effects, so runtime-conditioned writes stay
 * separated from the block's unconditional baseline.
 */
export function interpretBlock(
  lines: string[],
  stage: number,
  subskills: Record<string, string[]>,
): { effects: Effects; conditionals: Conditional[] } {
  const it = new BlockInterpreter(stage, subskills);
  const conditionals: Conditional[] = [];
  let i = 0;
  while (i < lines.length) {
    const code = stripTrailingComment(lines[i]).trim();
    if (/^for\s*\(/.test(code)) {
      // Loop scaffolding (e.g. appending clanFieldSkills entries): skipped
      // wholesale; the appended statement's semantic is captured by the
      // dedicated dynamic-candidate handler.
      let depth = 0;
      let j = i;
      do {
        for (const ch of lines[j]) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        j++;
      } while (j < lines.length && (depth > 0 || j === i));
      i = j;
      continue;
    }
    const ifm = /^if\s*\((.*)\)\s*\{$/.exec(code);
    if (ifm) {
      const { body, elseBody, next } = sliceIfElse(lines, i);
      const nested = interpretBlock(body, stage, subskills);
      const cond: Conditional = {
        condition: ifm[1].trim(),
        effects: nested.effects,
        elseEffects: elseBody ? interpretBlock(elseBody, stage, subskills).effects : null,
      };
      if (nested.conditionals.length > 0) cond.conditionals = nested.conditionals;
      conditionals.push(cond);
      i = next;
      continue;
    }
    it.consume(lines[i]);
    i++;
  }
  return { effects: it.effects, conditionals };
}

/** Assemble a ModuleEntry from interpreted effects. */
export function buildModule(
  stage: number,
  kind: ModuleEntry["kind"],
  name: string,
  blockIndex: number,
  sourceLine: number,
  file: string,
  effects: Effects,
  conditionals: Conditional[],
): ModuleEntry {
  const entry: ModuleEntry = {
    stage,
    kind,
    name,
    blockIndex,
    desktopNumber: effects.desktopNumber,
    description: effects.description ?? null,
    xpCost: effects.xpCost ?? null,
    flexXp: effects.flexXp ?? null,
    age: effects.age ?? null,
    attrDeltas: effects.attrDeltas ?? {},
    traitGrants: effects.traitGrants ?? [],
    skillGrants: effects.skillGrants ?? [],
    parametrizedGrants: {
      language: effects.parametrizedGrants?.language ?? 0,
      protocols: effects.parametrizedGrants?.protocols ?? 0,
      streetwise: effects.parametrizedGrants?.streetwise ?? 0,
    },
    deferredPicks: effects.picks ?? [],
    morePicks: effects.morePicks ?? [],
    phenotypes: effects.phenotypes ?? [],
    prerequisites: effects.prerequisites ?? { attrs: {}, traits: [], skills: [] },
    conditionals,
    availability: [],
    source: { file, line: sourceLine },
  };
  if (effects.clanXp) entry.clanXp = effects.clanXp;
  if (effects.clanFieldList) entry.clanFieldList = effects.clanFieldList;
  if (effects.fields) entry.fields = effects.fields;
  return entry;
}

/** Parse a module dispatch function into interpreted module entries. */
export function parseDispatchFunction(
  readSource: (relPath: string) => string,
  file: string,
  fnSignature: RegExp,
  param: string,
  stage: number,
  kind: ModuleEntry["kind"],
  subskills: Record<string, string[]>,
): ModuleEntry[] {
  const fn = extractFunction(readSource(file), fnSignature);
  const blocks = splitModuleBlocks(fn, param, file);
  return blocks.map((b, index) => {
    const parsed = interpretBlock(b.lines, stage, subskills);
    return buildModule(stage, kind, b.name, index, b.line, file, parsed.effects, parsed.conditionals);
  });
}

// ---------------------------------------------------------------------------
// §8 pattern counting (grep parity: raw line matches, comments included)
// ---------------------------------------------------------------------------

/** Count lines containing `needle` — matches `grep -c 'needle'`. */
export function countLinesMatching(file: string, readSource: (rel: string) => string, needle: string): number {
  return toLines(readSource(file)).filter((l) => l.includes(needle)).length;
}

/** Distinct `param == "X"` names — matches `grep -o … | sort -u | wc -l`. */
export function countDistinctNames(file: string, param: string, readSource: (rel: string) => string): number {
  const re = new RegExp(`${param}\\s*==\\s*"([^"]+)"`, "g");
  const names = new Set<string>();
  for (const line of toLines(readSource(file))) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) names.add(m[1]);
  }
  return names.size;
}

// ---------------------------------------------------------------------------
// Shared readers (source layout identical to scripts/convert-dat.ts)
// ---------------------------------------------------------------------------

export function makeReader(sourceRoot: string): (relPath: string) => string {
  return (relPath: string) => readFileSync(join(sourceRoot, relPath), "latin1");
}