import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  equipmentSchema,
  weaponsSchema,
  skillsSchema,
  type CatalogAmount,
  type EquipmentItem,
  type WeaponItem,
} from "../lib/validation/catalog";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const sourceDirectory = join(repoRoot, "docs/rule_book/Warriors-Catalog");
const sourcePrefix = "docs/rule_book/Warriors-Catalog/";
const nonempty = z.string().min(1);
const indexSchema = z.number().int().nonnegative();
const pageSchema = z.number().int().positive();
const basenameSchema = nonempty.refine(
  (file) => !/[\\/]/.test(file) && file.endsWith(".json"),
  "Expected a JSON basename",
);
const partSchema = z
  .object({
    printed_page: pageSchema,
    pdf_page: pageSchema,
    columns: z.array(nonempty).min(1),
    rows: z.array(z.record(z.string(), z.string())),
    notes: z.array(z.string()),
    shared_notes: z
      .array(
        z.object({ text: z.string(), section: z.string().optional() }).strict(),
      )
      .optional(),
    description: z.string().optional(),
  })
  .strict();
const rulebookTableDataSchema = z
  .object({
    table_name: nonempty,
    source: z
      .object({
        file: nonempty,
        chapter: nonempty,
        printed_pages: z.array(pageSchema).min(1),
        pdf_pages: z.array(pageSchema).min(1),
      })
      .strict(),
    parts: z.array(partSchema).min(1),
    row_count: indexSchema,
  })
  .strict();
const rulebookEquipmentTableSchema = z
  .object({ file: basenameSchema, data: rulebookTableDataSchema })
  .strict();
const sourceSelectorSchema = z
  .object({
    table: nonempty,
    section: z.string().nullable(),
    item: nonempty,
    occurrence: indexSchema,
  })
  .strict();
const dispositionSchema = z.enum([
  "item",
  "parent",
  "reference",
  "crossReference",
  "duplicate",
]);
const adapterSchema = z.enum([
  "weapon",
  "explosive",
  "ordnance",
  "ammoModifier",
  "armor",
  "equipment",
  "powerPack",
  "implant",
  "drug",
  "vehicle",
  "fuel",
  "reference",
]);
const equipmentMappingSchema = z
  .object({
    version: z.literal(1),
    desktopSource: z
      .object({
        repository: nonempty,
        revision: nonempty.nullable(),
        files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
      })
      .strict(),
    tables: z.array(
      z
        .object({
          file: basenameSchema,
          adapter: adapterSchema,
          columns: z.array(z.array(nonempty).min(1)).min(1),
        })
        .strict(),
    ),
    overrides: z.array(
      z
        .object({
          source: sourceSelectorSchema,
          id: nonempty.optional(),
          name: nonempty.optional(),
          aliases: z.array(nonempty).optional(),
          disposition: dispositionSchema.optional(),
          parent: sourceSelectorSchema.optional(),
          target: sourceSelectorSchema.optional(),
          output: z.enum(["equipment", "weapons"]).optional(),
          kind: z
            .enum([
              "gear",
              "armor",
              "implant",
              "drug",
              "vehicle",
              "fuel",
              "modifier",
              "weapon",
              "ammunition",
              "powerPack",
            ])
            .optional(),
          reason: nonempty,
        })
        .strict(),
    ),
  })
  .strict();
const sourceDispositionSchema = z
  .object({
    source: z
      .object({
        file: nonempty,
        table: nonempty,
        printedPage: pageSchema,
        pdfPage: pageSchema,
        part: indexSchema,
        row: indexSchema,
      })
      .strict(),
    disposition: dispositionSchema,
    itemIds: z.array(nonempty),
  })
  .strict();

export type RulebookTableData = z.infer<typeof rulebookTableDataSchema>;
export type RulebookEquipmentTable = z.infer<
  typeof rulebookEquipmentTableSchema
