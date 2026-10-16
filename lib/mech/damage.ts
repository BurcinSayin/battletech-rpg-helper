import { z } from "zod";
import { MECH_LIMITS } from "./schema";
import type { MechData } from "./types";

/** Armor points lost at mech.armor[index]. Zero damage is omitted. */
export interface ArmorDamage {
  index: number;
  lost: number;
}
/** Manual structure maximum for mech.criticalSlots[index]. */
export interface StructureTrack {
  index: number;
  max: number;
  lost: number;
}
export interface CriticalHit {
  section: number;
  slot: number;
}
export interface MechDamage {
  armor: ArmorDamage[];
  structure: StructureTrack[];
  criticals: CriticalHit[];
  heat: number;
  pilotHits: number;
}

export const MECH_DAMAGE_LIMITS = {
  counter: 999,
  armorEntries: MECH_LIMITS.armorEntries,
  structureEntries: MECH_LIMITS.slotSections,
  slotIndexMax: MECH_LIMITS.slotsPerSection - 1,
  criticals: MECH_LIMITS.slotSections * MECH_LIMITS.slotsPerSection,
  serializedBytes: 16 * 1024,
} as const;

const whole = (max: number, min = 0) => z.number().int().min(min).max(max);
export const mechDamageSchema: z.ZodType<MechDamage> = z
  .object({
    armor: z
      .object({
        index: whole(MECH_DAMAGE_LIMITS.armorEntries - 1),
        lost: whole(MECH_DAMAGE_LIMITS.counter, 1),
      })
      .array()
      .max(MECH_DAMAGE_LIMITS.armorEntries),
    structure: z
      .object({
        index: whole(MECH_DAMAGE_LIMITS.structureEntries - 1),
        max: whole(MECH_DAMAGE_LIMITS.counter, 1),
        lost: whole(MECH_DAMAGE_LIMITS.counter),
      })
      .array()
      .max(MECH_DAMAGE_LIMITS.structureEntries),
    criticals: z
      .object({
        section: whole(MECH_DAMAGE_LIMITS.structureEntries - 1),
        slot: whole(MECH_DAMAGE_LIMITS.slotIndexMax),
      })
      .array()
      .max(MECH_DAMAGE_LIMITS.criticals),
    heat: whole(MECH_DAMAGE_LIMITS.counter),
    pilotHits: whole(MECH_DAMAGE_LIMITS.counter),
  })
  .superRefine((d, ctx) => {
    const unique = (keys: (number | string)[], path: string) => {
      if (new Set(keys).size !== keys.length) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "Duplicate damage index.",
        });
      }
    };
    unique(
      d.armor.map((a) => a.index),
      "armor",
    );
    unique(
      d.structure.map((s) => s.index),
      "structure",
    );
    unique(
      d.criticals.map((c) => `${c.section}:${c.slot}`),
      "criticals",
    );
    d.structure.forEach((s, i) => {
      if (s.lost > s.max) {
        ctx.addIssue({
          code: "custom",
          path: ["structure", i, "lost"],
          message: "Damage exceeds structure maximum.",
        });
      }
    });
    if (JSON.stringify(d).length > MECH_DAMAGE_LIMITS.serializedBytes) {
      ctx.addIssue({ code: "custom", message: "Mech damage is too large." });
    }
  });

export function emptyMechDamage(): MechDamage {
  return { armor: [], structure: [], criticals: [], heat: 0, pilotHits: 0 };
}

