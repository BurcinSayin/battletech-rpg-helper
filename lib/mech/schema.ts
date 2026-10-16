import { z } from "zod";
import {
  ARMOR_LOCATIONS,
  EMPTY_SLOT,
  STANDARD_SLOT_LOCATIONS,
  type MechData,
} from "./types";

export type { MechData } from "./types";

// Bounds for the editable record. These limit shape and size only: BattleTech
// construction legality is deliberately not checked (the Mech tab is record
// keeping). Parsed MTF text is clipped to the string caps and rejected when a
// collection cap or the serialized size cap would be exceeded.
export const MECH_LIMITS = {
  chassis: 96,
  model: 96,
  mulId: 16,
  config: 32,
  techBase: 32,
  era: 16,
  source: 160,
  rulesLevel: 16,
  engine: 96,
  structure: 64,
  myomer: 64,
  heatSinks: 64,
  armorType: 96,
  mass: 200,
  movement: 99,
  armorValue: 999,
  armorEntries: 16,
  armorLocation: 8,
  weapons: 64,
  weaponName: 64,
  weaponLocation: 32,
  weaponDetail: 32,
  slotSections: 16,
  slotSectionName: 24,
  slotsPerSection: 16,
  slotEntry: 48,
  unsupportedLines: 64,
  unsupportedLine: 200,
  catalogFile: 128,
  /** Upper bound on JSON.stringify(mech).length. */
  serializedBytes: 32 * 1024,
} as const;

const text = (max: number) => z.string().max(max);
const whole = (max: number) => z.number().int().min(0).max(max);

const armorSchema = z.object({
  location: z.string().min(1).max(MECH_LIMITS.armorLocation),
  value: whole(MECH_LIMITS.armorValue),
});

const weaponSchema = z.object({
  name: text(MECH_LIMITS.weaponName),
  location: text(MECH_LIMITS.weaponLocation),
  detail: text(MECH_LIMITS.weaponDetail).optional(),
});

const slotSectionSchema = z.object({
  location: z.string().min(1).max(MECH_LIMITS.slotSectionName),
  slots: text(MECH_LIMITS.slotEntry).array().max(MECH_LIMITS.slotsPerSection),
});

const shape = z.object({
  chassis: text(MECH_LIMITS.chassis),
  model: text(MECH_LIMITS.model),
  mulId: text(MECH_LIMITS.mulId).optional(),
  config: text(MECH_LIMITS.config),
  techBase: text(MECH_LIMITS.techBase),
  era: text(MECH_LIMITS.era),
  source: text(MECH_LIMITS.source),
  rulesLevel: text(MECH_LIMITS.rulesLevel),

  mass: whole(MECH_LIMITS.mass),
  engine: text(MECH_LIMITS.engine),
  structure: text(MECH_LIMITS.structure),
  myomer: text(MECH_LIMITS.myomer),
  heatSinks: text(MECH_LIMITS.heatSinks),
  walkMP: whole(MECH_LIMITS.movement),
  jumpMP: whole(MECH_LIMITS.movement),

  armorType: text(MECH_LIMITS.armorType),
  armor: armorSchema.array().max(MECH_LIMITS.armorEntries),
  weapons: weaponSchema.array().max(MECH_LIMITS.weapons),
  criticalSlots: slotSectionSchema.array().max(MECH_LIMITS.slotSections),
  unsupported: text(MECH_LIMITS.unsupportedLine)
    .array()
    .max(MECH_LIMITS.unsupportedLines),
  catalogFile: text(MECH_LIMITS.catalogFile).nullable(),
});

/**
 * Shape + bounds for a stored or submitted mech. Strips unknown keys. The
 * whole-record size check guards the row against combined maxima exceeding the
 * budget even when each field is individually within bounds.
 */
export const mechSchema = shape.superRefine((mech, ctx) => {
  if (JSON.stringify(mech).length > MECH_LIMITS.serializedBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Mech data is too large.",
    });
  }
});

/**
 * A blank record for manual entry: the standard armor locations at 0 and the
 * standard biped critical-slot sections fully empty, so the editor has rows to
 * fill in. No weapons, no unsupported lines, no catalog provenance.
 */
export function emptyMech(): MechData {
  return {
    chassis: "",
    model: "",
    config: "",
    techBase: "",
    era: "",
    source: "",
    rulesLevel: "",
    mass: 0,
    engine: "",
    structure: "",
    myomer: "",
    heatSinks: "",
    walkMP: 0,
    jumpMP: 0,
    armorType: "",
    armor: ARMOR_LOCATIONS.map((location) => ({ location, value: 0 })),
    weapons: [],
    criticalSlots: STANDARD_SLOT_LOCATIONS.map((location) => ({
      location,
      slots: Array.from({ length: 12 }, () => EMPTY_SLOT),
    })),
    unsupported: [],
    catalogFile: null,
  };
}