>;
export type SourceSelector = z.infer<typeof sourceSelectorSchema>;
export type EquipmentMapping = z.infer<typeof equipmentMappingSchema>;
export type SourceDisposition = z.infer<typeof sourceDispositionSchema>;
export interface EquipmentCatalogBuild {
  equipment: EquipmentItem[];
  weapons: WeaponItem[];
  coverage: SourceDisposition[];
}
type Adapter = z.infer<typeof adapterSchema>;
type Override = EquipmentMapping["overrides"][number];
type Item = EquipmentItem | WeaponItem;
type Note = Item["notes"][number];
type Source = SourceDisposition["source"];
type SourceRow = {
  source: Source;
  part: RulebookTableData["parts"][number];
  cells: Record<string, string>;
  raw: Record<string, string>;
  section: string | null;
  label: string;
  adapter: Adapter;
  override?: Override;
  parent?: SourceRow;
  target?: SourceRow;
  disposition: SourceDisposition["disposition"];
};

function fail(row: SourceRow, field: string, message: string): never {
  throw new Error(
    `${row.source.file} part ${row.source.part} row ${row.source.row} field ${field}: ${message}`,
  );
}
function parseWithContext<T>(
  schema: z.ZodType<T>,
  input: unknown,
  context: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}
const absent = (text: string | null | undefined) =>
  text == null || text.trim() === "" || /^[—–-]$/.test(text.trim());
const resolvedText = (text: string | undefined): string | null =>
  absent(text) ? null : text!;
const decimal = "(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\\.[0-9]+)?";
const integer = "(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)";
const absolutePattern = new RegExp(`^${decimal}$`);
const massPattern = new RegExp(`^(${decimal})\\s*(KG|G)$`);
const multiplierPattern = new RegExp(`^X(${decimal})$`);
const numeric = (text: string) => Number(text.replaceAll(",", ""));

function amount(text: string | null | undefined, mass = false): CatalogAmount {
  const result: CatalogAmount = {
    text: text == null || text.trim() === "" ? null : text,
    value: null,
    multiplier: null,
  };
  if (result.text === null) return result;
  const value = result.text.trim();
  const multiplier = multiplierPattern.exec(value);
  if (multiplier) result.multiplier = numeric(multiplier[1]);
  else if (mass) {
    const match = massPattern.exec(value);
    if (match) result.value = numeric(match[1]) / (match[2] === "G" ? 1000 : 1);
  } else if (absolutePattern.test(value)) result.value = numeric(value);
  return result;
}

function pair(row: SourceRow, field: string): [string | null, string | null] {
  const value = row.cells[field];
  if (value === undefined) return [null, null];
  const parts = value.split("/");
  if (parts.length > 2)
    fail(row, field, "Expected at most one purchase/reload separator");
  return [parts[0].trim(), parts[1]?.trim() ?? null];
}

const skillSections: Record<string, string> = {
  "SKILL: MELEE WEAPONS": "Melee Weapons",
  "SKILL: ARCHERY": "Archery",
  "SKILL: THROWN WEAPONS": "Thrown Weapons",
  "SKILL: SUPPORT WEAPONS": "Support Weapons",
  "SKILL: ARTILLERY": "Artillery",
  "SKILL: DEMOLITIONS": "Demolitions",
};
function weaponSkill(
  row: SourceRow,
  knownSkills: ReadonlySet<string>,
): {
  skill: string;
  specialty: string | null;
} {
  if (["ordnance", "ammoModifier", "powerPack"].includes(row.adapter))
    return { skill: "None", specialty: null };
  const smallArms = /^SKILL: SMALL ARMS \(([^()]+)\)$/.exec(row.section ?? "");
  const skill = smallArms ? "Small Arms" : skillSections[row.section ?? ""];
  if (!skill || !knownSkills.has(skill))
    fail(
      row,
      "_section",
      `Unknown weapon skill section ${JSON.stringify(row.section)}`,
    );
  return { skill, specialty: smallArms?.[1] ?? null };
}

