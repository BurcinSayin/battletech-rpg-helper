import type { BtccDraft } from "@/lib/btcc/types";
import { parseEquipmentRow, parseWeaponRow } from "@/lib/btcc/inventory";
import { findEquipment, findWeapon } from "@/lib/rules/load";

export type Inventory = Pick<
  BtccDraft,
  "equip" | "equipLoc" | "weapons" | "chrWeapons"
>;
export type InventoryKind = "equipment" | "weapon";
export const ARMOR_SLOTS = [
  "Head",
  "Torso",
  "Arms",
  "Hands",
  "Legs",
  "Feet",
] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];
export type InventoryChangeResult =
  { ok: true; value: Inventory } | { ok: false; message: string };
const fail = (message: string): InventoryChangeResult => ({
  ok: false,
  message,
});
const success = (value: Inventory): InventoryChangeResult => ({
  ok: true,
  value,
});
const MAX = 2147483647;

/** Decimal wire amounts only: never interpret units, hex, blanks or sentinel dashes. */
export function inventoryAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
export function inventoryCount(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  return Number.isInteger(value) && value > 0 && value <= MAX ? value : null;
}
function parsed(value: Inventory, kind: InventoryKind, index: number) {
  const rows = kind === "equipment" ? value.equip : value.weapons;
  if (!Number.isInteger(index) || index < 0 || index >= rows.length)
    return null;
  return kind === "equipment"
    ? parseEquipmentRow(rows[index])
    : parseWeaponRow(rows[index]);
}
export function quantityProblem(
  value: Inventory,
  kind: InventoryKind,
  index: number,
): string | null {
  const row = parsed(value, kind, index);
  if (!row) return "Unrecognized imported row; quantity cannot be edited.";
  if (inventoryCount(row.countText) === null)
    return "Stored quantity is not a valid positive integer.";
  if (
    inventoryAmount(row.costText) === null ||
    inventoryAmount(row.massText) === null
  )
    return "Stored cost or mass is unknown; quantity cannot be recalculated.";
  return null;
}
export function changeInventoryCount(
  value: Inventory,
  kind: InventoryKind,
  index: number,
  count: number,
): InventoryChangeResult {
  if (!Number.isInteger(count) || count <= 0 || count > MAX)
    return fail(
      "Quantity must be a positive integer no greater than 2147483647.",
    );
  const problem = quantityProblem(value, kind, index);
  if (problem) return fail(problem);
  const row = parsed(value, kind, index)!;
  const oldCount = inventoryCount(row.countText)!;
  if (count === oldCount) return success(value);
  const cost = (inventoryAmount(row.costText)! / oldCount) * count;
  const mass = (inventoryAmount(row.massText)! / oldCount) * count;
  if (
    !Number.isInteger(cost) ||
    cost > MAX ||
    !Number.isFinite(mass) ||
    mass < 0
  )
    return fail(
      "Quantity would require rounding money or exceed desktop amount limits.",
    );
  const fields = row.raw.split(";");
  fields[kind === "equipment" ? 1 : 4] = String(cost);
  fields[kind === "equipment" ? 2 : 5] = String(mass);
  fields[fields.length - 1] = String(count);
  const key = kind === "equipment" ? "equip" : "weapons";
  return success({
    ...value,
    [key]: value[key].map((raw, i) => (i === index ? fields.join(";") : raw)),
  });
}
export function removeInventoryRow(
  value: Inventory,
  kind: InventoryKind,
  index: number,
): InventoryChangeResult {
  const key = kind === "equipment" ? "equip" : "weapons";
  if (!Number.isInteger(index) || index < 0 || index >= value[key].length)
    return fail("Invalid inventory index.");
  const removed = parsed(value, kind, index);
  const rows = value[key].filter((_, i) => i !== index);
  const next = { ...value, [key]: rows };
  const parse = kind === "equipment" ? parseEquipmentRow : parseWeaponRow;
  if (removed && !rows.some((raw) => parse(raw)?.name === removed.name)) {
    if (kind === "equipment")
      next.equipLoc = Object.fromEntries(
        Object.entries(value.equipLoc).filter(
          ([, name]) => name !== removed.name,
        ),
      );
    else
      next.chrWeapons = value.chrWeapons.filter(
        (name) => name !== removed.name,
      );
  }
  return success(next);
}
export function weaponReadinessProblem(
  value: Inventory,
  index: number,
): string | null {
  const row = parsed(value, "weapon", index);
  if (!row || !("skill" in row)) return "Unrecognized weapon row.";
  const catalog = findWeapon(row.name);
  if (
    catalog
      ? catalog.kind !== "weapon"
      : !row.skill.trim() || row.skill.trim() === "None"
  )
    return "This item is not a readyable weapon.";
  const matches = value.weapons
    .map(parseWeaponRow)
    .filter((r) => r?.name === row.name);
  if (matches.some((r) => inventoryCount(r!.countText) === null))
    return "A same-name stack has an unknown quantity.";
  if (value.chrWeapons.length >= 3)
    return "Only three weapons may be newly readied.";
  const owned = matches.reduce(
    (sum, r) => sum + inventoryCount(r!.countText)!,
    0,
  );
  if (value.chrWeapons.filter((name) => name === row.name).length >= owned)
    return "All owned weapons with this name are already readied.";
  return null;
}
export function readyInventoryWeapon(
  value: Inventory,
  index: number,
): InventoryChangeResult {
  const problem = weaponReadinessProblem(value, index);
  if (problem) return fail(problem);
  return success({
    ...value,
    chrWeapons: [
      ...value.chrWeapons,
      parseWeaponRow(value.weapons[index])!.name,
    ],
  });
}
export function unreadyInventoryWeapon(
  value: Inventory,
  readyIndex: number,
): InventoryChangeResult {
  if (
    !Number.isInteger(readyIndex) ||
    readyIndex < 0 ||
    readyIndex >= value.chrWeapons.length
  )
    return fail("Invalid ready index.");
  return success({
    ...value,
    chrWeapons: value.chrWeapons.filter((_, i) => i !== readyIndex),
  });
}
const TOKENS: Record<string, ArmorSlot[]> = {
  H: ["Head"],
  T: ["Torso"],
  TA: ["Torso", "Arms"],
  TAL: ["Torso", "Arms", "Legs"],
  TAH: ["Torso", "Arms", "Head"],
  TOR: ["Torso", "Legs"],
  HAN: ["Hands"],
  L: ["Legs"],
  F: ["Feet"],
  FUL: [...ARMOR_SLOTS],
  N: [],
};
/** Legacy tokens take precedence over canonical builder concatenations. */
export function armorCoverage(
  text: string,
): { slots: ArmorSlot[]; exclusive: boolean } | null {
  const token = text.trim();
  if (Object.hasOwn(TOKENS, token))
    return { slots: TOKENS[token], exclusive: token === "TOR" };
  if (!token || !/^(?:H)?(?:T)?(?:A)?(?:L)?(?:HAN)?(?:F)?$/.test(token))
    return null;
  const tokens = token.match(/HAN|H|T|A|L|F/g)!;
  const names: Record<string, ArmorSlot> = {
    H: "Head",
    T: "Torso",
    A: "Arms",
    L: "Legs",
    HAN: "Hands",
    F: "Feet",
  };
  return { slots: tokens.map((t) => names[t]), exclusive: false };
}
export function armorDisplacements(
  value: Inventory,
  index: number,
  slots: readonly ArmorSlot[],
): [string, string][] {
  const name = parseEquipmentRow(value.equip[index] ?? "")?.name;
  const displaced = new Set(
    Object.entries(value.equipLoc)
      .filter(
        ([slot, garment]) =>
          garment !== name &&
          (slot === "Full" || slots.includes(slot as ArmorSlot)),
      )
      .map(([, garment]) => garment),
  );
  return Object.entries(value.equipLoc).filter(([, garment]) =>
    displaced.has(garment),
  );
}
export function assignInventoryArmor(
  value: Inventory,
  index: number,
  slots: readonly ArmorSlot[],
): InventoryChangeResult {
  const row = parsed(value, "equipment", index);
  if (!row || !("armorLocation" in row))
    return fail("Unrecognized equipment row.");
  const coverage = armorCoverage(row.armorLocation);
  if (
    !coverage ||
    !slots.length ||
    new Set(slots).size !== slots.length ||
    slots.some((slot) => !coverage.slots.includes(slot)) ||
    (coverage.exclusive && slots.length !== 1)
  )
    return fail(
      "Select eligible coverage slots; Torso OR Legs allows only one slot.",
    );
  const displaced = new Set(
    armorDisplacements(value, index, slots).map(([, name]) => name),
  );
  const equipLoc = Object.fromEntries(
    Object.entries(value.equipLoc).filter(
      ([, name]) => name !== row.name && !displaced.has(name),
    ),
  );
  for (const slot of slots) equipLoc[slot] = row.name;
  return success({ ...value, equipLoc });
}
export function clearInventoryArmor(
  value: Inventory,
  slot: string,
): InventoryChangeResult {
  if (!Object.hasOwn(value.equipLoc, slot))
    return fail("Invalid armor placement.");
  return success({
    ...value,
    equipLoc: Object.fromEntries(
      Object.entries(value.equipLoc).filter(
        ([, name]) => name !== value.equipLoc[slot],
      ),
    ),
  });
}
export function inventoryTotals(value: Inventory) {
  const total = {
    mass: { known: 0, unknownRows: 0 },
    cost: { known: 0, unknownRows: 0 },
  };
  const rows = [
    ...value.equip.map(parseEquipmentRow),
    ...value.weapons.map(parseWeaponRow),
  ];
  for (const row of rows)
    for (const field of ["cost", "mass"] as const) {
      const amount = row
        ? inventoryAmount(row[field === "cost" ? "costText" : "massText"])
        : null;
      if (amount === null) total[field].unknownRows++;
      else total[field].known += amount;
    }
  return total;
}
export function inventoryRows(value: Inventory) {
  return [
    ...value.equip.map((raw, index) => {
      const row = parseEquipmentRow(raw);
      const catalog = row ? findEquipment(row.name) : undefined;
      const armor =
        row &&
        ((armorCoverage(row.armorLocation)?.slots.length ?? 0) > 0 ||
          catalog?.kind === "armor" ||
          Object.values(value.equipLoc).includes(row.name));
      return {
        kind: "equipment" as const,
        index,
        raw,
        row,
        catalog,
        group: armor ? "Armor" : "Other Gear",
      };
    }),
    ...value.weapons.map((raw, index) => {
      const row = parseWeaponRow(raw);
      const catalog = row ? findWeapon(row.name) : undefined;
      const gear =
        row &&
        (row.skill.trim() === "None" || (catalog && catalog.kind !== "weapon"));
      return {
        kind: "weapon" as const,
        index,
        raw,
        row,
        catalog,
        group: gear ? "Other Gear" : "Weapons",
      };
    }),
  ];
}
/** Name references are exact and deliberately return every variant. */
export function resolveInventoryName(
  value: Inventory,
  kind: InventoryKind,
  name: string,
) {
  return inventoryRows(value).filter(
    (entry) => entry.kind === kind && entry.row?.name === name,
  );
}
export function readyAllocationWarning(
  value: Inventory,
  name: string,
): string | null {
  const rows = value.weapons
    .map(parseWeaponRow)
    .filter((row) => row?.name === name);
  if (rows.some((row) => inventoryCount(row!.countText) === null))
    return "Owned quantity is unknown.";
  const count = rows.reduce(
    (sum, row) => sum + inventoryCount(row!.countText)!,
    0,
  );
  return value.chrWeapons.filter((n) => n === name).length > count
    ? "Readied quantity exceeds known owned quantity."
    : null;
}
export function armorPlacementWarning(value: Inventory): string | null {
  if (
    Object.hasOwn(value.equipLoc, "Full") &&
    Object.keys(value.equipLoc).some((slot) =>
      ARMOR_SLOTS.includes(slot as ArmorSlot),
    )
  )
    return "Overlapping imported Full and standard armor placements.";
  if (
    Object.keys(value.equipLoc).some(
      (slot) => slot !== "Full" && !ARMOR_SLOTS.includes(slot as ArmorSlot),
    )
  )
    return "Unresolved imported armor slot names.";
  return null;
}
