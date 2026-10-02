/**
 * Ingest the canonical A Time of War skills catalog from
 * `docs/rule_book/skills_table.json` and `docs/rule_book/skills.json` into
 * `data/rules/skills.json` and reconciled `data/rules/subskills.json`.
 *
 * All skill data (attributes, target numbers, complexities, tiers, descriptions,
 * and subskills) is parsed directly from the digitized rulebook files.
 *
 * Run with:  npm run skills:ingest
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const RULEBOOK_TABLE_FILE = join(repoRoot, "docs", "rule_book", "skills_table.json");
const RULEBOOK_SKILLS_FILE = join(repoRoot, "docs", "rule_book", "skills.json");
const OUT_DIR = join(repoRoot, "data", "rules");

export interface RulebookTableRow {
  skill_name: string;
  links: string;
  tn_c: string;
  target_number: number;
  complexity: string;
  tiered_skill: boolean;
}

export interface RulebookTableInput {
  table_name: string;
  source_page: number;
  rows: RulebookTableRow[];
}

export interface RulebookSkillInput {
  name: string;
  sub_skills?: string[];
  subskills?: string[] | string;
  description: string;
  alias_list?: string[];
  default_sub?: string;
  subskill_aliases?: Record<string, string[]>;
}

export interface TierMetadata {
  attributes: string;
  targetNumber: number;
  category: string;
}

export interface CanonicalSkill {
  name: string;
  attributes: string;
  targetNumber: number;
  category: string;
  page: string;
  description: string;
  subskills: string[];
  tiered: boolean;
  advanced?: TierMetadata;
  alias_list?: string[];
  default_sub?: string;
  subskill_aliases?: Record<string, string[]>;
}

function writeJson(name: string, data: unknown): void {
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`  wrote ${name}`);
}

function normalizeAttributes(links: string): string {
  return links.replace(/\s*\+\s*/g, "+").trim();
}

export function parseRulebookSkills(): {
  skills: CanonicalSkill[];
  subskills: Record<string, string[]>;
} {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Parsing rulebook skills from ${RULEBOOK_TABLE_FILE} and ${RULEBOOK_SKILLS_FILE}`);

  const tableData: RulebookTableInput = JSON.parse(readFileSync(RULEBOOK_TABLE_FILE, "utf8"));
  const skillsData: RulebookSkillInput[] = JSON.parse(readFileSync(RULEBOOK_SKILLS_FILE, "utf8"));

  // Index description, sub_skills, alias_list and default_sub directly from docs/rule_book/skills.json
  const skillInputByName = new Map<string, RulebookSkillInput>();
  const descriptionByName = new Map<string, string>();
  const subskillsByName = new Map<string, string[]>();
  const subskills: Record<string, string[]> = {};

  for (const s of skillsData) {
    const name = s.name.trim();
    skillInputByName.set(name, s);
    descriptionByName.set(name, s.description.trim());
    const rawSubs = Array.isArray(s.sub_skills)
      ? s.sub_skills
      : Array.isArray(s.subskills)
        ? s.subskills
        : [];
    const subs = rawSubs.map((x) => x.trim());
    subskillsByName.set(name, subs);

    if (subs.length > 0) {
      subskills[name] = [...subs];

      // Backward-compatibility aliases for legacy desktop/fixture keys from alias_list
      if (s.alias_list && Array.isArray(s.alias_list)) {
        for (const alias of s.alias_list) {
          subskills[alias.trim()] = [...subs];
        }
      }
    }
  }

  // Group table rows by base skill name
  interface RowGroup {
    baseName: string;
    basic?: RulebookTableRow;
    advanced?: RulebookTableRow;
    standard?: RulebookTableRow;
  }

  const groups = new Map<string, RowGroup>();

  for (const row of tableData.rows) {
    const rawName = row.skill_name.trim();
    if (rawName.endsWith("[Basic Tier]")) {
      const baseName = rawName.replace(/\s*\[Basic Tier\]$/, "").trim();
      const g = groups.get(baseName) ?? { baseName };
      g.basic = row;
      groups.set(baseName, g);
    } else if (rawName.endsWith("[Advanced Tier]")) {
      const baseName = rawName.replace(/\s*\[Advanced Tier\]$/, "").trim();
      const g = groups.get(baseName) ?? { baseName };
      g.advanced = row;
      groups.set(baseName, g);
    } else {
      const g = groups.get(rawName) ?? { baseName: rawName };
      g.standard = row;
      groups.set(rawName, g);
    }
  }

  const canonicalSkills: CanonicalSkill[] = [];
  const sourcePage = `p.${tableData.source_page ?? 142}`;

  for (const [baseName, group] of groups.entries()) {
    const isTiered = Boolean(group.basic && group.advanced);
    const primaryRow = group.basic ?? group.standard;

    if (!primaryRow) {
      console.warn(`No primary row found for skill: ${baseName}`);
      continue;
    }

    const description = descriptionByName.get(baseName) ?? "";
    const subs =
      subskills[baseName] ??
      (baseName === "Interest" ? subskills["Interests"] : undefined) ??
      (baseName === "MedTech" ? subskills["Medtech"] : undefined) ??
      [];

    const skillObj: CanonicalSkill = {
      name: baseName,
      attributes: normalizeAttributes(primaryRow.links),
      targetNumber: primaryRow.target_number,
      category: primaryRow.complexity,
      page: sourcePage,
      description,
      subskills: [...subs],
      tiered: isTiered,
    };

    const skillInput = skillInputByName.get(baseName);
    if (skillInput?.alias_list && skillInput.alias_list.length > 0) {
      skillObj.alias_list = skillInput.alias_list.map((a) => a.trim());
    }
    if (skillInput?.default_sub) {
      skillObj.default_sub = skillInput.default_sub.trim();
    }
    if (skillInput?.subskill_aliases) {
      skillObj.subskill_aliases = skillInput.subskill_aliases;
    }

    if (isTiered && group.advanced) {
      skillObj.advanced = {
        attributes: normalizeAttributes(group.advanced.links),
        targetNumber: group.advanced.target_number,
        category: group.advanced.complexity,
      };
    }

    // Rule discrepancy correction: Disguise is Simple-Basic (7 / SB)
    if (baseName === "Disguise") {
      skillObj.targetNumber = 7;
      skillObj.category = "SB";
    }

    canonicalSkills.push(skillObj);
  }

  // Sort alphabetically by skill name
  canonicalSkills.sort((a, b) => a.name.localeCompare(b.name));

  writeJson("skills.json", canonicalSkills);
  writeJson("subskills.json", subskills);

  console.log(
    `Successfully ingested ${canonicalSkills.length} canonical skills and ${Object.keys(subskills).length} subskill mappings.`,
  );

  return { skills: canonicalSkills, subskills };
}

// When executed directly via tsx/node
if (process.argv[1] && process.argv[1].endsWith("parse-rulebook-skills.ts")) {
  parseRulebookSkills();
}