function rangeMeters(text: string | null): WeaponItem["rangeMeters"] {
  if (text === null) return null;
  const bands = text
    .trim()
    .split("/")
    .map((part) => part.trim());
  if (bands.length === 4 && bands.every((part) => absolutePattern.test(part))) {
    return bands.map(numeric) as [number, number, number, number];
  }
  const single = new RegExp(`^(${decimal})\\s*M?$`).exec(text.trim());
  return single ? [numeric(single[1])] : null;
}
function shotValues(
  text: string | null,
  powerPack: boolean,
): Pick<WeaponItem, "capacity" | "capacityUnit" | "powerPerShot"> {
  const result: Pick<WeaponItem, "capacity" | "capacityUnit" | "powerPerShot"> =
    { capacity: null, capacityUnit: null, powerPerShot: null };
  if (text === null) return result;
  if (powerPack) {
    const match = new RegExp(`^(${integer})\\s+PP$`).exec(text.trim());
    if (match) {
      result.capacity = numeric(match[1]);
      result.capacityUnit = "powerPoints";
    }
    return result;
  }
  const hybrid = new RegExp(`^(${integer})\\s*,\\s*(${integer})\\s*PPS$`).exec(
    text.trim(),
  );
  const pps = new RegExp(`^(${integer})\\s*PPS$`).exec(text.trim());
  if (pps) result.powerPerShot = numeric(pps[1]);
  else if (hybrid) {
    result.capacity = numeric(hybrid[1]);
    result.capacityUnit = "rounds";
    result.powerPerShot = numeric(hybrid[2]);
  } else if (new RegExp(`^${integer}$`).test(text.trim())) {
    result.capacity = numeric(text.trim());
    result.capacityUnit = "rounds";
  }
  return result;
}

const coverageNames = ["HEAD", "TORSO", "ARMS", "LEGS", "HANDS", "FEET"];
const coverageSlots = ["H", "T", "A", "L", "HAN", "F"] as const;
function armorLocations(
  text: string,
): NonNullable<EquipmentItem["armor"]>["locations"] {
  if (text.trim() === "FULL") return [...coverageSlots];
  const names = text.split(",").map((part) => part.trim());
  if (!names.every((name) => coverageNames.includes(name))) return null;
  return coverageSlots.filter((_, index) =>
    names.includes(coverageNames[index]),
  );
}
function armorRatings(
  text: string,
): NonNullable<EquipmentItem["armor"]>["ratings"] {
  const components = text.split("/").map((part) => part.trim());
  return components.length === 4 &&
    components.every((part) => absolutePattern.test(part))
    ? (components.map(numeric) as [number, number, number, number])
    : null;
}

function ownNotes(row: SourceRow, family = false): Note[] {
  const notes: Note[] = [];
  if (!absent(row.cells.NOTES))
    notes.push({
      text: row.cells.NOTES,
      scope: family ? "family" : "item",
      section: row.section,
    });
  if (!absent(row.cells.row_notes))
    notes.push({
      text: row.cells.row_notes,
      scope: family ? "family" : "row",
      section: row.section,
    });
  return notes;
}
function contextualNotes(row: SourceRow): Note[] {
  const notes: Note[] = [];
  if (row.part.description !== undefined)
    notes.push({ text: row.part.description, scope: "part", section: null });
  for (const text of row.part.notes)
    notes.push({ text, scope: "part", section: null });
  for (const note of row.part.shared_notes ?? [])
    notes.push({
      text: note.text,
      scope: "shared",
      section: note.section ?? null,
    });
  return notes;
}
function notesFor(row: SourceRow): Note[] {
  const notes = ownNotes(row);
  if (row.parent) notes.push(...ownNotes(row.parent, true));
  notes.push(...contextualNotes(row));
  if (row.parent && row.parent.part !== row.part)
    notes.push(...contextualNotes(row.parent));
  return notes;
}

