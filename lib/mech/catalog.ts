// Predefined-mech catalog (docs/rule_book/mechs.json, ~800KB). This module must
// only be imported from server code (mech-actions.ts). It is not `server-only`
// guarded because that package is not a dependency; keep it out of client
// component import graphs. The JSON is bundled statically, so there is no fetch.
import mechsJson from "../../docs/rule_book/mechs.json";

export interface CatalogEntry {
  /** Exact MTF file name; the only key used to build a download URL. */
  fileName: string;
  definitionName: string;
  era: string;
  mass: string;
  /** Raw catalog tech-base code (e.g. "is", "c"); not translated. */
  techBase: string;
}

interface RawCatalogEntry {
  file_name?: unknown;
  definition_name?: unknown;
  era?: unknown;
  mass?: unknown;
  tech_base?: unknown;
  series_name?: unknown;
}

interface IndexedEntry extends CatalogEntry {
  /** Lowercased definition + series name used for matching. */
  haystack: string;
  searchName: string;
}

export const CATALOG_QUERY_MAX_LENGTH = 80;
const MAX_TOKENS = 8;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Keeps only entries whose `file_name` is a `.mtf` file (the catalog also holds
 * placeholder "No Frakenmech Data.nope" rows) and keeps the first entry per
 * file name. Every field must be a string; malformed rows are skipped.
 */
function buildIndex(raw: unknown): {
  entries: IndexedEntry[];
  byFileName: Map<string, IndexedEntry>;
} {
  const entries: IndexedEntry[] = [];
  const byFileName = new Map<string, IndexedEntry>();
  if (!Array.isArray(raw)) return { entries, byFileName };

  for (const item of raw as RawCatalogEntry[]) {
    if (
      typeof item?.file_name !== "string" ||
      typeof item.definition_name !== "string" ||
      typeof item.era !== "string" ||
      typeof item.mass !== "string" ||
      typeof item.tech_base !== "string" ||
      typeof item.series_name !== "string"
    ) {
      continue;
    }
    if (!item.file_name.endsWith(".mtf")) continue;
    if (byFileName.has(item.file_name)) continue;

    const entry: IndexedEntry = {
      fileName: item.file_name,
      definitionName: item.definition_name,
      era: item.era,
      mass: item.mass,
      techBase: item.tech_base,
      searchName: normalize(item.definition_name),
      haystack: normalize(`${item.definition_name} ${item.series_name}`),
    };
    entries.push(entry);
    byFileName.set(entry.fileName, entry);
  }
  return { entries, byFileName };
}

const INDEX = buildIndex(mechsJson);

function toPublic(entry: IndexedEntry): CatalogEntry {
  return {
    fileName: entry.fileName,
    definitionName: entry.definitionName,
    era: entry.era,
    mass: entry.mass,
    techBase: entry.techBase,
  };
}

/**
 * Case-insensitive search. Every whitespace-separated token must appear in the
 * definition or series name. Ranking, best first:
 *   0 — definition name starts with the whole query
 *   1 — definition name starts with the first token
 *   2 — some word in the definition name starts with the first token
 *   3 — other matches (series name or inner text)
 * Ties break on definition name, then file name. Empty queries return nothing.
 */
export function searchCatalog(
  query: string,
  limit: number = DEFAULT_LIMIT,
): CatalogEntry[] {
  if (typeof query !== "string") return [];
  const clipped = normalize(query.slice(0, CATALOG_QUERY_MAX_LENGTH));
  const tokens = clipped.split(" ").filter(Boolean).slice(0, MAX_TOKENS);
  if (tokens.length === 0) return [];

  const cap = Number.isFinite(limit)
    ? Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const [first] = tokens;
  const whole = tokens.join(" ");

  const ranked: { rank: number; entry: IndexedEntry }[] = [];
  for (const entry of INDEX.entries) {
    if (!tokens.every((token) => entry.haystack.includes(token))) continue;
    let rank = 3;
    if (entry.searchName.startsWith(whole)) rank = 0;
    else if (first !== undefined && entry.searchName.startsWith(first)) {
      rank = 1;
    } else if (
      first !== undefined &&
      entry.searchName.split(" ").some((word) => word.startsWith(first))
    ) {
      rank = 2;
    }
    ranked.push({ rank, entry });
  }

  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.entry.definitionName.localeCompare(b.entry.definitionName) ||
      a.entry.fileName.localeCompare(b.entry.fileName),
  );
  return ranked.slice(0, cap).map(({ entry }) => toPublic(entry));
}

/** Exact lookup by catalog `file_name`. Anything not in the catalog is undefined. */
export function findCatalogEntry(fileName: string): CatalogEntry | undefined {
  if (typeof fileName !== "string") return undefined;
  const entry = INDEX.byFileName.get(fileName);
  return entry ? toPublic(entry) : undefined;
}
