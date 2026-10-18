import type {
  CatalogAmount,
  EquipmentItem,
  WeaponItem,
} from "../validation/catalog";

export interface EquipmentRow {
  raw: string;
  name: string;
  costText: string;
  massText: string;
  armorLocation: string;
  bar: string;
  notes: string;
  countText: string;
}

export interface WeaponRow {
  raw: string;
  skill: string;
  name: string;
  damage: string;
  range: string;
  costText: string;
  massText: string;
  shots: string;
  ammoCostText: string;
  ammoMassText: string;
  notes: string;
  countText: string;
}

export interface EquipmentRowOverrides {
  unitCost?: number;
  unitMassKg?: number;
  armorLocation?: string;
  bar?: string;
  notes?: string;
}

export interface WeaponRowOverrides {
  unitCost?: number;
  unitMassKg?: number;
  ammoCost?: number;
  ammoMassKg?: number;
  damage?: string;
  range?: string;
  shots?: string;
  notes?: string;
}

export type InventoryRowResult =
  | { ok: true; row: string }
  | {
      ok: false;
      code:
        "invalid-count" | "invalid-value" | "unresolved-value" | "unsafe-field";
      fields: string[];
    };

type FailureCode = Exclude<InventoryRowResult, { ok: true }>["code"];
type Issue = { code: FailureCode; field: string };
type CatalogItem = EquipmentItem | WeaponItem;
const MAX_DESKTOP_INTEGER = 2147483647;
const ARMOR_SLOTS = ["H", "T", "A", "L", "HAN", "F"] as const;
const UNSAFE_FIELD = /[;:\r\n]/;
const DASH = /^[—–-]$/;

/** A view only: even empty cells and unsafe legacy characters remain verbatim. */
export function parseEquipmentRow(raw: string): EquipmentRow | null {
  if (/[\r\n]/.test(raw)) return null;
  const fields = raw.split(";");
  if (fields.length !== 7) return null;
  const [name, costText, massText, armorLocation, bar, notes, countText] =
    fields;
  return {
    raw,
    name,
    costText,
    massText,
    armorLocation,
    bar,
    notes,
    countText,
  };
}

export function parseWeaponRow(raw: string): WeaponRow | null {
  if (/[\r\n]/.test(raw)) return null;
  const fields = raw.split(";");
  if (fields.length !== 11) return null;
  const [
    skill,
    name,
    damage,
    range,
    costText,
    massText,
    shots,
    ammoCostText,
    ammoMassText,
    notes,
    countText,
  ] = fields;
  return {
    raw,
    skill,
    name,
    damage,
    range,
    costText,
    massText,
    shots,
    ammoCostText,
    ammoMassText,
    notes,
    countText,
  };
}

function validCount(count: number): boolean {
  return (
    Number.isSafeInteger(count) && count > 0 && count <= MAX_DESKTOP_INTEGER
  );
}

function invalidCount(): InventoryRowResult {
  return { ok: false, code: "invalid-count", fields: ["count"] };
}

function finish(
  fields: [string, string][],
  issues: Issue[],
): InventoryRowResult {
  for (const [field, value] of fields) {
    if (UNSAFE_FIELD.test(value)) issues.push({ code: "unsafe-field", field });
    else if (!value.trim()) issues.push({ code: "invalid-value", field });
  }
  // Unsafe output must not be mistaken for a merely unresolved price or mass.
  for (const code of [
    "unsafe-field",
    "invalid-value",
    "unresolved-value",
  ] as const) {
    const names = issues
      .filter((issue) => issue.code === code)
      .map((issue) => issue.field);
    if (names.length) return { ok: false, code, fields: [...new Set(names)] };
  }
  return { ok: true, row: fields.map(([, value]) => value).join(";") };
}

function amountValue(
  amount: CatalogAmount,
  override: number | undefined,
  field: string,
  money: boolean,
  issues: Issue[],
  absentIsZero = false,
): number {
  const value = override !== undefined ? override : amount.value;
  if (value === null) {
    if (
      absentIsZero &&
      amount.multiplier === null &&
      (amount.text === null || DASH.test(amount.text.trim()))
    )
      return 0;
    issues.push({ code: "unresolved-value", field });
    return 0;
  }
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (money && value > MAX_DESKTOP_INTEGER)
  ) {
    issues.push({ code: "invalid-value", field });
    return 0;
  }
  if (money && !Number.isInteger(value)) {
    issues.push({
      code: override === undefined ? "unresolved-value" : "invalid-value",
      field,
    });
    return 0;
  }
  return value;
}