const defaultKinds: Record<Adapter, Item["kind"] | null> = {
  weapon: "weapon",
  explosive: "weapon",
  ordnance: "ammunition",
  ammoModifier: "modifier",
  armor: "armor",
  equipment: "gear",
  powerPack: "powerPack",
  implant: "implant",
  drug: "drug",
  vehicle: "vehicle",
  fuel: "fuel",
  reference: null,
};
const weaponAdapters: Partial<Record<Adapter, true>> = {
  weapon: true,
  explosive: true,
  ordnance: true,
  ammoModifier: true,
  powerPack: true,
};
const nameColumns: Record<Adapter, string | null> = {
  weapon: "ITEM",
  explosive: "ITEM",
  ordnance: "ITEM",
  ammoModifier: "ITEM",
  armor: "ITEM",
  equipment: "ITEM",
  powerPack: "ITEM",
  implant: "ITEM",
  drug: "SAMPLE DRUG OR POISON",
  vehicle: "VEHICLE",
  fuel: "FUEL TYPE",
  reference: null,
};
const requiredColumns: Record<Adapter, string[]> = {
  weapon: [
    "ITEM",
    "EQUIPMENT RATINGS",
    "AP/BD",
    "RANGE",
    "SHOTS",
    "COST/RELOAD",
    "AFF",
    "MASS/RELOAD",
    "NOTES",
  ],
  explosive: [
    "ITEM",
    "EQUIPMENT RATINGS",
    "AP/BD",
    "RANGE",
    "SHOTS",
    "COST/RELOAD",
    "AFF",
    "MASS",
    "NOTES",
  ],
  ordnance: [
    "ITEM",
    "EQUIPMENT RATINGS",
    "AP/BD",
    "COST/RELOAD",
    "AFF",
    "MASS",
    "NOTES",
  ],
  ammoModifier: [
    "ITEM",
    "EQUIPMENT RATINGS",
    "AP/BD",
    "RANGE",
    "COST/RELOAD",
    "AFF",
    "NOTES",
  ],
  armor: [
    "ITEM",
    "EQUIPMENT RATINGS",
    "BAR (M/B/E/X)",
    "COST/PATCH",
    "AFF",
    "MASS",
    "COVERAGE",
    "NOTES",
  ],
  equipment: ["ITEM", "EQUIPMENT RATINGS", "AFF", "MASS", "NOTES"],
  powerPack: [
    "ITEM",
    "EQUIPMENT RATINGS",
    "COST",
    "AFF",
    "MASS",
    "POWER CAPACITY",
    "NOTES",
  ],
  implant: ["ITEM", "EQUIPMENT RATINGS", "COST", "AFF", "NOTES"],
  drug: [
    "SAMPLE DRUG OR POISON",
    "PRIMARY VECTOR",
    "DRUG STRENGTH",
    "POISON AP",
    "DURATION",
    "BASE PRICE",
    "EQUIP. RATINGS",
    "NOTES",
  ],
  vehicle: [
    "VEHICLE",
    "EQUIPMENT RATINGS",
    "COST*",
    "ARMOR** F/S/R (BAR)",
    "FUEL (KG)/TYPE***",
    "RANGE†",
    "SPEED (KPH)†",
    "AFF",
    "CREW/PASS",
    "CARGO (KG)",
  ],
  fuel: ["FUEL TYPE", "EQUIPMENT RATINGS", "COST PER KG", "NOTES"],
  reference: [],
};
const keyFor = (table: string, section: string | null, label: string) =>
  JSON.stringify([table, section, label]);
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const sameArray = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

