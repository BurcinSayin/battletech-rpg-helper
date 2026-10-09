import type { BtccRow } from "@/lib/btcc/types";
import { findTrait, opposingTrait } from "@/lib/rules/load";
import type { Trait } from "@/lib/validation/catalog";

/** Attained legal TP tier; XP remains the authoritative stored value. */
export function traitLevel(name: string, xp: number): number {
  const whole = Math.trunc(xp / 100) || 0;
  const meta = findTrait(name);
  if (!meta) return whole;

  let level = 0;
  for (const tier of meta.tp_levels) {
    if (
      tier * whole > 0 &&
      Math.abs(tier) <= Math.abs(whole) &&
      Math.abs(tier) > Math.abs(level)
    ) {
      level = tier;
    }
  }
  return level;
}

/** Net explicit opponents before conversion, retaining every original row. */
export function traitLevels(traits: readonly BtccRow[]): number[] {
  const levels = traits.map((row) => traitLevel(row.name, row.xp));
  const groups = new Map<string, { meta: Trait; indices: number[] }>();
  traits.forEach((row, index) => {
    const meta = findTrait(row.name);
    if (!meta) return;
    const group = groups.get(meta.name);
    if (group) group.indices.push(index);
    else groups.set(meta.name, { meta, indices: [index] });
  });

  const processed = new Set<string>();
  for (const [name, group] of groups) {
    if (processed.has(name)) continue;
    const partner = opposingTrait(name);
    const other = partner && groups.get(partner.name);
    if (!other) continue;
    processed.add(name);
    processed.add(other.meta.name);

    let netXp = 0;
    for (const side of [group, other]) {
      for (const index of side.indices) {
        netXp += traits[index].xp;
        levels[index] = 0;
      }
    }
    if (netXp === 0) continue;
    const survivor = [group, other].find((side) =>
      side.meta.tp_levels.some((tier) => tier * netXp > 0),
    );
    if (survivor) {
      levels[survivor.indices[0]] = traitLevel(survivor.meta.name, netXp);
    }
  }
  return levels;
}
