/**
 * Step #11 rules extraction CLI (PLAN.md → Step 11): reads the desktop's
 * stage tables and emits `data/rules/modules.json`. The statement vocabulary
 * lives in `scripts/extract-rules-lib.ts`; ground truth is `docs/RULES.md`
 * §6.1 (affiliation gating), §7.4 (module anatomy) and §8 (Table M/G).
 *
 * Run with:  npm run rules:extract
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  type GatingEntry,
  type ModuleEntry,
  type ModulesFile,
  countDistinctNames,
  countLinesMatching,
  extractFunction,
  interpretBlock,
  makeReader,
  parseDispatchFunction,
  sliceIfElse,
  splitModuleBlocks,
  stringLiterals,
  stripTrailingComment,
  toLines,
  type Conditional,
  type Effects,
  type FnBody,
} from "./extract-rules-lib";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const RESOURCE_DIR =
  process.env.BTCC_SOURCE_DIR ??
  resolve(repoRoot, "..", "Battletech-Character-Creator", "resource");
/** Stage C++ sources live in the checkout root, one level above `resource/`. */
const SOURCE_ROOT = resolve(RESOURCE_DIR, "..");

const OUT_DIR = join(repoRoot, "data", "rules");
const OUT_FILE = join(OUT_DIR, "modules.json");

const STAGE_FILES: Record<number, string> = {
  1: "stage1_resurce.cpp",
  2: "stage2_resurce.cpp",
  3: "stage3_resurce.cpp",
  4: "stage4_resurce.cpp",
};

const readSource = makeReader(SOURCE_ROOT);

export type { ModuleEntry, ModulesFile } from "./extract-rules-lib";

/** `resource/affilations.dat` line order IS the numeric affiliation index. */
function readAffiliations(): string[] {
  const text = readFileSync(join(RESOURCE_DIR, "affilations.dat"), "latin1");
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function readSourceRev(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: SOURCE_ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function loadSubskills(): Record<string, string[]> {
  return JSON.parse(readFileSync(join(repoRoot, "data", "rules", "subskills.json"), "utf8")) as Record<
    string,
    string[]
  >;
}

// ---------------------------------------------------------------------------
// Set algebra over affiliation indices (null = unrestricted)
// ---------------------------------------------------------------------------

type AffSet = Set<number> | null;

function intersect(a: AffSet, b: AffSet): AffSet {
  if (a === null) return b;
  if (b === null) return a;
  const out = new Set<number>();
  for (const v of a) if (b.has(v)) out.add(v);
  return out;
}

function union(a: AffSet, b: AffSet): AffSet {
  if (a === null || b === null) return null;
  return new Set([...a, ...b]);
}

function complement(a: AffSet, total: number): AffSet {
  if (a === null) return null;
  const out = new Set<number>();
  for (let i = 0; i < total; i++) if (!a.has(i)) out.add(i);
  return out;
}

/**
 * Affiliation-restrictions of a condition. Non-affiliation predicates
 * (caste, traits, schools, ComStar flags) count as satisfied — they cannot
 * be resolved at affiliation granularity and are kept verbatim on the entry.
 * The desktop's `!= A || != B` conditions evaluate to "always" and are
 * preserved as such (RULES.md §9).
 */
function affMatchOf(condition: string, affiliations: string[]): AffSet {
  let acc: AffSet = null;
  for (const orPart of splitTop(condition, "||")) {
    let group: AffSet = null;
    for (const andPart of splitTop(orPart, "&&")) {
      const factor = andPart.trim();
      if (factor.startsWith("!(") && factor.endsWith(")")) {
        const inner = factor.slice(2, -1);
        group = intersect(group, complement(affMatchOf(inner, affiliations), affiliations.length));
        continue;
      }
      if (factor.startsWith("(") && factor.endsWith(")")) {
        group = intersect(group, affMatchOf(factor.slice(1, -1), affiliations));
        continue;
      }
      const eq = /(?:s4AffName\.first|affVar)\s*==\s*"([^"]+)"/.exec(factor);
      const ne = /(?:s4AffName\.first|affVar)\s*!=\s*"([^"]+)"/.exec(factor);
      let set: AffSet;
      if (eq) {
        const idx = affiliations.indexOf(eq[1]);
        if (idx === -1) {
          throw new Error(
            `Unknown affiliation name "${eq[1]}" in condition — does affilations.dat match the C++ source?`,
          );
        }
        set = new Set([idx]);
      } else if (ne) {
        const idx = affiliations.indexOf(ne[1]);
        if (idx === -1) {
          throw new Error(
            `Unknown affiliation name "${ne[1]}" in condition — does affilations.dat match the C++ source?`,
          );
        }
        set = new Set(affiliations.map((_, i) => i));
        set.delete(idx);
      } else {
        if (factor.includes("s4AffName") || factor.includes("affVar")) {
          throw new Error(`Unparsed affiliation condition: ${factor}`);
        }
        set = null;
      }
      group = intersect(group, set);
      if (group !== null && group.size === 0) break;
    }
    // acc starts as "nothing accumulated" (not "unrestricted"), so the first
    // OR-group seeds it and later groups merge by union.
    acc = acc === null ? group : union(acc, group);
  }
  return acc;
}