function collectRows(
  tables: RulebookEquipmentTable[],
  mapping: EquipmentMapping,
): SourceRow[] {
  const byFile = new Map<string, RulebookEquipmentTable>();
  for (const input of tables) {
    const table = parseWithContext(
      rulebookEquipmentTableSchema,
      input,
      input.file,
    );
    if (byFile.has(table.file))
      throw new Error(`${table.file}: Duplicate input table`);
    byFile.set(table.file, table);
  }
  const rows: SourceRow[] = [];
  const declared = new Set<string>();
  const tableNames = new Set<string>();
  for (const entry of mapping.tables) {
    if (declared.has(entry.file))
      throw new Error(`${entry.file}: Duplicate manifest table`);
    declared.add(entry.file);
    const wrapper = byFile.get(entry.file);
    if (!wrapper)
      throw new Error(`${entry.file}: Missing manifest source table`);
    const data = wrapper.data;
    if (tableNames.has(data.table_name))
      throw new Error(`${entry.file}: Ambiguous table_name ${data.table_name}`);
    tableNames.add(data.table_name);
    if (
      data.row_count !==
      data.parts.reduce((sum, part) => sum + part.rows.length, 0)
    )
      throw new Error(`${entry.file}: row_count does not match source rows`);
    if (data.source.printed_pages.length !== data.source.pdf_pages.length)
      throw new Error(`${entry.file}: source page lists must be paired`);
    const usedLayouts = new Set<number>();
    for (const [partIndex, part] of data.parts.entries()) {
      const context = `${entry.file} part ${partIndex}`;
      if (
        !data.source.printed_pages.some(
          (page, index) =>
            page === part.printed_page &&
            data.source.pdf_pages[index] === part.pdf_page,
        )
      )
        throw new Error(
          `${context}: printed/PDF page pair missing from source`,
        );
      const layout = entry.columns.findIndex((columns) =>
        sameArray(columns, part.columns),
      );
      if (layout < 0) throw new Error(`${context}: Undeclared columns layout`);
      usedLayouts.add(layout);
      if (
        new Set(part.columns).size !== part.columns.length ||
        part.columns.some((column) =>
          ["_section", "row_notes"].includes(column),
        )
      )
        throw new Error(`${context}: Duplicate or metadata column declaration`);
      for (const column of requiredColumns[entry.adapter]) {
        if (!part.columns.includes(column))
          throw new Error(
            `${context}: Missing required column ${column} for ${entry.adapter}`,
          );
      }
      if (
        entry.adapter === "equipment" &&
        !part.columns.includes("COST") &&
        !part.columns.includes("COST/RELOAD")
      )
        throw new Error(
          `${context}: Missing required COST or COST/RELOAD column`,
        );
      const nameColumn = nameColumns[entry.adapter] ?? part.columns[0];
      for (const [rowIndex, cells] of part.rows.entries()) {
        const source: Source = {
          file: sourcePrefix + entry.file,
          table: data.table_name,
          printedPage: part.printed_page,
          pdfPage: part.pdf_page,
          part: partIndex,
          row: rowIndex,
        };
        const row: SourceRow = {
          source,
          part,
          cells,
          raw: {},
          section: cells._section ?? null,
          label: cells[nameColumn],
          adapter: entry.adapter,
          disposition: entry.adapter === "reference" ? "reference" : "item",
        };
        for (const column of part.columns) {
          if (!(column in cells)) fail(row, column, "Missing declared cell");
          row.raw[column] = cells[column];
        }
        for (const field of Object.keys(cells))
          if (
            !part.columns.includes(field) &&
            !["_section", "row_notes"].includes(field)
          )
            fail(row, field, "Undeclared cell");
        if (!row.label.trim()) fail(row, nameColumn, "Empty source label");
        rows.push(row);
      }
    }
    if (usedLayouts.size !== entry.columns.length)
      throw new Error(
        `${entry.file}: Stale or duplicate manifest columns layout`,
      );
  }
  for (const file of byFile.keys())
    if (!declared.has(file))
      throw new Error(`${file}: Undeclared source table`);
  return rows;
}

function applyOverrides(rows: SourceRow[], mapping: EquipmentMapping): void {
  const selectors = new Map<string, SourceRow[]>();
  for (const row of rows) {
    const key = keyFor(row.source.table, row.section, row.label);
    const matches = selectors.get(key) ?? [];
    matches.push(row);
    selectors.set(key, matches);
  }
  const resolveSelector = (selector: SourceSelector): SourceRow => {
    const row = selectors.get(
      keyFor(selector.table, selector.section, selector.item),
    )?.[selector.occurrence];
    if (!row)
      throw new Error(`Unresolved source selector ${JSON.stringify(selector)}`);
    return row;
  };
  for (const override of mapping.overrides) {
    const row = resolveSelector(override.source);
    if (row.override)
      fail(
        row,
        "override",
        "Multiple overrides for one source; merge them explicitly",
      );
    row.override = override;
    row.disposition = override.disposition ?? row.disposition;
    if (override.parent) row.parent = resolveSelector(override.parent);
    if (override.target) row.target = resolveSelector(override.target);
    if (
      Object.keys(override).every((key) => ["source", "reason"].includes(key))
    )
      fail(row, "override", "Override has no action");
  }
  for (const row of rows) {
    const disposition = row.disposition;
    if (row.adapter === "reference" && disposition !== "reference")
      fail(row, "disposition", "Supporting reference tables cannot emit items");
    if (
      disposition === "item" &&
      row.adapter === "weapon" &&
      /^\(.* MODE\)$/.test(row.label) &&
      !row.parent
    )
      fail(row, "parent", "Weapon mode requires an explicit parent mapping");
    if (
      disposition === "item" &&
      row.adapter === "armor" &&
      !row.parent &&
      row.section !== null &&
      selectors.has(keyFor(row.source.table, null, row.section))
    )
      fail(
        row,
        "parent",
        "Armor family child requires an explicit parent mapping",
      );
    if (
      disposition !== "item" &&
      row.override &&
      ["id", "name", "aliases", "output", "kind"].some(
        (key) => key in row.override!,
      )
    )
      fail(row, "override", "Output overrides require an item disposition");
    if (disposition === "crossReference" || disposition === "duplicate") {
      if (
        !row.target ||
        row.target === row ||
        row.target.disposition !== "item"
      )
        fail(row, "target", "Reference target must be a distinct emitted item");
      if (disposition === "duplicate") {
        const keys = Object.keys(row.cells);
        if (
          keys.length !== Object.keys(row.target.cells).length ||
          keys.some((key) => row.cells[key] !== row.target!.cells[key])
        )
          fail(
            row,
            "target",
            "Duplicate rows must have identical cells and metadata",
          );
      }
    } else if (row.target)
      fail(
        row,
        "target",
        "Only duplicates and cross-references can have a target",
      );
    if (row.parent) {
      if (
        disposition !== "item" ||
        !["item", "parent"].includes(row.parent.disposition) ||
        row.parent === row ||
        row.parent.parent
      )
        fail(
          row,
          "parent",
          "Parent must be an independent item or family header",
        );
      if (
        row.adapter !== row.parent.adapter ||
        row.source.table !== row.parent.source.table ||
        !["armor", "weapon"].includes(row.adapter)
      )
        fail(row, "parent", "Unsupported parent/table association");
      if (
        row.adapter === "armor"
          ? row.section !== row.parent.label
          : row.section !== row.parent.section
      )
        fail(
          row,
          "parent",
          "Parent and child sections do not match their family",
        );
    }
  }
}

