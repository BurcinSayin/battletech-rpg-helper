// Lossless mapping between a `characters` DB row and a `BtccDraft`. The column
// layout is defined by the migration (20260629150000_init.sql:47-50):
//   info = scalars + equip/equipLoc/weapons/chrWeapons, attributes = attrs,
//   skills/traits = BtccRow[], pre_snapshot = pre* sections, name/notes = columns.
//
// Reads (rowToDraft) are tolerant of malformed JSONB; writes (draftToColumns)
// always produce well-formed shapes. We control every write through these helpers
// plus the `update_character` RPC, so a parse → DB → serialize round-trip is exact.

import type { Database, Json } from "@/lib/supabase/database.types";
import type { BtccDraft, BtccRow, BtccScalars } from "@/lib/btcc/types";
import { NUMERIC_SCALAR_KEYS, SCALAR_KEYS, emptyDraft } from "@/lib/btcc/types";
import type {
  CharacterColumns,
  CharacterInfo,
  CharacterRow,
  PreSnapshot,
} from "./types";

type JsonObject = { [key: string]: Json | undefined };

function asObject(value: Json | undefined): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function asRows(value: Json | undefined): BtccRow[] {
  if (!Array.isArray(value)) return [];
  const rows: BtccRow[] = [];
  for (const entry of value) {
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      const name = entry.name;
      const xp = entry.xp;
      if (typeof name === "string") {
        rows.push({ name, xp: typeof xp === "number" ? xp : 0 });
      }
    }
  }
  return rows;
}

function asNumberRecord(value: Json | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(asObject(value))) {
    if (typeof val === "number") out[key] = val;
  }
  return out;
}

function asStringRecord(value: Json | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(asObject(value))) {
    if (typeof val === "string") out[key] = val;
  }
  return out;
}

function asStringArray(value: Json | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Coerce stored `info.scalars` JSON into a complete BtccScalars (name from the column). */
function coerceScalars(infoScalars: Json | undefined, name: string): BtccScalars {
  const scalars = emptyDraft().scalars;
  const src = asObject(infoScalars);
  const out = scalars as unknown as Record<string, string | number>;
  for (const key of SCALAR_KEYS) {
    const val = src[key];
    if (NUMERIC_SCALAR_KEYS.has(key)) {
      if (typeof val === "number") out[key] = val;
    } else if (typeof val === "string") {
      out[key] = val;
    }
  }
  scalars.name = name;
  return scalars;
}

/** Build a BtccDraft from a DB row (tolerant of partial/legacy JSONB). */
export function rowToDraft(row: CharacterRow): BtccDraft {
  const draft = emptyDraft();
  const info = asObject(row.info);
  const pre = asObject(row.pre_snapshot);

  draft.scalars = coerceScalars(info.scalars, row.name);
  draft.attrs = asNumberRecord(row.attributes);
  draft.skills = asRows(row.skills);
  draft.traits = asRows(row.traits);
  draft.equip = asStringArray(info.equip);
  draft.equipLoc = asStringRecord(info.equipLoc);
  draft.weapons = asStringArray(info.weapons);
  draft.chrWeapons = asStringArray(info.chrWeapons);
  draft.preAttrs = asNumberRecord(pre.preAttrs);
  draft.preSkills = asRows(pre.preSkills);
  draft.preTraits = asRows(pre.preTraits);
  draft.notes = row.notes;

  return draft;
}

function draftToInfo(draft: BtccDraft): CharacterInfo {
  return {
    scalars: draft.scalars,
    equip: draft.equip,
    equipLoc: draft.equipLoc,
    weapons: draft.weapons,
    chrWeapons: draft.chrWeapons,
  };
}

function draftToPreSnapshot(draft: BtccDraft): PreSnapshot {
  return {
    preAttrs: draft.preAttrs,
    preSkills: draft.preSkills,
    preTraits: draft.preTraits,
  };
}

/** The writable columns derived from a draft (shared by insert and the RPC payload). */
export function draftToColumns(draft: BtccDraft): CharacterColumns {
  return {
    name: draft.scalars.name,
    info: draftToInfo(draft),
    attributes: draft.attrs,
    skills: draft.skills,
    traits: draft.traits,
    pre_snapshot: draftToPreSnapshot(draft),
    notes: draft.notes,
  };
}

/**
 * The whitelisted `update_character` `p_payload`. `campaign_id` is intentionally
 * omitted so the RPC's present-vs-absent check leaves it untouched; `owner_id` and
 * `version` are never client-writable.
 */
export function draftToPayload(draft: BtccDraft): Json {
  return draftToColumns(draft) as unknown as Json;
}

type CharacterInsert = Database["public"]["Tables"]["characters"]["Insert"];

/** Insert shape for creating a new character owned by `ownerId`. */
export function draftToInsert(draft: BtccDraft, ownerId: string): CharacterInsert {
  const cols = draftToColumns(draft);
  return {
    owner_id: ownerId,
    name: cols.name,
    info: cols.info as unknown as Json,
    attributes: cols.attributes as unknown as Json,
    skills: cols.skills as unknown as Json,
    traits: cols.traits as unknown as Json,
    pre_snapshot: cols.pre_snapshot as unknown as Json,
    notes: cols.notes,
  };
}