function stackTotal(
  unit: number,
  count: number,
  field: string,
  money: boolean,
  issues: Issue[],
): string {
  const total = unit * count;
  if (
    !Number.isFinite(total) ||
    total < 0 ||
    (money && (!Number.isInteger(total) || total > MAX_DESKTOP_INTEGER))
  ) {
    issues.push({ code: "invalid-value", field });
    return "0";
  }
  return String(total);
}

function wireStat(source: string | null, override?: string): string {
  if (override !== undefined) return override;
  return source === null || DASH.test(source.trim()) ? "0" : source;
}

/** Only new presentation text is normalized; catalog and imported notes are untouched. */
function presentationNotes(item: CatalogItem, override?: string): string {
  const pages = [
    ...new Set(
      item.sources.map(
        (source) => `p. ${source.printedPage} (PDF p. ${source.pdfPage})`,
      ),
    ),
  ];
  const notes: string[] = [];
  if (override !== undefined) notes.push(override);
  for (const note of item.notes) {
    if (note.scope === "part") notes.push(`Table context - ${note.text}`);
    else if (note.scope === "shared")
      notes.push(
        `Shared context (${note.section ?? item.category}) - ${note.text}`,
      );
    else if (override === undefined) notes.push(note.text);
  }
  return (
    [...pages, ...notes]
      .join(" | ")
      .replace(/[;:]/g, ",")
      .replace(/\s+/g, " ")
      .trim() || "None"
  );
}

function armorLocation(
  item: EquipmentItem,
  override: string | undefined,
  issues: Issue[],
): string {
  if (override !== undefined) {
    if (
      override !== "FUL" &&
      override !== "N" &&
      (!override || !/^(?:H)?(?:T)?(?:A)?(?:L)?(?:HAN)?(?:F)?$/.test(override))
    ) {
      issues.push({ code: "invalid-value", field: "armorLocation" });
    }
    return override;
  }
  if (item.armor === null) return "N";
  if (item.armor.locations !== null && item.armor.locations.length > 0) {
    const slots = ARMOR_SLOTS.filter((slot) =>
      item.armor!.locations!.includes(slot),
    );
    return slots.length === ARMOR_SLOTS.length ? "FUL" : slots.join("");
  }
  const concealed =
    item.category === "PERSONAL ARMOR" &&
    item.section === "CONCEALED ARMOR" &&
    item.kind === "modifier";
  if (!concealed && DASH.test(item.armor.coverage.trim())) return "N";
  issues.push({ code: "unresolved-value", field: "armorLocation" });
  return "N";
}

function armorBar(
  item: EquipmentItem,
  override: string | undefined,
  issues: Issue[],
): string {
  if (override !== undefined) {
    if (
      !/^\d+\/\d+\/\d+\/\d+$/.test(override) ||
      !override.split("/").every((part) => Number.isFinite(Number(part)))
    ) {
      issues.push({ code: "invalid-value", field: "bar" });
    }
    return override;
  }
  if (item.armor === null) return "0/0/0/0";
  if (
    item.armor.ratings !== null &&
    item.armor.ratings.every(
      (rating) => Number.isInteger(rating) && rating >= 0,
    )
  )
    return item.armor.ratings.join("/");
  if (DASH.test(item.armor.bar.trim())) return "0/0/0/0";
  issues.push({ code: "unresolved-value", field: "bar" });
  return "0/0/0/0";
}