function inheritedCell(row: SourceRow, field: string): string | undefined {
  return absent(row.cells[field]) && row.parent
    ? row.parent.cells[field]
    : row.cells[field];
}

function validateOutput<T extends Item>(
  schema: z.ZodType<T[]>,
  items: T[],
): T[] {
  const result = schema.safeParse(items);
  if (result.success) return result.data;
  throw new Error(
    result.error.issues
      .map((issue) => {
        const index = issue.path[0];
        const source =
          typeof index === "number" ? items[index]?.sources[0] : undefined;
        const context = source
          ? `${source.file} part ${source.part} row ${source.row}`
          : "Generated catalog";
        return `${context} field ${issue.path.slice(1).join(".")}: ${issue.message}`;
      })
      .join("\n"),
  );
}
function purchaseValues(row: SourceRow): {
  cost: CatalogAmount;
  mass: CatalogAmount;
  ammoCost: CatalogAmount;
  ammoMass: CatalogAmount;
  patchCost: CatalogAmount;
} {
  const costField =
    row.adapter === "armor"
      ? "COST/PATCH"
      : "COST/RELOAD" in row.cells
        ? "COST/RELOAD"
        : row.adapter === "drug"
          ? "BASE PRICE"
          : row.adapter === "vehicle"
            ? "COST*"
            : row.adapter === "fuel"
              ? "COST PER KG"
              : "COST";
  let [cost, reloadCost] = costField.includes("/")
    ? pair(row, costField)
    : [row.cells[costField] ?? null, null];
  let [mass, reloadMass] =
    "MASS/RELOAD" in row.cells
      ? pair(row, "MASS/RELOAD")
      : [row.cells.MASS ?? null, null];
  if (row.parent && row.adapter === "weapon") {
    const [parentCost, parentReloadCost] = pair(row.parent, "COST/RELOAD");
    if (absent(cost)) cost = parentCost;
    // Only the energy-mode family inherits mass and each absent reload half.
    if (row.source.table === "ENERGY WEAPONS") {
      const [parentMass, parentReloadMass] = pair(row.parent, "MASS/RELOAD");
      if (absent(mass)) mass = parentMass;
      if (absent(reloadCost)) reloadCost = parentReloadCost;
      if (absent(reloadMass)) reloadMass = parentReloadMass;
    }
  }
  return {
    cost: amount(cost),
    mass: row.adapter === "fuel" ? amount("1 KG", true) : amount(mass, true),
    ammoCost: amount(row.adapter === "armor" ? null : reloadCost),
    ammoMass: amount(reloadMass, true),
    patchCost: amount(row.adapter === "armor" ? reloadCost : null),
  };
}