function counter(n: number, max: number = MECH_DAMAGE_LIMITS.counter): number {
  return Number.isNaN(n) ? 0 : Math.max(0, Math.min(max, Math.trunc(n)));
}
function validIndex(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

/** Canonical repair independent of the base record; first indexed entry wins. */
function canonical(d: MechDamage | null): MechDamage {
  if (!d) return emptyMechDamage();
  const armor = new Map<number, ArmorDamage>();
  for (const a of d.armor) {
    if (
      validIndex(a.index, MECH_DAMAGE_LIMITS.armorEntries) &&
      !armor.has(a.index)
    ) {
      armor.set(a.index, { index: a.index, lost: counter(a.lost) });
    }
  }
  const structure = new Map<number, StructureTrack>();
  for (const s of d.structure) {
    if (
      validIndex(s.index, MECH_DAMAGE_LIMITS.structureEntries) &&
      !structure.has(s.index)
    ) {
      const max = counter(s.max);
      structure.set(s.index, {
        index: s.index,
        max,
        lost: counter(s.lost, max),
      });
    }
  }
  const criticals = new Map<string, CriticalHit>();
  for (const c of d.criticals) {
    const key = `${c.section}:${c.slot}`;
    if (
      validIndex(c.section, MECH_DAMAGE_LIMITS.structureEntries) &&
      validIndex(c.slot, MECH_DAMAGE_LIMITS.slotIndexMax + 1) &&
      !criticals.has(key)
    ) {
      criticals.set(key, { section: c.section, slot: c.slot });
    }
  }
  return {
    armor: [...armor.values()]
      .filter((a) => a.lost > 0)
      .sort((a, b) => a.index - b.index),
    structure: [...structure.values()]
      .filter((s) => s.max > 0)
      .sort((a, b) => a.index - b.index),
    criticals: [...criticals.values()].sort(
      (a, b) => a.section - b.section || a.slot - b.slot,
    ),
    heat: counter(d.heat),
    pilotHits: counter(d.pilotHits),
  };
}

export function normalizeMechDamage(
  damage: MechDamage | null,
  mech: MechData | null,
): MechDamage {
  const d = canonical(damage);
  if (!mech) return { ...emptyMechDamage(), pilotHits: d.pilotHits };
  return {
    ...d,
    armor: d.armor
      .filter((a) => validIndex(a.index, mech.armor.length))
      .map((a) => ({
        ...a,
        lost: counter(a.lost, counter(mech.armor[a.index].value)),
      }))
      .filter((a) => a.lost > 0),
    structure: d.structure.filter((s) =>
      validIndex(s.index, mech.criticalSlots.length),
    ),
    criticals: d.criticals.filter(
      (c) =>
        validIndex(c.section, mech.criticalSlots.length) &&
        validIndex(c.slot, mech.criticalSlots[c.section].slots.length),
    ),
  };
}

export function armorLost(d: MechDamage, index: number): number {
  return d.armor.find((a) => a.index === index)?.lost ?? 0;
}
export function setArmorLost(
  d: MechDamage,
  mech: MechData,
  index: number,
  lost: number,
): MechDamage {
  const next = normalizeMechDamage(d, mech);
  if (
    !validIndex(
      index,
      Math.min(mech.armor.length, MECH_DAMAGE_LIMITS.armorEntries),
    )
  )
    return next;
  return normalizeMechDamage(
    {
      ...next,
      armor: [...next.armor.filter((a) => a.index !== index), { index, lost }],
    },
    mech,
  );
}
export function structureTrack(
  d: MechDamage,
  index: number,
): StructureTrack | null {
  const track = d.structure.find((s) => s.index === index);
  return track ? { ...track } : null;
}
export function setStructureMax(
  d: MechDamage,
  mech: MechData,
  index: number,
  max: number | null,
): MechDamage {
  const next = normalizeMechDamage(d, mech);
  if (
    !validIndex(
      index,
      Math.min(mech.criticalSlots.length, MECH_DAMAGE_LIMITS.structureEntries),
    )
  )
    return next;
  const lost = structureTrack(next, index)?.lost ?? 0;
  return normalizeMechDamage(
    {
      ...next,
      structure: [
        ...next.structure.filter((s) => s.index !== index),
        { index, max: max ?? 0, lost },
      ],
    },
    mech,
  );
}
export function setStructureLost(
  d: MechDamage,
  mech: MechData,
  index: number,
  lost: number,
): MechDamage {
  const next = normalizeMechDamage(d, mech);
  return normalizeMechDamage(
    {
      ...next,
      structure: next.structure.map((s) =>
        s.index === index ? { ...s, lost } : s,
      ),
    },
    mech,
  );
}
export function isCriticalHit(
  d: MechDamage,
  section: number,
  slot: number,
): boolean {
  return d.criticals.some((c) => c.section === section && c.slot === slot);
}
export function toggleCritical(
  d: MechDamage,
  mech: MechData,
  section: number,
  slot: number,
): MechDamage {
  const next = normalizeMechDamage(d, mech);
  if (
    !validIndex(
      section,
      Math.min(mech.criticalSlots.length, MECH_DAMAGE_LIMITS.structureEntries),
    ) ||
    !validIndex(
      slot,
      Math.min(
        mech.criticalSlots[section].slots.length,
        MECH_DAMAGE_LIMITS.slotIndexMax + 1,
      ),
    )
  )
    return next;
  return normalizeMechDamage(
    {
      ...next,
      criticals: isCriticalHit(next, section, slot)
        ? next.criticals.filter((c) => c.section !== section || c.slot !== slot)
        : [...next.criticals, { section, slot }],
    },
    mech,
  );
}
export function setHeat(d: MechDamage, heat: number): MechDamage {
  return canonical({ ...d, heat });
}
export function setPilotHits(d: MechDamage, pilotHits: number): MechDamage {
  return canonical({ ...d, pilotHits });
}
export function resetMechDamage(d: MechDamage): MechDamage {
  return {
    ...emptyMechDamage(),
    structure: canonical(d).structure.map((s) => ({ ...s, lost: 0 })),
  };
}
export function sameMechDamage(a: MechDamage, b: MechDamage): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
export function isMechDamageEmpty(d: MechDamage): boolean {
  return sameMechDamage(d, emptyMechDamage());
}
export function hasMechSpecificDamage(d: MechDamage): boolean {
  const next = canonical(d);
  return (
    next.armor.length > 0 ||
    next.structure.length > 0 ||
    next.criticals.length > 0 ||
    next.heat > 0
  );
}
export function locationLabels(names: readonly string[]): string[] {
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  names.forEach((name) => totals.set(name, (totals.get(name) ?? 0) + 1));
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return totals.get(name) === 1 ? name : `${name} #${n}`;
  });
}
