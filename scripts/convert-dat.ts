/**
 * One-time-ish rules ingestion: convert the desktop app's `resource/*.dat`
 * tables into typed JSON committed under `data/rules/`.
 *
 * Run with:  npm run rules:ingest
 *
 * Source: the read-only desktop repo. Override its location with the
 * BTCC_SOURCE_DIR env var; otherwise we default to the sibling checkout's
 * `resource/` directory.
 *
 * The catalog `.dat` files are pure ASCII and `;`-delimited. Skill/trait
 * description files (skillsdesc.dat / traitsdesc.dat) are Windows-1251 and are
 * intentionally DEFERRED — they need `iconv-lite` and are only used in lazy
 * detail panels (PLAN.md step #4, later).
 *
 * Ground truth for parsing: loadresurce.cpp and stage1_resurce.cpp
 * (CreateSubSkillList builds composite "parent/sub" names).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const SOURCE_DIR =
  process.env.BTCC_SOURCE_DIR ??
  resolve(repoRoot, "..", "Battletech-Character-Creator", "resource");

const OUT_DIR = join(repoRoot, "data", "rules");

/** Read a `.dat` file and return its non-empty lines (trimmed of CR). */
function readLines(file: string): string[] {
  const text = readFileSync(join(SOURCE_DIR, file), "latin1");
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length > 0);
}

/** Plain one-value-per-line list. */
function parseList(file: string): string[] {
  return readLines(file);
}

interface Skill {
  name: string;
  /** Linked attribute(s), e.g. "RFL" or "RFL+DEX". */
  attributes: string;
  /** Target number / complexity cost. */
  cost: number;
  /** Category code, e.g. "SB", "CB", "SA", "CA". */
  category: string;
}

/** allskills.dat: `name;ATTRS,cost/category` (note: one row has a stray space). */
function parseSkills(): Skill[] {
  return readLines("allskills.dat").map((line) => {
    const [name, meta] = line.split(";");
    const [attrs, costCat] = meta.split(",");
    const [cost, category] = costCat.split("/");
    return {
      name: name.trim(),
      attributes: attrs.trim(),
      cost: parseInt(cost.trim(), 10),
      category: category.trim(),
    };
  });
}

interface Trait {
  name: string;
  /** Rulebook page reference, e.g. "p.108". Kept verbatim. */
  page: string;
}

/** alltraits.dat: `name;pageref`. */
function parseTraits(): Trait[] {
  return readLines("alltraits.dat").map((line) => {
    const [name, page] = line.split(";");
    return { name: name.trim(), page: page.trim() };
  });
}

/** subskill.dat: `parent;sub` → { parent: subs[] }, preserving file order. */
function parseSubskills(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const line of readLines("subskill.dat")) {
    const [parent, sub] = line.split(";");
    const p = parent.trim();
    (map[p] ??= []).push(sub.trim());
  }
  return map;
}

function writeJson(name: string, data: unknown): void {
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`  wrote ${name}`);
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Ingesting rules from ${SOURCE_DIR}`);

  writeJson("skills.json", parseSkills());
  writeJson("traits.json", parseTraits());
  writeJson("subskills.json", parseSubskills());
  writeJson("affiliations.json", parseList("affilations.dat"));
  writeJson("careers.json", parseList("career.dat"));
  writeJson("eyeColors.json", parseList("eyecolor.dat"));
  writeJson("hairColors.json", parseList("haircolor.dat"));
  writeJson("phenotypes.json", parseList("phenotype.dat"));
  writeJson("planets.json", parseList("planets.dat"));

  console.log("Done. (Descriptions deferred — see header.)");
}

main();