/** Pure conversion: all source rows are validated and explicitly accounted for. */
export function buildEquipmentCatalog(
  tables: RulebookEquipmentTable[],
  mappingInput: EquipmentMapping,
  skillNames: readonly string[],
): EquipmentCatalogBuild {
  const mapping = parseWithContext(
    equipmentMappingSchema,
    mappingInput,
    "equipment-mapping.json",
  );
  const rows = collectRows(tables, mapping);
  applyOverrides(rows, mapping);
  const knownSkills = new Set(skillNames);
  const equipment: EquipmentItem[] = [];
  const weapons: WeaponItem[] = [];
  const emitted = new Map<SourceRow, Item>();
  const ids = new Map<string, SourceRow>();
  for (const row of rows) {
    // Validate designated pair fields even in structural/reference rows.
    for (const field of ["COST/RELOAD", "MASS/RELOAD", "COST/PATCH"])
      if (field in row.cells) pair(row, field);
    if (row.disposition !== "item") continue;
    const output =
      row.override?.output ??
      (weaponAdapters[row.adapter] ? "weapons" : "equipment");
    const kind = row.override?.kind ?? defaultKinds[row.adapter];
    const effectiveLabel =
      row.parent && row.adapter === "weapon"
        ? `${row.parent.label} ${row.label.startsWith("(") ? row.label : `(${row.label})`}`
        : row.label;
    const id =
      row.override?.id ??
      slug(
        [row.source.table, row.section, effectiveLabel]
          .filter((value) => value !== null)
          .join(" "),
      );
    if (ids.has(id))
      fail(
        row,
        "id",
        `Identity collision ${id} with ${ids.get(id)!.source.file} row ${ids.get(id)!.source.row}`,
      );
    ids.set(id, row);
    const name =
      row.override?.name ??
      (row.section && !row.section.startsWith("SKILL:")
        ? `${row.section} / ${effectiveLabel}`
        : effectiveLabel);
    const { cost, mass, ammoCost, ammoMass, patchCost } = purchaseValues(row);
    const sources: Item["sources"] = [{ ...row.source, role: "item" }];
    if (row.parent) sources.push({ ...row.parent.source, role: "parent" });
    const aliases = [
      ...new Map(
        (row.override?.aliases ?? []).map((alias) => [
          alias.trim().toLowerCase(),
          alias,
        ]),
      ).values(),
    ];
    const base = {
      id,
      name,
      category: row.source.table,
      section: row.section,
      aliases,
      sources,
      raw: row.raw,
      notes: notesFor(row),
      equipmentRatings: resolvedText(
        inheritedCell(
          row,
          row.adapter === "drug" ? "EQUIP. RATINGS" : "EQUIPMENT RATINGS",
        ),
      ),
      affiliation: resolvedText(inheritedCell(row, "AFF")),
      cost,
      mass,
    };
    let item: Item;
    if (output === "weapons") {
      if (
        !["weapon", "ammunition", "powerPack", "modifier"].includes(kind ?? "")
      )
        fail(row, "kind", `Invalid weapons kind ${kind}`);
      const powerPack = kind === "powerPack";
      const shots = powerPack
        ? (row.cells["POWER CAPACITY"] ?? null)
        : (row.cells.SHOTS ?? null);
      item = {
        ...base,
        kind: kind as WeaponItem["kind"],
        ...weaponSkill(row, knownSkills),
        family: row.parent?.label ?? null,
        damage: row.cells["AP/BD"] ?? null,
        range: row.cells.RANGE ?? null,
        rangeMeters: rangeMeters(row.cells.RANGE ?? null),
        shots,
        ...shotValues(shots, powerPack),
        ammoCost,
        ammoMass,
      };
      weapons.push(item);
    } else {
      if (
        ![
          "gear",
          "armor",
          "implant",
          "drug",
          "vehicle",
          "fuel",
          "modifier",
        ].includes(kind ?? "")
      )
        fail(row, "kind", `Invalid equipment kind ${kind}`);
      const bar = inheritedCell(row, "BAR (M/B/E/X)") ?? "";
      const coverage = row.cells.COVERAGE ?? "";
      item = {
        ...base,
        kind: kind as EquipmentItem["kind"],
        purchaseUnit: row.adapter === "fuel" ? "kg" : "item",
        armor:
          row.adapter === "armor"
            ? {
                coverage,
                locations: armorLocations(coverage),
                bar,
                ratings: armorRatings(bar),
                patchCost,
              }
            : null,
      };
      equipment.push(item);
    }
    emitted.set(row, item);
  }
  const weaponNames = new Map<string, WeaponItem[]>();
  for (const weapon of weapons) {
    const key = weapon.name.trim().toLowerCase();
    const matches = weaponNames.get(key) ?? [];
    matches.push(weapon);
    weaponNames.set(key, matches);
  }
  for (const matches of weaponNames.values()) {
    if (
      matches.length > 1 &&
      new Set(matches.map((weapon) => weapon.skill)).size === matches.length
    ) {
      for (const weapon of matches) weapon.name += ` [${weapon.skill}]`;
    }
  }
  for (const row of rows) {
    if (row.target)
      emitted.get(row.target)!.sources.push({
        ...row.source,
        role: row.disposition as "duplicate" | "crossReference",
      });
  }
  const sourceKey = (source: Source) =>
    JSON.stringify([source.file, source.part, source.row]);
  const usedBy = new Map<string, string[]>();
  for (const item of emitted.values())
    for (const source of item.sources) {
      const key = sourceKey(source);
      const uses = usedBy.get(key) ?? [];
      if (!uses.includes(item.id)) uses.push(item.id);
      usedBy.set(key, uses);
    }
  const coverage = rows.map((row): SourceDisposition => {
    const itemIds = usedBy.get(sourceKey(row.source)) ?? [];
    if (row.disposition !== "reference" && itemIds.length === 0)
      fail(row, "disposition", "Source is not used by any emitted item");
    if (row.disposition === "reference" && itemIds.length !== 0)
      fail(row, "disposition", "Reference row unexpectedly used as an item");
    if (itemIds.some((id) => !ids.has(id)))
      fail(row, "itemIds", "Unknown emitted ID");
    return parseWithContext(
      sourceDispositionSchema,
      { source: row.source, disposition: row.disposition, itemIds },
      row.source.file,
    );
  });
  return {
    equipment: validateOutput(equipmentSchema, equipment),
    weapons: validateOutput(weaponsSchema, weapons),
    coverage,
  };
}