/** Split at paren-depth 0 only (`sep` is `||` or `&&`). */
function splitTop(condition: string, sep: "||" | "&&"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < condition.length; i++) {
    const ch = condition[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && condition.startsWith(sep, i)) {
      parts.push(current);
      current = "";
      i += sep.length - 1;
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

// ---------------------------------------------------------------------------
// List-literal readers with wrapped-line support
// ---------------------------------------------------------------------------

/** Collect `"…"` literals from a `<<` chain that may wrap across lines. */
function readWrappedList(
  lines: string[],
  start: number,
  firstTail: string,
): { lits: string[]; next: number } {
  const lits = stringLiterals(firstTail);
  let j = start;
  while (!stripTrailingComment(lines[j]).trim().endsWith(";")) {
    j++;
    lits.push(...stringLiterals(stripTrailingComment(lines[j]).trim()));
  }
  return { lits, next: j };
}

// ---------------------------------------------------------------------------
// Choice-switch and list-branch parsers (stages 1–3 gating)
// ---------------------------------------------------------------------------

interface SwitchBranch {
  affIndex: number;
  subCondition: string | null;
  isElse: boolean;
  offered: string[] | "hardElem";
  line: number;
}

/**
 * Parse a `switch (affVar)` choice function (`S1ChoiceChillHood`,
 * `S2ChoiceLateChildHood`). Only the statement shapes present in those two
 * functions are recognized; anything else in the body aborts extraction.
 */
function parseAffSwitch(
  file: string,
  fnSignature: RegExp,
  listVar: string,
  hardElemFn: string | null,
): { branches: { affIndex: number; subCondition: string | null; isElse: boolean; offered: string[] | "hardElem"; line: number }[] } {
  const fn = extractFunction(readSource(file), fnSignature);
  const branches: { affIndex: number; subCondition: string | null; isElse: boolean; offered: string[] | "hardElem"; line: number }[] = [];
  let aff: number | null = null;
  let subCondition: string | null = null;
  let isElse = false;

  for (let i = 0; i < fn.lines.length; i++) {
    const code = stripTrailingComment(fn.lines[i]).trim();
    const line = fn.startLine + i;
    const caseM = /^case\s+(\d+)\s*:$/.exec(code);
    const defM = /^default\s*:$/.exec(code);

    if (caseM || defM) {
      aff = caseM ? parseInt(caseM[1], 10) : -1;
      subCondition = null;
      isElse = false;
      continue;
    }
    if (aff === null) continue;

    const subIf = /^if\s*\((subAffVar[^)]*)\)\s*\{$/.exec(code);
    if (subIf) {
      subCondition = subIf[1].replace(/\s+/g, " ").trim();
      isElse = false;
      continue;
    }
    if (/^}\s*else\s*\{$/.test(code)) {
      isElse = true;
      continue;
    }
    if (/^\}$/.test(code) || code === "break;") continue;

    const listStart = new RegExp(`^${listVar}\\s*<<\\s*(.*)$`).exec(code);
    if (listStart) {
      const wrapped = readWrappedList(fn.lines, i, listStart[1]);
      branches.push({ affIndex: aff, subCondition, isElse, offered: wrapped.lits, line });
      i = wrapped.next;
      continue;
    }
    const hard = hardElemFn ? new RegExp(`^${listVar}\\s*=\\s*${hardElemFn}\\(`).exec(code) : null;
    if (hard) {
      branches.push({ affIndex: aff, subCondition, isElse, offered: "hardElem", line });
      continue;
    }
  }
  return { branches };
}

interface ListBranch {
  condition: string | null;
  offered: string[];
}

/**
 * Collect `{condition, offered}` records from a function whose bodies append
 * to one list variable under if/else nesting
 * (`S1HardElem`, `S2TruebornSibko`, `S3ClearAffilation`).
 */
function captureListBranches(
  file: string,
  fnSignature: RegExp,
  listVar: string,
): ListBranchRecord[] {
  const fn = extractFunction(readSource(file), fnSignature);
  const out: ListBranchRecord[] = [];

  function walk(lines: string[], conds: { text: string; isElse: boolean }[]): void {
    let i = 0;
    while (i < lines.length) {
      const code = stripTrailingComment(lines[i]).trim();
      const ifm = /^if\s*\((.*)\)\s*\{$/.exec(code);
      if (ifm) {
        const { body, elseBody, next } = sliceIfElse(lines, i);
        walk(body, [...conds, { text: ifm[1].trim(), isElse: false }]);
        if (elseBody) walk(elseBody, [...conds, { text: ifm[1].trim(), isElse: true }]);
        i = next;
        continue;
      }
      const listM = new RegExp(`^${listVar}\\s*<<\\s*(.*)$`).exec(code);
      if (listM) {
        const wrapped = readWrappedList(lines, i, listM[1]);
        out.push({ condition: composeIf(conds), offered: wrapped.lits });
        i = Math.max(wrapped.next, i + 1);
        continue;
      }
      i++;
    }
  }

  walk(fn.lines, []);
  return out;
}

interface ListBranchRecord {
  condition: string | null;
  offered: string[];
}

function composeIf(conds: { text: string; isElse: boolean }[]): string | null {
  if (conds.length === 0) return null;
  return conds
    .map(({ text, isElse }) => (isElse ? `!(${text})` : text.includes("||") ? `(${text})` : text))
    .join(" && ");
}

// ---------------------------------------------------------------------------
// Stage-2 subtractive and sibko gating
// ---------------------------------------------------------------------------

interface S2HardElemAffilParse {
  removals: {
    affIndex: number;
    subCondition: string | null;
    traitContext: "with" | "without" | null;
    removeAt: number;
  }[];
  conditionedRemovals: { condition: string; removed: string[] }[];
}

/**
 * Parse `S2HardElemAffil` into index-based removal records. Every removal in
 * it is sub-affiliation- or trait-conditioned, so affiliation-level
 * availability is unaffected (union semantics); the records are kept for the
 * gating entry and resolved against the choice list at consumption time.
 */
function parseS2HardElemAffil(file: string): S2HardElemAffilParse {
  const fn = extractFunction(readSource(file), /Stage2::S2HardElemAffil\(/);
  const removals: S2HardElemAffilParse["removals"] = [];
  const conditionedRemovals: { condition: string; removed: string[] }[] = [];
  let aff: number | null = null;
  let subCondition: string | null = null;
  let traitContext: "with" | "without" | null = null;

  for (const raw of fn.lines) {
    const code = stripTrailingComment(raw).trim();
    const caseM = /^case\s+(\d+)\s*:$/.exec(code);
    const defM = /^default\s*:$/.exec(code);
    if (caseM || defM) {
      aff = caseM ? parseInt(caseM[1], 10) : -1;
      subCondition = null;
      traitContext = null;
      continue;
    }
    const subIf = /^if\s*\((subAffVar[^)]*)\)\s*\{$/.exec(code);
    if (subIf) {
      subCondition = subIf[1].replace(/\s+/g, " ").trim();
      traitContext = null;
      continue;
    }
    if (/^if\s*\(\s*tmpChek\s*==\s*true\s*\)\s*\{$/.test(code)) {
      traitContext = "with";
      continue;
    }
    if (/^}\s*else\s*\{$/.test(code)) {
      if (traitContext === "with") traitContext = "without";
      continue;
    }
    const removeAt = /tmpList\.removeAt\((\d+)\)\s*;/.exec(code);
    if (removeAt && aff !== null) {
      removals.push({
        affIndex: aff,
        subCondition,
        traitContext,
        removeAt: parseInt(removeAt[1], 10),
      });
      continue;
    }
    const filter = /\[\w+\]\s*!=\s*"([^"]+)"\s*\)\s*\{/.exec(code);
    if (filter) {
      conditionedRemovals.push({ condition: "character has the Illiterate trait", removed: [filter[1]] });
      continue;
    }
  }
  return { removals, conditionedRemovals };
}

interface S2ClearListElemParse {
  /** Unconditional removals per affiliation index; -1 = switch-default. */
  perCase: Map<number, string[]>;
  conditionedRemovals: { condition: string; removed: string[] }[];
}

/**
 * Parse `S2ClearListElem` (subtractive filter). Removals inside a
 * `nameStage1 == …` if are conditioned on the Stage-1 module; the rest are
 * unconditional for their switch case.
 */
function parseS2ClearListElem(file: string): S2ClearListElemParse {
  const fn = extractFunction(readSource(file), /Stage2::S2ClearListElem\(/);
  const perCase = new Map<number, string[]>();
  const conditionedRemovals: { condition: string; removed: string[] }[] = [];
  let aff: number | null = null;
  let nameStage1Cond: string | null = null;
  let condDepth: number | null = null;
  let depth = 0;

  for (const raw of fn.lines) {
    for (const ch of raw) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    const code = stripTrailingComment(raw).trim();
    const caseM = /^case\s+(\d+)\s*:$/.exec(code);
    const defM = /^default\s*:$/.exec(code);
    if (caseM || defM) {
      aff = caseM ? parseInt(caseM[1], 10) : -1;
      nameStage1Cond = null;
      condDepth = null;
      continue;
    }
    if (condDepth !== null && depth <= (condDepth as number)) {
      nameStage1Cond = null;
      condDepth = null;
    }
    const nameIf = /^if\s*\((nameStage1[^)]*)\)\s*\{$/.exec(code);
    if (nameIf) {
      nameStage1Cond = nameIf[1].replace(/\s+/g, " ").trim();
      condDepth = depth;
      continue;
    }
    const filter = /^(?:swpTmpList|listElem)\[\w+\]\s*!=\s*"([^"]+)"\s*\)\s*\{$/.exec(code);
    if (filter && aff !== null) {
      if (nameStage1Cond) {
        conditionedRemovals.push({ condition: `Stage 1 module ${nameStage1Cond}`, removed: [filter[1]] });
      } else {
        const list = perCaseList(perCase, aff);
        list.push(filter[1]);
      }
      continue;
    }
  }
  return { perCase, conditionedRemovals };
}

function perCaseList(map: Map<number, string[]>, aff: number): string[] {
  let list = map.get(aff);
  if (!list) {
    list = [];
    map.set(aff, list);
  }
  return list;
}

// ---------------------------------------------------------------------------
// Stage-2 sibko gating (Table G: nameAttr ×11, nameClan ×2)
// ---------------------------------------------------------------------------

interface SibkoPickerParse {
  clanXp: Effects["clanXp"];
  branches: ListBranchRecord[];
}

/** Parse `S2FreebornSibko` / `S2TruebornSibko` (branch-of-service pickers). */
function parseSibkoPicker(
  file: string,
  fnSignature: RegExp,
): { clanXp: Effects["clanXp"]; branches: ListBranchRecord[] } {
  const fn = extractFunction(readSource(file), fnSignature);
  const clanXp: Effects["clanXp"] = {};
  for (const raw of fn.lines) {
    const code = stripTrailingComment(raw).trim();
    const m = /^s2Clan(Basic|Adv)(XP|StepXP|RebateXP)\s*=\s*(\d+)\s*;$/.exec(code);
    if (!m) continue;
    const bucket = m[1] === "Basic" ? "basic" : "advanced";
    const g = (clanXp[bucket] ??= { xp: 0, stepXp: 0, rebateXp: 0 });
    if (m[2] === "XP") g.xp = parseInt(m[3], 10);
    else if (m[2] === "StepXP") g.stepXp = parseInt(m[3], 10);
    else g.rebateXp = parseInt(m[3], 10);
  }
  return { clanXp, branches: captureListBranches(file, fnSignature, "tmpList") };
}

/** Parse the `nameAttr` dispatches (`S2FreebornSibkoAttr`, `S2TruebornSibkoAttr`). */
function parseSibkoAttrBranches(
  file: string,
  functionName: string,
  appliesTo: string,
  subskills: Record<string, string[]>,
): GatingEntry[] {
  const fn = extractFunction(readSource(file), new RegExp(`Stage2::${functionName}\\(`));
  const blocks = splitModuleBlocks(fn, "nameAttr", file);
  return blocks.map((b) => {
    const effects = interpretBlock(b.lines, 2, subskills).effects;
    return {
      stage: 2,
      kind: "sibkoBranch" as const,
      name: b.name,
      function: functionName,
      appliesTo,
      effects,
      source: { file, line: b.line },
    };
  });
}

/** Parse `S2ClanBasicFieldChange` — the Protocol/{affiliation} field list. */
function parseClanFieldList(file: string): GatingEntry {
  const fn = extractFunction(readSource(file), /Stage2::S2ClanBasicFieldChange\(/);
  let template: string | null = null;
  const fixed: string[] = [];
  for (const raw of fn.lines) {
    const code = stripTrailingComment(raw).trim();
    const tmpl = /^nameAffil\s*=\s*"([^"]*)"\s*\+\s*nameAffil\s*;$/.exec(code);
    if (tmpl) template = `${tmpl[1]}{nameAffil}`;
    const listM = /^swpNameAffil\s*<<\s*(.+);$/.exec(code);
    if (listM) {
      for (const lit of stringLiterals(listM[1])) fixed.push(lit);
      if (listM[1].includes("nameAffil")) fixed.push(template ?? "{nameAffil}");
    }
  }
  if (!template) throw new Error("S2ClanBasicFieldChange: template not found");
  return {
    stage: 2,
    kind: "clanFieldList",
    function: "S2ClanBasicFieldChange",
    branches: [{ condition: null, offered: fixed }],
    source: { file, line: 0 },
  };
}

