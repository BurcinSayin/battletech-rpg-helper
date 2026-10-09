/**
 * Ingest the canonical A Time of War traits catalog from
 * `docs/rule_book/traits.json` into `data/rules/traits.json` and
 * `data/rules/subtraits.json`.
 *
 * All trait data (canonical properties and sub-traits) is parsed directly
 * from `docs/rule_book/traits.json`.
 *
 * Run with:  npm run traits:ingest
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const RULEBOOK_TRAITS_FILE = join(repoRoot, "docs", "rule_book", "traits.json");
const OUT_DIR = join(repoRoot, "data", "rules");

export interface RulebookTraitInput {
  name: string;
  category: string;
  trait_type: string;
  tp_score: string;
  description: string;
  source_page: number;
  sub_traits?: string[];
}

export interface CanonicalTrait {
  name: string;
  category: string;
  trait_type: string;
  tp_score: string;
  tp_levels: number[];
  description: string;
  page: string;
  sub_traits: string[];
}

/** Parse only the supported canonical TP score forms, never inferred costs. */
export function parseTraitPointLevels(score: string): number[] {
  const normalized = score.replace(/[–−]/g, "-").trim();
  const range = /^([+-]?\d+)\s+to\s+([+-]?\d+)\s+TP$/.exec(normalized);
  if (range) {
    const low = Math.min(Number(range[1]), Number(range[2]));
    const high = Math.max(Number(range[1]), Number(range[2]));
    return Array.from({ length: high - low + 1 }, (_, i) => low + i);
  }
  if (/^[+-]?\d+(?:\s+or\s+[+-]?\d+)*\s+TP$/.test(normalized)) {
    const levels = normalized.replace(/\s+TP$/, "").split(/\s+or\s+/).map(Number);
    return [...new Set(levels)].sort((a, b) => a - b);
  }
  throw new Error(`Unsupported trait TP score: ${score}`);
}

function writeJson(name: string, data: unknown): void {
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`  wrote ${name}`);
}

export function parseRulebookTraits(): {
  traits: CanonicalTrait[];
  subtraits: Record<string, string[]>;
} {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Parsing rulebook traits from ${RULEBOOK_TRAITS_FILE}`);

  const rawText = readFileSync(RULEBOOK_TRAITS_FILE, "utf8");
  const rawList: RulebookTraitInput[] = JSON.parse(rawText);

  // Deduplicate by name and map to canonical format with `page` and `sub_traits`
  const seenNames = new Set<string>();
  const canonicalTraits: CanonicalTrait[] = [];
  const subtraits: Record<string, string[]> = {};

  for (const item of rawList) {
    const name = item.name.trim();
    if (seenNames.has(name)) {
      console.warn(`Duplicate trait found in source: ${name} (skipping duplicate)`);
      continue;
    }
    seenNames.add(name);

    const subTraits = Array.isArray(item.sub_traits) ? item.sub_traits.map((s) => s.trim()) : [];

    canonicalTraits.push({
      name,
      category: item.category.trim(),
      trait_type: item.trait_type.trim(),
      tp_score: item.tp_score.trim(),
      tp_levels: parseTraitPointLevels(item.tp_score),
      description: item.description.trim(),
      page: `p.${item.source_page}`,
      sub_traits: subTraits,
    });

    if (subTraits.length > 0) {
      // Use parent trait name for slash titles (e.g. "Citizenship/Trueborn" -> "Citizenship")
      const parentKey = name.includes("/") ? name.split("/")[0] : name;
      subtraits[parentKey] = [...subTraits];
    }
  }

  // Sort alphabetically by trait name
  canonicalTraits.sort((a, b) => a.name.localeCompare(b.name));

  writeJson("traits.json", canonicalTraits);
  writeJson("subtraits.json", subtraits);
  console.log(
    `Successfully ingested ${canonicalTraits.length} canonical traits and ${Object.keys(subtraits).length} sub-trait mappings.`,
  );

  return { traits: canonicalTraits, subtraits };
}

// When executed directly via tsx/node
if (process.argv[1] && process.argv[1].endsWith("parse-rulebook-traits.ts")) {
  parseRulebookTraits();
}