function readJson(path: string): unknown {
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${path}: Invalid source JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Read committed inputs only; never consult the desktop checkout or BTCC_SOURCE_DIR. */
export function parseRulebookEquipment(): {
  equipment: EquipmentItem[];
  weapons: WeaponItem[];
} {
  const mapping = parseWithContext(
    equipmentMappingSchema,
    readJson(join(repoRoot, "docs/rule_book/equipment-mapping.json")),
    "equipment-mapping.json",
  );
  const files = readdirSync(sourceDirectory).filter((file) =>
    file.endsWith(".json"),
  );
  const expected = new Set(mapping.tables.map((table) => table.file));
  for (const file of files)
    if (!expected.has(file))
      throw new Error(`${file}: Undeclared source table`);
  for (const file of expected)
    if (!files.includes(file)) throw new Error(`${file}: Missing source table`);
  const tables = mapping.tables.map(({ file }) => ({
    file,
    data: parseWithContext(
      rulebookTableDataSchema,
      readJson(join(sourceDirectory, file)),
      file,
    ),
  }));
  // Read on every invocation: aggregate ingestion regenerates this file first.
  const skillNames = parseWithContext(
    skillsSchema,
    readJson(join(repoRoot, "data/rules/skills.json")),
    "skills.json",
  ).map((skill) => skill.name);
  const { equipment, weapons, coverage } = buildEquipmentCatalog(
    tables,
    mapping,
    skillNames,
  );
  const outDirectory = join(repoRoot, "data/rules");
  // Both complete catalogs have validated before either artifact is replaced.
  mkdirSync(outDirectory, { recursive: true });
  writeFileSync(
    join(outDirectory, "equipment.json"),
    JSON.stringify(equipment, null, 2) + "\n",
    "utf8",
  );
  writeFileSync(
    join(outDirectory, "weapons.json"),
    JSON.stringify(weapons, null, 2) + "\n",
    "utf8",
  );
  const counts = {
    item: 0,
    parent: 0,
    crossReference: 0,
    duplicate: 0,
    reference: 0,
  };
  for (const row of coverage) counts[row.disposition]++;
  console.log(
    `Source dispositions: ${JSON.stringify(counts)} (${coverage.length} rows)`,
  );
  console.log(
    `Wrote ${equipment.length} equipment and ${weapons.length} weapon records.`,
  );
  return { equipment, weapons };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  parseRulebookEquipment();
}