/** Create a desktop-safe stack without changing an existing raw inventory row. */
export function createEquipmentRow(
  item: EquipmentItem,
  count: number,
  overrides: EquipmentRowOverrides = {},
): InventoryRowResult {
  if (!validCount(count)) return invalidCount();
  const issues: Issue[] = [];
  const cost = amountValue(item.cost, overrides.unitCost, "cost", true, issues);
  const mass = amountValue(
    item.mass,
    overrides.unitMassKg,
    "mass",
    false,
    issues,
  );
  return finish(
    [
      ["name", item.name],
      ["cost", stackTotal(cost, count, "cost", true, issues)],
      ["mass", stackTotal(mass, count, "mass", false, issues)],
      ["armorLocation", armorLocation(item, overrides.armorLocation, issues)],
      ["bar", armorBar(item, overrides.bar, issues)],
      ["notes", presentationNotes(item, overrides.notes)],
      ["count", String(count)],
    ],
    issues,
  );
}

export function createWeaponRow(
  item: WeaponItem,
  count: number,
  overrides: WeaponRowOverrides = {},
): InventoryRowResult {
  if (!validCount(count)) return invalidCount();
  const issues: Issue[] = [];
  const cost = amountValue(item.cost, overrides.unitCost, "cost", true, issues);
  const mass = amountValue(
    item.mass,
    overrides.unitMassKg,
    "mass",
    false,
    issues,
  );
  const pack = item.kind === "powerPack";
  const ammoCost = amountValue(
    pack ? ZERO_AMOUNT : item.ammoCost,
    overrides.ammoCost,
    "ammoCost",
    true,
    issues,
    true,
  );
  const ammoMass = amountValue(
    pack ? ZERO_AMOUNT : item.ammoMass,
    overrides.ammoMassKg,
    "ammoMass",
    false,
    issues,
    true,
  );
  let shots = wireStat(item.shots, overrides.shots);
  if (pack) {
    const packShots = item.capacity === null ? null : `${item.capacity} PP`;
    if (packShots === null || item.capacityUnit !== "powerPoints")
      issues.push({ code: "unresolved-value", field: "shots" });
    else shots = overrides.shots ?? packShots;
    for (const [field, value, expected] of [
      ["damage", overrides.damage, "0"],
      ["range", overrides.range, "0"],
      ["shots", overrides.shots, packShots],
      ["ammoCost", overrides.ammoCost, 0],
      ["ammoMass", overrides.ammoMassKg, 0],
    ] as const) {
      if (value !== undefined && value !== expected)
        issues.push({ code: "invalid-value", field });
    }
  }
  return finish(
    [
      ["skill", pack ? "None" : item.skill],
      ["name", item.name],
      ["damage", wireStat(pack ? null : item.damage, overrides.damage)],
      ["range", wireStat(pack ? null : item.range, overrides.range)],
      ["cost", stackTotal(cost, count, "cost", true, issues)],
      ["mass", stackTotal(mass, count, "mass", false, issues)],
      ["shots", shots],
      ["ammoCost", String(ammoCost)],
      ["ammoMass", String(ammoMass)],
      ["notes", presentationNotes(item, overrides.notes)],
      ["count", String(count)],
    ],
    issues,
  );
}

const ZERO_AMOUNT: CatalogAmount = { text: "0", value: 0, multiplier: null };

/** A reload is one purchase unit, not a price/mass divided by magazine capacity. */
export function createAmmoRow(
  weapon: WeaponItem,
  count: number,
): InventoryRowResult {
  if (!validCount(count)) return invalidCount();
  const issues: Issue[] = [];
  if (weapon.kind !== "weapon")
    issues.push({ code: "unresolved-value", field: "kind" });
  if (weapon.capacity === null || weapon.capacityUnit !== "rounds")
    issues.push({ code: "unresolved-value", field: "shots" });
  const cost = amountValue(
    weapon.ammoCost,
    undefined,
    "ammoCost",
    true,
    issues,
  );
  const mass = amountValue(
    weapon.ammoMass,
    undefined,
    "ammoMass",
    false,
    issues,
  );
  return finish(
    [
      ["skill", "None"],
      ["name", `\\_Ammo ${weapon.name}`],
      ["damage", "0"],
      ["range", "0"],
      ["cost", stackTotal(cost, count, "ammoCost", true, issues)],
      ["mass", stackTotal(mass, count, "ammoMass", false, issues)],
      ["shots", wireStat(weapon.shots)],
      ["ammoCost", "0"],
      ["ammoMass", "0"],
      ["notes", presentationNotes(weapon)],
      ["count", String(count)],
    ],
    issues,
  );
}
