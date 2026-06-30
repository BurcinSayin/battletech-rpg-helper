import type { Database } from "@/lib/supabase/database.types";
import type { BtccRow, BtccScalars } from "@/lib/btcc/types";

/** A full `characters` table row (generated Supabase types). */
export type CharacterRow = Database["public"]["Tables"]["characters"]["Row"];

/** Columns written by both create (insert) and update (the RPC payload). */
export interface CharacterColumns {
  name: string;
  info: CharacterInfo;
  attributes: Record<string, number>;
  skills: BtccRow[];
  traits: BtccRow[];
  pre_snapshot: PreSnapshot;
  notes: string;
}

/**
 * The `info` JSONB column. Per the migration contract
 * (supabase/migrations/20260629150000_init.sql:47-50) it holds the scalars plus
 * the equip/weapon sections so a `.btcc` round-trip stays lossless even though the
 * MVP editor only edits the scalars.
 */
export interface CharacterInfo {
  scalars: BtccScalars;
  equip: string[];
  equipLoc: Record<string, string>;
  weapons: string[];
  chrWeapons: string[];
}

/** The `pre_snapshot` JSONB column — the desktop wizard's pre-stage baseline. */
export interface PreSnapshot {
  preAttrs: Record<string, number>;
  preSkills: BtccRow[];
  preTraits: BtccRow[];
}