// ---------------------------------------------------------------------------
// Stage-3 gating (Table G: school == ×10, affVar == ×4)
// ---------------------------------------------------------------------------

/** The constructor's default `S3SChoolList` (nine schools). */
function parseS3DefaultSchoolList(file: string): string[] {
  const fn = extractFunction(readSource(file), /Stage3::Stage3\(/);
  for (let i = 0; i < fn.lines.length; i++) {
    const m = /^S3SChoolList\s*<<\s*(.*)$/.exec(stripTrailingComment(fn.lines[i]).trim());
    if (m) return readWrappedList(fn.lines, i, m[1]).lits;
  }
  throw new Error("S3SChoolList default not found");
}

/** Parse `S3ClearAffilation` — affiliation overrides of the school list, by name. */
function parseS3ClearAffilation(file: string): { name: string; schools: string[]; line: number }[] {
  const fn = extractFunction(readSource(file), /Stage3::S3ClearAffilation\(/);
  const out: { name: string; schools: string[]; line: number }[] = [];
  let i = 0;
  while (i < fn.lines.length) {
    const code = stripTrailingComment(fn.lines[i]).trim();
    const ifm = /^if\s*\(\s*affVar\s*==\s*"([^"]+)"\s*\)\s*\{$/.exec(code);
    if (!ifm) {
      i++;
      continue;
    }
    const { body, next } = sliceIfElse(fn.lines, i);
    const schools: string[] = [];
    for (let bi = 0; bi < body.length; bi++) {
      const listM = /^S3SChoolList\s*<<\s*(.*)$/.exec(stripTrailingComment(body[bi]).trim());
      if (listM) {
        const wrapped = readWrappedList(body, bi, listM[1]);
        schools.push(...wrapped.lits);
        bi = wrapped.next;
      }
    }
    out.push({ name: ifm[1], schools, line: fn.startLine + i });
    i = next;
  }
  return out;
}

/** `S3SchoolEnter` maps each selectable school to its field class. */
function parseS3SchoolEnter(file: string): Record<string, "civ" | "pol" | "mil"> {
  const fn = extractFunction(readSource(file), /Stage3::S3SchoolEnter\(/);
  const map: Record<string, "civ" | "pol" | "mil"> = {};
  let i = 0;
  while (i < fn.lines.length) {
    const code = stripTrailingComment(fn.lines[i]).trim();
    const ifm = /^if\s*\(\s*nameElem\s*==\s*"([^"]+)"\s*\)\s*\{$/.exec(code);
    if (ifm) {
      const { body, next } = sliceIfElse(fn.lines, i);
      for (const raw of body) {
        const fieldM = /^nameField\s*=\s*"(civ|pol|mil)"\s*;$/.exec(stripTrailingComment(raw).trim());
        if (fieldM) map[ifm[1]] = fieldM[1] as "civ" | "pol" | "mil";
      }
      i = next;
      continue;
    }
    i++;
  }
  return map;
}

/** `S3SetSchool` maps each school to its field-class flags. */
function parseS3SetSchool(file: string): Record<string, string[]> {
  const fn = extractFunction(readSource(file), /Stage3::S3SetSchool\(/);
  const map: Record<string, string[]> = {};
  let i = 0;
  while (i < fn.lines.length) {
    const code = stripTrailingComment(fn.lines[i]).trim();
    const ifm = /^if\s*\(\s*nameElem\s*==\s*"([^"]+)"\s*\)\s*\{$/.exec(code);
    if (ifm) {
      const { body, next } = sliceIfElse(fn.lines, i);
      const flags: string[] = [];
      for (const raw of body) {
        const flagM = /^s3(Civ|Polic|Mil|Off)Field\s*=\s*true\s*;$/.exec(stripTrailingComment(raw).trim());
        if (flagM) flags.push(`${flagM[1].toLowerCase()}Field`);
      }
      (map[ifm[1]] ??= []).push(...flags);
      i = next;
      continue;
    }
    i++;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Stage-4 gating (S4ClearModulesList — affiliation/caste/trait conditioned)
// ---------------------------------------------------------------------------

interface S4BranchRecord {
  module: string;
  condition: string | null;
  affMatch: AffSet;
}

interface S4Frame {
  raw: string;
  isElse: boolean;
  affMatch: AffSet;
}

/**
 * Parse `S4ClearModulesList`: every `s4ModulesList << "…"` becomes a branch
 * record composed of its enclosing if/else conditions. `for`-loops (trait
 * scans) are skipped wholesale — their conditions are trait-dependent and
 * stay verbatim where they appear.
 */
function parseS4ClearModulesList(
  file: string,
  affiliations: string[],
): { records: S4BranchRecord[]; sourceLine: number } {
  const fn = extractFunction(readSource(file), /Stage4::S4ClearModulesList\(\)/);
  const records: S4BranchRecord[] = [];
  const stack: S4Frame[] = [];

  const compose = (): { condition: string | null; affMatch: AffSet } => {
    if (stack.length === 0) return { condition: null, affMatch: null };
    const parts = stack.map((f) => {
      const text = f.raw.includes("||") ? `(${f.raw})` : f.raw;
      return f.isElse ? `!(${text})` : text;
    });
    return { condition: parts.join(" && "), affMatch: stack.reduce((acc, f) => intersect(acc, f.affMatch), null as AffSet) };
  };

  let i = 0;
  while (i < fn.lines.length) {
    const code = stripTrailingComment(fn.lines[i]).trim();
    if (code === "" || code.startsWith("//") || /^bool\s/.test(code) || code === "break;") {
      i++;
      continue;
    }
    const forM = /^for\s*\(/.exec(code);
    if (forM) {
      let depth = 0;
      let j = i;
      do {
        for (const ch of fn.lines[j]) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        j++;
      } while (j < fn.lines.length && (depth > 0 || j === i));
      i = j;
      continue;
    }
    if (/^\}$/.test(code)) {
      stack.pop();
      i++;
      continue;
    }
    const ifM = /^if\s*\((.*)\)\s*\{$/.exec(code);
    if (ifM) {
      stack.push({
        raw: ifM[1].replace(/\s+/g, " ").trim(),
        isElse: false,
        affMatch: affMatchOf(ifM[1].replace(/\s+/g, " ").trim(), affiliations),
      });
      i++;
      continue;
    }
    const elseM = /^}\s*else\s*\{$/.exec(code);
    if (elseM) {
      const closed = stack.pop();
      if (!closed) throw new Error("S4ClearModulesList: else without if");
      stack.push({
        raw: closed.raw,
        isElse: true,
        affMatch: complement(closed.affMatch, affiliations.length),
      });
      i++;
      continue;
    }
    const listM = /^s4ModulesList\s*<<\s*(.*)$/.exec(code);
    if (listM) {
      const { condition, affMatch } = compose();
      for (const module of stringLiterals(listM[1])) {
        records.push({ module, condition, affMatch });
      }
      i++;
      continue;
    }
    i++;
  }
  return { records, sourceLine: fn.startLine };
}

// ---------------------------------------------------------------------------
// Output assembly
// ---------------------------------------------------------------------------

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

function offer(map: Map<number, Set<string>>, idx: number, name: string): void {
  let set = map.get(idx);
  if (!set) {
    set = new Set<string>();
    map.set(idx, set);
  }
  set.add(name);
}

function setAvailability(
  modules: ModuleEntry[],
  offered: Map<number, Set<string>>,
  affiliations: string[],
): void {
  for (const m of modules) {
    m.availability = affiliations
      .map((name, i) => (offered.get(i)?.has(m.name) ? name : null))
      .filter((v): v is string => v !== null);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Extraction cross-check failed: ${message}`);
}

/** Build the full output without touching the filesystem. Used by tests. */
export function buildModulesFile(): ModulesFile {
  const affiliations = readAffiliations();
  const subskills = loadSubskills();
  const total = affiliations.length;

  const modulesStage1 = parseDispatchFunction(
    readSource, STAGE_FILES[1], /Stage1::S1ChildHood\(/, "nameChild", 1, "module", subskills,
  );
  const modulesStage2 = parseDispatchFunction(
    readSource, STAGE_FILES[2], /Stage2::S2LateChildhood\(/, "nameLChild", 2, "module", subskills,
  );
  const schoolsStage3 = parseDispatchFunction(
    readSource, STAGE_FILES[3], /Stage3::S3SchoolChange\(/, "school", 3, "school", subskills,
  );
  const fieldsStage3 = parseDispatchFunction(
    readSource, STAGE_FILES[3], /Stage3::S3FieldChange\(/, "nameElem", 3, "field", subskills,
  );
  const modulesStage4 = parseDispatchFunction(
    readSource, STAGE_FILES[4], /Stage4::S4ChooseLife\(/, "nameElem", 4, "module", subskills,
  );

  const gating: GatingEntry[] = [];

  // --- Stage 1: choice switch + S1HardElem (trait-conditioned) ---
  const choice1 = parseAffSwitch(STAGE_FILES[1], /Stage1::S1ChoiceChillHood\(/, "s1ChildHoodList", "S1HardElem");
  const hard1 = captureListBranches(STAGE_FILES[1], /Stage1::S1HardElem\(/, "tmpList");
  const hardIf = hard1.find((b) => b.condition === "tmpChek == true")?.offered;
  const hardElse = hard1.find((b) => b.condition === "!(tmpChek == true)")?.offered;
  if (hardIf === undefined || hardElse === undefined) {
    throw new Error("Extraction cross-check failed: S1HardElem true/false branches not recognized");
  }

  const caseIdx1 = new Set(choice1.branches.filter((b) => b.affIndex !== -1).map((b) => b.affIndex));
  const offered1 = new Map<number, Set<string>>();
  for (const b of choice1.branches) {
    const idxs = b.affIndex === -1 ? range(total).filter((i) => !caseIdx1.has(i)) : [b.affIndex];
    if (b.offered === "hardElem") {
      for (const idx of idxs) {
        for (const n of hardIf) offer(offered1, idx, n);
        for (const n of hardElse) offer(offered1, idx, n);
      }
      gating.push({
        stage: 1,
        kind: "hardElem",
        function: "S1HardElem",
        condition: `affVar == ${b.affIndex}${b.subCondition ? ` && (${b.subCondition})` : ""}`,
        requiresAnyTrait: ["Citizenship/Inner Sphere", "Citizenship/Clan"],
        offeredIf: hardIf,
        offeredElse: hardElse,
        source: { file: STAGE_FILES[1], line: b.line },
      });
      continue;
    }
    for (const idx of idxs) for (const n of b.offered) offer(offered1, idx, n);
    gating.push({
      stage: 1,
      kind: "affGate",
      function: "S1ChoiceChillHood",
      condition: `affVar == ${b.affIndex === -1 ? "default" : b.affIndex}${b.subCondition ? ` && (${b.subCondition})` : ""}${b.isElse ? " (else)" : ""}`,
      affiliations: idxs.map((i) => affiliations[i]),
      offered: b.offered,
      source: { file: STAGE_FILES[1], line: b.line },
    });
  }
  setAvailability(modulesStage1, offered1, affiliations);

  // --- Stage 2: choice switch, subtractive filter, sibko machinery ---
  const choice2 = parseAffSwitch(STAGE_FILES[2], /Stage2::S2ChoiceLateChildHood\(/, "s2LateChildHoodList", null);
  const hard2 = parseS2HardElemAffil(STAGE_FILES[2]);
  const clear2 = parseS2ClearListElem(STAGE_FILES[2]);

  const caseIdx2 = new Set(choice2.branches.filter((b) => b.affIndex !== -1).map((b) => b.affIndex));
  const offered2 = new Map<number, Set<string>>();
  for (const b of choice2.branches) {
    const idxs = b.affIndex === -1 ? range(total).filter((i) => !caseIdx2.has(i)) : [b.affIndex];
    if (b.offered !== "hardElem") {
      for (const idx of idxs) for (const n of b.offered) offer(offered2, idx, n);
    }
    gating.push({
      stage: 2,
      kind: "affGate",
      function: "S2ChoiceLateChildHood",
      condition: `affVar == ${b.affIndex === -1 ? "default" : b.affIndex}${b.isElse ? " (else)" : ""}`,
      affiliations: idxs.map((i) => affiliations[i]),
      offered: b.offered === "hardElem" ? [] : b.offered,
      source: { file: STAGE_FILES[2], line: b.line },
    });
  }
  const clearCaseIdx = new Set([...clear2.perCase.keys()].filter((k) => k !== -1));
  for (const [affKey, names] of clear2.perCase) {
    const idxs = affKey === -1 ? range(total).filter((i) => !clearCaseIdx.has(i)) : [affKey];
    for (const idx of idxs) for (const n of names) offered2.get(idx)?.delete(n);
    gating.push({
      stage: 2,
      kind: "subtractive",
      function: "S2ClearListElem",
      condition: affKey === -1 ? "affVar default" : `affVar == ${affKey}`,
      affiliations: idxs.map((i) => affiliations[i]),
      removed: names,
      conditionedRemovals: affKey === -1 ? clear2.conditionedRemovals : undefined,
      source: { file: STAGE_FILES[2], line: 164 },
    });
  }
  setAvailability(modulesStage2, offered2, affiliations);

  gating.push({
    stage: 2,
    kind: "affGate",
    function: "S2HardElemAffil",
    condition: "switch(affVar); removals are sub-affiliation- or Citizenship-trait-conditioned (union at affiliation level)",
    removals: hard2.removals,
    conditionedRemovals: hard2.conditionedRemovals,
    source: { file: STAGE_FILES[2], line: 71 },
  });

  const freeborn = parseSibkoPicker(STAGE_FILES[2], /Stage2::S2FreebornSibko\(/);
  gating.push({
    stage: 2,
    kind: "sibkoPicker",
    name: "Freeborn Sibko",
    appliesTo: "Freeborn Sibko",
    function: "S2FreebornSibko",
    branches: freeborn.branches,
    effects: { clanXp: freeborn.clanXp },
    source: { file: STAGE_FILES[2], line: 827 },
  });
  const trueborn = parseSibkoPicker(STAGE_FILES[2], /Stage2::S2TruebornSibko\(/);
  gating.push({
    stage: 2,
    kind: "sibkoPicker",
    name: "Trueborn Sibko",
    appliesTo: "Trueborn Sibko",
    function: "S2TruebornSibko",
    branches: trueborn.branches,
    effects: { clanXp: trueborn.clanXp },
    source: { file: STAGE_FILES[2], line: 840 },
  });
  gating.push(...parseSibkoAttrBranches(STAGE_FILES[2], "S2FreebornSibkoAttr", "Freeborn Sibko", subskills));
  gating.push(...parseSibkoAttrBranches(STAGE_FILES[2], "S2TruebornSibkoAttr", "Trueborn Sibko", subskills));
  gating.push(parseClanFieldList(STAGE_FILES[2]));

  // --- Stage 3: school-list gating, school field class, field offerings ---
  const defaultSchools = parseS3DefaultSchoolList(STAGE_FILES[3]);
  const overrides = parseS3ClearAffilation(STAGE_FILES[3]);
  for (const o of overrides) {
    gating.push({
      stage: 3,
      kind: "schoolListGate",
      function: "S3ClearAffilation",
      name: o.name,
      condition: `affVar == "${o.name}"`,
      schools: o.schools,
      source: { file: STAGE_FILES[3], line: o.line },
    });
  }
  const schoolEnter = parseS3SchoolEnter(STAGE_FILES[3]);
  const setSchool = parseS3SetSchool(STAGE_FILES[3]);
  for (const school of schoolsStage3) {
    school.fieldClass = schoolEnter[school.name];
    school.schoolFlags = setSchool[school.name] ?? [];
    school.inDefaultSchoolList = defaultSchools.includes(school.name);
    school.availability = affiliations.slice();
  }
  let schoolFieldBranches = 0;
  for (const school of schoolsStage3) {
    for (const c of school.conditionals) {
      if (!c.condition.startsWith('affVar == "')) continue;
      schoolFieldBranches++;
      gating.push({
        stage: 3,
        kind: "schoolFieldBranch",
        name: school.name,
        condition: c.condition,
        effects: c.effects,
        source: { file: school.source.file, line: school.source.line },
      });
    }
  }

  // Field modules are offered by the schools' field lists (clan-conditional
  // variants keep their condition text). Fields offered by no school exist in
  // the desktop's career-field dialog (carierfields.cpp), outside §8's scope.
  const offerings = new Map<string, { school: string; tier: "basic" | "advanced" | "specialist"; condition?: string }[]>();
  const noteOffering = (name: string, school: string, tier: "basic" | "advanced" | "specialist", condition?: string): void => {
    const list = offerings.get(name) ?? [];
    list.push({ school, tier, condition });
    offerings.set(name, list);
  };
  for (const school of schoolsStage3) {
    if (!school.fields) continue;
    for (const tier of ["basic", "advanced", "specialist"] as const) {
      for (const skill of school.fields[tier]?.skills ?? []) noteOffering(skill, school.name, tier);
    }
  }
  for (const school of schoolsStage3) {
    for (const c of school.conditionals) {
      if (c.condition.startsWith('affVar == "') && c.effects.fields) {
        for (const tier of ["basic", "advanced", "specialist"] as const) {
          for (const skill of c.effects.fields[tier]?.skills ?? []) {
            noteOffering(skill, school.name, tier, c.condition);
          }
          if (c.elseEffects?.fields?.[tier]?.skills) {
            for (const skill of c.elseEffects.fields[tier].skills) {
              noteOffering(skill, school.name, tier, `!(${c.condition})`);
            }
          }
        }
      }
    }
  }
  for (const field of fieldsStage3) {
    field.offeredBy = offerings.get(field.name) ?? [];
    let unrestricted = false;
    const set = new Set<number>();
    for (const o of field.offeredBy) {
      if (!o.condition) {
        unrestricted = true;
        continue;
      }
      for (const idx of affMatchOf(o.condition, affiliations) ?? []) set.add(idx);
    }
    field.availability = unrestricted
      ? affiliations.slice()
      : [...set].sort((a, b) => a - b).map((i) => affiliations[i]);
  }

  // --- Stage 4: list gating ---
  const s4 = parseS4ClearModulesList(STAGE_FILES[4], affiliations);
  const s4Offered = new Map<string, Set<number>>();
  for (const rec of s4.records) {
    const set = s4Offered.get(rec.module) ?? new Set<number>();
    if (rec.affMatch === null) for (const i of range(total)) set.add(i);
    else for (const i of rec.affMatch) set.add(i);
    s4Offered.set(rec.module, set);
    gating.push({
      stage: 4,
      kind: "listGate",
      function: "S4ClearModulesList",
      name: rec.module,
      condition: rec.condition ?? undefined,
      affiliations:
        rec.affMatch === null ? undefined : [...rec.affMatch].sort((a, b) => a - b).map((i) => affiliations[i]),
      source: { file: STAGE_FILES[4], line: s4.sourceLine },
    });
  }
  for (const m of modulesStage4) {
    const set = s4Offered.get(m.name);
    assert(set !== undefined, `stage-4 module ${m.name} never offered by S4ClearModulesList`);
    m.availability = [...set].sort((a, b) => a - b).map((i) => affiliations[i]);
  }

  // --- §8 accounting ---
  const tableM = {
    stage1: {
      blocks: countLinesMatching(STAGE_FILES[1], readSource, "nameChild =="),
      distinct: countDistinctNames(STAGE_FILES[1], "nameChild", readSource),
    },
    stage2: {
      blocks: countLinesMatching(STAGE_FILES[2], readSource, "nameLChild =="),
      distinct: countDistinctNames(STAGE_FILES[2], "nameLChild", readSource),
    },
    stage3: {
      blocks: countLinesMatching(STAGE_FILES[3], readSource, "nameElem =="),
      distinct: countDistinctNames(STAGE_FILES[3], "nameElem", readSource),
    },
    stage4: {
      blocks: countLinesMatching(STAGE_FILES[4], readSource, "nameElem =="),
      distinct: countDistinctNames(STAGE_FILES[4], "nameElem", readSource),
    },
  };
  const tableG = {
    stage2_nameAttr: countLinesMatching(STAGE_FILES[2], readSource, "nameAttr =="),
    stage2_nameClan: countLinesMatching(STAGE_FILES[2], readSource, "nameClan =="),
    stage3_school: countLinesMatching(STAGE_FILES[3], readSource, 'school == "'),
    stage3_affVar: countLinesMatching(STAGE_FILES[3], readSource, 'affVar == "'),
  };

  const sibkoAttrEntries = gating.filter((g) => g.kind === "sibkoBranch");
  const clanBranchNames = trueborn.branches.flatMap((b) =>
    b.condition ? stringLiterals(b.condition) : [],
  );
  assert(
    sibkoAttrEntries.length === tableG.stage2_nameAttr,
    "sibkoBranch entries must cover every nameAttr dispatch line",
  );
  assert(
    tableG.stage2_nameClan === 2 &&
      ["Ghost Bear", "Hell's Horses", "Blood Spirit"].every((n) => clanBranchNames.includes(n)),
    "nameClan lines must resolve to Ghost Bear, Hell's Horses and Blood Spirit",
  );
  assert(schoolsStage3.length === tableG.stage3_school, "school == blocks vs schools");
  assert(
    schoolFieldBranches + overrides.length === tableG.stage3_affVar,
    "affVar == lines vs emitted branches",
  );
  assert(modulesStage1.length === tableM.stage1.blocks, "stage1 blocks vs modules");
  assert(modulesStage2.length === tableM.stage2.blocks, "stage2 blocks vs modules");
  assert(modulesStage4.length === tableM.stage4.blocks, "stage4 blocks vs modules");
  assert(
    fieldsStage3.length + schoolsStage3.length === tableM.stage3.distinct,
    "stage3 distinct names vs field+school entries",
  );

  const modules = [
    ...modulesStage1,
    ...modulesStage2,
    ...schoolsStage3,
    ...fieldsStage3,
    ...modulesStage4,
  ];

  const fileLines: Record<string, number> = {};
  for (const file of Object.values(STAGE_FILES)) {
    fileLines[file] = toLines(readSource(file)).length;
  }

  return {
    meta: {
      generatedBy: "scripts/extract-rules.ts (build step #11, PLAN.md)",
      source: { repo: "Battletech-Character-Creator", rev: readSourceRev(), files: fileLines },
      affiliations,
      tableM,
      tableG,
      notes: [
        "tableM.blocks follows RULES.md §8 grep semantics (raw line matches, comments included); stage 3's 78 includes one commented-out nameElem line in S3SchoolEnter.",
        "tableM.distinct counts distinct `param == \"X\"` names (§8: occurrences are not distinct names); stage 3 has 66 distinct (schools + fields).",
        "Stage-3 schools are selectable Table-M entries; their data lives in the ten `school ==` Table-G blocks of S3SchoolChange, so school entries are sourced from there.",
        "Officer Candidate School is a tenth school absent from the constructor's S3SChoolList (RULES.md §8); it reaches characters through the field dialog instead.",
        "S3ClearAffilation restricts the school list for the Franklin Fiefs and JarnFolk SUB-affiliations by name; affiliation-level availability cannot express that, so the gating entries carry it.",
        "Stage-3 field availability is derived from the schools' field lists; the desktop additionally offers fields through the career field dialog (S3FieldDialog/masterFieldList), which is outside §8's 154 blocks.",
        "Stage-1 'Fugitives' exists as a block but is only reachable through gating; 'Born Mercenary Brat' is offered only for affVar 12 (Independent) with subAffVar 4 (RULES.md §6.1).",
        "Stage-1/2 preambles do not reset xpCost (the wizard refunds first); stage-3/4 preambles reset to 0 — extraction captures per-block values either way (RULES.md §8).",
        "Availability is the affiliation-level union over reachable gate branches; sub-affiliation, caste, trait, school and phenotype conditions stay verbatim on the gating entries that declare them.",
        "text_resurce.cpp is out of scope: it holds the Stage-0 affiliation effects consumed by build step #12 and contains none of §8's counted blocks.",
      ],
    },
    modules,
    gating,
  };
}

function main(): void {
  const file = buildModulesFile();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(file, null, 2) + "\n", "utf8");
  const byStage = (stage: number): number => file.modules.filter((m) => m.stage === stage).length;
  console.log(`Ingesting lifepath modules from ${SOURCE_ROOT}`);
  console.log(
    `  modules: ${file.modules.length} (${byStage(1)}/${byStage(2)}/${byStage(3)}/${byStage(4)} by stage)` +
      `, gating entries: ${file.gating.length}`,
  );
  console.log(`  wrote modules.json`);
}

const isCli =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) main();
