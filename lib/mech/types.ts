// Editable mech record stored on a character. Plain types only (no Zod) so the
// shape is readable from client and server code alike; `schema.ts` owns the
// bounds that every save and every MTF import must satisfy.

export interface MechArmorValue {
  /** Armor location code as written in the MTF (e.g. "LA", "RTL", "FLL"). */
  location: string;
  value: number;
}

export interface MechWeapon {
  /** Weapon name verbatim from the MTF (may carry a quantity prefix, e.g. "1 ISMediumLaser"). */
  name: string;
  /** Mounting location as written (e.g. "Left Arm"). */
  location: string;
  /** Anything after the location (e.g. "Ammo:20"), kept verbatim. */
  detail?: string;
}

export interface MechSlotSection {
  /** Section name as written in the MTF (e.g. "Left Arm", "Front Left Leg"). */
  location: string;
  /** Ordered slot contents; repeats and "-Empty-" entries are preserved. */
  slots: string[];
}

export interface MechData {
  chassis: string;
  model: string;
  mulId?: string;
  config: string;
  techBase: string;
  era: string;
  source: string;
  rulesLevel: string;

  mass: number;
  engine: string;
  structure: string;
  myomer: string;
  heatSinks: string;
  walkMP: number;
  jumpMP: number;

  armorType: string;
  /** Armor values in file order. */
  armor: MechArmorValue[];
  /** Weapons in file order; repeats are meaningful. */
  weapons: MechWeapon[];
  /** Critical-slot sections in file order. */
  criticalSlots: MechSlotSection[];
  /** MTF lines this editor does not model, retained verbatim. */
  unsupported: string[];
  /** Catalog `file_name` the record was loaded from, or null for manual entry. */
  catalogFile: string | null;
}

/** Armor locations of the standard biped sample, in file order. */
export const ARMOR_LOCATIONS = [
  "LA",
  "RA",
  "LT",
  "RT",
  "CT",
  "HD",
  "LL",
  "RL",
  "RTL",
  "RTR",
  "RTC",
] as const;

/** Standard biped critical-slot sections, in sample-file order. */
export const STANDARD_SLOT_LOCATIONS = [
  "Left Arm",
  "Right Arm",
  "Left Torso",
  "Right Torso",
  "Center Torso",
  "Head",
  "Left Leg",
  "Right Leg",
] as const;

/** Every critical-slot section name the MTF parser recognizes (quad/tripod extras included). */
export const KNOWN_SLOT_LOCATIONS = [
  ...STANDARD_SLOT_LOCATIONS,
  "Front Left Leg",
  "Front Right Leg",
  "Rear Left Leg",
  "Rear Right Leg",
  "Center Leg",
] as const;

export const EMPTY_SLOT = "-Empty-";
