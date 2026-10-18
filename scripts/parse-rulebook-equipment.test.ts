import { describe, expect, it } from "vitest";
import {
  buildEquipmentCatalog,
  type EquipmentCatalogBuild,
  type EquipmentMapping,
  type RulebookEquipmentTable,
  type SourceSelector,
} from "./parse-rulebook-equipment";

const equipmentColumns = [
  "ITEM",
  "EQUIPMENT RATINGS",
  "COST",
  "AFF",
  "MASS",
  "NOTES",
];
const weaponColumns = [
  "ITEM",
  "EQUIPMENT RATINGS",
  "AP/BD",
  "RANGE",
  "SHOTS",
  "COST/RELOAD",
  "AFF",
  "MASS/RELOAD",
  "NOTES",
];
const armorColumns = [
  "ITEM",
  "EQUIPMENT RATINGS",
  "BAR (M/B/E/X)",
  "COST/PATCH",
  "AFF",
  "MASS",
  "COVERAGE",
  "NOTES",
];
const skillSection = "SKILL: SMALL ARMS (RIFLES)";
const skillNames = [
  "Small Arms",
  "Melee Weapons",
  "Archery",
  "Thrown Weapons",
  "Support Weapons",
  "Artillery",
  "Demolitions",
];
type Adapter = EquipmentMapping["tables"][number]["adapter"];
type Override = EquipmentMapping["overrides"][number];

function table(
  name: string,
  columns: string[],
  rows: Record<string, string>[],
): RulebookEquipmentTable {
  return {
    file: `${name}.json`,
    data: {
      table_name: name,
      source: {
        file: "Book.pdf",
        chapter: "Catalog",
        printed_pages: [10],
        pdf_pages: [12],
      },
      parts: [
        {
          printed_page: 10,
          pdf_page: 12,
          columns: [...columns],
          rows,
          notes: [],
        },
      ],
      row_count: rows.length,
    },
  };
}
function cells(
  columns: string[],
  values: Record<string, string>,
): Record<string, string> {
  return {
    ...Object.fromEntries(columns.map((column) => [column, "—"])),
    ...values,
  };
}
function gear(values: Record<string, string>): Record<string, string> {
  return cells(equipmentColumns, {
    ITEM: "GEAR",
    COST: "50",
    MASS: "500 G",
    ...values,
  });
}
function weapon(values: Record<string, string>): Record<string, string> {
  return cells(weaponColumns, {
    ITEM: "WEAPON",
    "COST/RELOAD": "50/2",
    "MASS/RELOAD": "500 G/140 G",
    "AP/BD": "2B/3B",
    RANGE: "10/20/30/40",
    SHOTS: "10",
    _section: skillSection,
    ...values,
  });
}
function armor(values: Record<string, string>): Record<string, string> {
  return cells(armorColumns, {
    ITEM: "ARMOR",
    "COST/PATCH": "100/10",
    MASS: "1 KG",
    COVERAGE: "TORSO",
    "BAR (M/B/E/X)": "1/2/3/4",
    ...values,
  });
}
function selector(
  tableName: string,
  item: string,
  section: string | null = null,
  occurrence = 0,
): SourceSelector {
  return { table: tableName, item, section, occurrence };
}
function override(
  source: SourceSelector,
  change: Omit<Override, "source" | "reason">,
): Override {
  return { source, reason: "Reviewed fixture mapping", ...change };
}
function mapping(
  tables: RulebookEquipmentTable[],
  adapters: Adapter[],
  overrides: Override[] = [],
): EquipmentMapping {
  return {
    version: 1,
    desktopSource: {
      repository: "https://example.test/desktop",
      revision: null,
      files: {},
    },
    tables: tables.map((input, index) => ({
      file: input.file,
      adapter: adapters[index],
      columns: [
        ...new Map(
          input.data.parts.map((part) => [
            JSON.stringify(part.columns),
            part.columns,
          ]),
        ).values(),
      ],
    })),
    overrides,
  };
}
function build(
  input: RulebookEquipmentTable,
  adapter: Adapter,
  overrides: Override[] = [],
) {
  return buildEquipmentCatalog(
    [input],
    mapping([input], [adapter], overrides),
    skillNames,
  );
}
function expectAccounted(
  tables: RulebookEquipmentTable[],
  result: EquipmentCatalogBuild,
) {
  const key = (source: { file: string; part: number; row: number }) =>
    JSON.stringify([source.file, source.part, source.row]);
  const expected = tables.flatMap((input) =>
    input.data.parts.flatMap((part, partIndex) =>
      part.rows.map((_, row) =>
        key({
          file: `docs/rule_book/Warriors-Catalog/${input.file}`,
          part: partIndex,
          row,
        }),
      ),
    ),
  );
  expect(result.coverage.map((entry) => key(entry.source)).sort()).toEqual(
    expected.sort(),
  );
  const items = [...result.equipment, ...result.weapons];
  for (const entry of result.coverage) {
    expect(entry.itemIds).toEqual(
      items
        .filter((item) =>
          item.sources.some((source) => key(source) === key(entry.source)),
        )
        .map((item) => item.id),
    );
    expect(entry.itemIds.length === 0).toBe(entry.disposition === "reference");
  }
  for (const item of items) {
    expect(item.sources.some((source) => source.role === "item")).toBe(true);
    for (const source of item.sources) expect(expected).toContain(key(source));
  }
}

describe("equipment hybrid scalar projections", () => {
  it("normalizes only whole absolute amounts, keeping original cells and zero distinct from missing", () => {
    const input = table("GEAR", equipmentColumns, [
      gear({ ITEM: "GRAMS", COST: "1,250.5", MASS: "500 G" }),
      gear({ ITEM: "KILOGRAMS", COST: "0", MASS: "0KG" }),
      gear({ ITEM: "MISSING", COST: "", MASS: "—" }),
      gear({ ITEM: "MULTIPLIERS", COST: "X3", MASS: "X0.75" }),
    ]);
    const before = structuredClone(input);
    const result = build(input, "equipment");
    expect(
      result.equipment.map((item) => [item.cost.value, item.mass.value]),
    ).toEqual([
      [1250.5, 0.5],
      [0, 0],
      [null, null],
      [null, null],
    ]);
    expect(result.equipment[2].cost.text).toBeNull();
    expect(result.equipment[2].mass.text).toBe("—");
    expect(result.equipment[3].cost).toEqual({
      text: "X3",
      value: null,
      multiplier: 3,
    });
    expect(result.equipment[3].mass.multiplier).toBe(0.75);
    expect(result.equipment[0].raw).toEqual(input.data.parts[0].rows[0]);
    expect(input).toEqual(before);
    expectAccounted([input], result);
  });

  it.each(["+5", "1–5", "50*", "50†", "1,23", "3 C-BILLS", "-1", "3e2"])(
    "preserves conditional cost %s without a numeric projection",
    (cost) => {
      expect(
        build(
          table("GEAR", equipmentColumns, [gear({ COST: cost })]),
          "equipment",
        ).equipment[0].cost,
      ).toEqual({ text: cost, value: null, multiplier: null });
    },
  );

  it.each(["1", "1 KG*", "1–2 KG", "-5 G"])(
    "does not invent an absolute mass for %s",
    (mass) => {
      expect(
        build(
          table("GEAR", equipmentColumns, [gear({ MASS: mass })]),
          "equipment",
        ).equipment[0].mass.value,
      ).toBeNull();
    },
  );

  it("splits designated pairs but never damage, names, ratings, or ranges", () => {
    const input = table("WEAPONS", weaponColumns, [
      weapon({
        ITEM: "KNIFE/DAGGER",
        "EQUIPMENT RATINGS": "C/A-B-C/D",
        "COST/RELOAD": "1,000/12",
        "MASS/RELOAD": "1.5KG/250 G",
        RANGE: "1,000/2,000/3,000/4,000",
        SHOTS: "20, 2 PPS",
      }),
    ]);
    const item = build(input, "weapon").weapons[0];
    expect([
      item.cost.value,
      item.ammoCost.value,
      item.mass.value,
      item.ammoMass.value,
    ]).toEqual([1000, 12, 1.5, 0.25]);
    expect([item.name, item.damage, item.equipmentRatings]).toEqual([
      "KNIFE/DAGGER",
      "2B/3B",
      "C/A-B-C/D",
    ]);
    expect(item.rangeMeters).toEqual([1000, 2000, 3000, 4000]);
    expect(item.raw["MASS/RELOAD"]).toBe("1.5KG/250 G");
    expect([item.capacity, item.capacityUnit, item.powerPerShot]).toEqual([
      20,
      "rounds",
      2,
    ]);
    expect([item.skill, item.specialty]).toEqual(["Small Arms", "RIFLES"]);
  });

  it.each(["COST/RELOAD", "MASS/RELOAD"])(
    "rejects multiple separators in %s with source context",
    (field) => {
      expect(() =>
        build(
          table("WEAPONS", weaponColumns, [weapon({ [field]: "1/2/3" })]),
          "weapon",
        ),
      ).toThrow(new RegExp(`WEAPONS.json part 0 row 0 field ${field}:`));
    },
  );

  it.each([
    ["12", 12, "rounds", null],
    ["1,000", 1000, "rounds", null],
    ["8 PPS", null, null, 8],
    ["1,000 PPS", null, null, 1000],
    ["1,000, 2 PPS", 1000, "rounds", 2],
    ["10,2 PPS", 10, "rounds", 2],
    ["4, 1PPS", 4, "rounds", 1],
    ["3PPS", null, null, 3],
    ["10*", null, null, null],
    ["—", null, null, null],
  ])(
    "projects shots %s without confusing PPS and capacity",
    (shots, capacity, capacityUnit, powerPerShot) => {
      const item = build(
        table("WEAPONS", weaponColumns, [weapon({ SHOTS: shots as string })]),
        "weapon",
      ).weapons[0];
      expect([item.capacity, item.capacityUnit, item.powerPerShot]).toEqual([
        capacity,
        capacityUnit,
        powerPerShot,
      ]);
      expect(item.shots).toBe(shots);
    },
  );

  it.each([
    ["30 M", [30]],
    ["3.5", [3.5]],
    ["20/10/30/40", [20, 10, 30, 40]],
    ["STR X 1/2/3/4", null],
    ["10/20/30/40*", null],
    ["—", null],
  ])("preserves the printed range %s", (range, expected) => {
    const item = build(
      table("WEAPONS", weaponColumns, [weapon({ RANGE: range as string })]),
      "weapon",
    ).weapons[0];
    expect(item.range).toBe(range);
    expect(item.rangeMeters).toEqual(expected);
  });
});

describe("armor and weapon families", () => {
  it("inherits armor ratings and family notes, never purchase amounts or coverage", () => {
    const input = table("PERSONAL ARMOR", armorColumns, [
      armor({
        ITEM: "FAMILY",
        "EQUIPMENT RATINGS": "C/A-A-A/B",
        "BAR (M/B/E/X)": "1/5/1/3",
        AFF: "FS",
        "COST/PATCH": "999/99",
        MASS: "99 KG",
        COVERAGE: "FULL",
        NOTES: "FAMILY NOTE",
      }),
      armor({
        ITEM: "JACKET",
        _section: "FAMILY",
        "EQUIPMENT RATINGS": "—",
        "BAR (M/B/E/X)": "—",
        AFF: "—",
        "COST/PATCH": "—/10",
        MASS: "—",
        COVERAGE: "ARMS, TORSO",
        row_notes: "ROW NOTE",
      }),
      armor({ ITEM: "CHOICE", _section: "FAMILY", COVERAGE: "TORSO OR LEGS" }),
    ]);
    input.data.parts[0].notes = ["TABLE NOTE"];
    input.data.parts[0].shared_notes = [
      { text: "FIRST FRAGMENT", section: "OTHER SECTION" },
      { text: "SECOND FRAGMENT" },
    ];
    const before = structuredClone(input);
    const parent = selector("PERSONAL ARMOR", "FAMILY");
    const overrides = [
      override(parent, { disposition: "parent" }),
      override(selector("PERSONAL ARMOR", "JACKET", "FAMILY"), { parent }),
      override(selector("PERSONAL ARMOR", "CHOICE", "FAMILY"), { parent }),
    ];
    const result = build(input, "armor", overrides);
    const item = result.equipment[0];
    expect(item.name).toBe("FAMILY / JACKET");
    expect(item.armor).toEqual({
      coverage: "ARMS, TORSO",
      locations: ["T", "A"],
      bar: "1/5/1/3",
      ratings: [1, 5, 1, 3],
      patchCost: { text: "10", value: 10, multiplier: null },
    });
    expect(item.cost.value).toBeNull();
    expect(item.mass.value).toBeNull();
    expect([item.equipmentRatings, item.affiliation]).toEqual([
      "C/A-A-A/B",
      "FS",
    ]);
    expect(item.raw["BAR (M/B/E/X)"]).toBe("—");
    expect(item.raw).not.toHaveProperty("row_notes");
    expect(item.raw).not.toHaveProperty("_section");
    expect(item.notes).toEqual([
      { text: "ROW NOTE", scope: "row", section: "FAMILY" },
      { text: "FAMILY NOTE", scope: "family", section: null },
      { text: "TABLE NOTE", scope: "part", section: null },
      { text: "FIRST FRAGMENT", scope: "shared", section: "OTHER SECTION" },
      { text: "SECOND FRAGMENT", scope: "shared", section: null },
    ]);
    expect(result.equipment[1].armor?.locations).toBeNull();
    expect(result.coverage[0].itemIds).toEqual(
      result.equipment.map((entry) => entry.id),
    );
    expect(input).toEqual(before);
    expectAccounted([input], result);
  });

  it("resolves full coverage but preserves conditional BAR expressions", () => {
    const item = build(
      table("ARMOR", armorColumns, [
        armor({ COVERAGE: "FULL", "BAR (M/B/E/X)": "1/2/3/4*" }),
      ]),
      "armor",
    ).equipment[0];
    expect(item.armor?.locations).toEqual(["H", "T", "A", "L", "HAN", "F"]);
    expect(item.armor?.bar).toBe("1/2/3/4*");
    expect(item.armor?.ratings).toBeNull();
  });

  it("inherits each absent energy-mode pair half independently", () => {
    const input = table("ENERGY WEAPONS", weaponColumns, [
      weapon({
        ITEM: "EBONY ASSAULT RIFLE",
        "COST/RELOAD": "8,500/†",
        "MASS/RELOAD": "10 KG/†",
        "EQUIPMENT RATINGS": "F/X-X-E/F",
        AFF: "MC",
        NOTES: "CHANGE SETTING",
      }),
      weapon({
        ITEM: "(STANDARD MODE)",
        "COST/RELOAD": "—",
        "MASS/RELOAD": "—",
        SHOTS: "8 PPS",
      }),
      weapon({
        ITEM: "(HIGH-POWER MODE)",
        "COST/RELOAD": "—/7",
        "MASS/RELOAD": "—/200 G",
        SHOTS: "12 PPS",
      }),
      weapon({
        ITEM: "(EXTENDED-RANGE MODE)",
        "COST/RELOAD": "9000",
        "MASS/RELOAD": "11 KG",
        SHOTS: "4 PPS",
      }),
    ]);
    const parent = selector(
      "ENERGY WEAPONS",
      "EBONY ASSAULT RIFLE",
      skillSection,
    );
    const overrides = [
      override(parent, { disposition: "parent" }),
      ...input.data.parts[0].rows.slice(1).map((row) =>
        override(selector("ENERGY WEAPONS", row.ITEM, skillSection), {
          parent,
        }),
      ),
    ];
    const before = structuredClone(input);
    const result = build(input, "weapon", overrides);
    expect(
      result.weapons.map((item) => [
        item.cost.value,
        item.mass.value,
        item.ammoCost.text,
        item.ammoMass.text,
      ]),
    ).toEqual([
      [8500, 10, "†", "†"],
      [8500, 10, "7", "200 G"],
      [9000, 11, "†", "†"],
    ]);
    expect(result.weapons[0].name).toBe("EBONY ASSAULT RIFLE (STANDARD MODE)");
    expect(result.weapons[0].family).toBe("EBONY ASSAULT RIFLE");
    expect(result.weapons[0].raw["COST/RELOAD"]).toBe("—");
    expect(result.weapons[0].notes).toContainEqual({
      text: "CHANGE SETTING",
      scope: "family",
      section: skillSection,
    });
    expect(input).toEqual(before);
    expectAccounted([input], result);
  });

  it("flattens ballistic modes and attaches a cross-reference to the usable support mode", () => {
    const supportSection = "SKILL: SUPPORT WEAPONS";
    const ballistic = table("BALLISTIC WEAPONS", weaponColumns, [
      weapon({ ITEM: "PARENT", "COST/RELOAD": "1,385/—", "MASS/RELOAD": "—" }),
      weapon({
        ITEM: "(STANDARD MODE)",
        "COST/RELOAD": "—/12",
        "MASS/RELOAD": "6 KG/300 G",
      }),
      weapon({
        ITEM: "(LT. MACHINE GUN MODE)",
        "COST/RELOAD": "—",
        "MASS/RELOAD": "—",
      }),
    ]);
    const support = table("MACHINE GUN SUPPORT WEAPONS", weaponColumns, [
      weapon({
        ITEM: "PARENT",
        _section: supportSection,
        "COST/RELOAD": "1,385/—",
      }),
      weapon({
        ITEM: "(LT. MACHINE GUN MODE)",
        _section: supportSection,
        "COST/RELOAD": "—/60",
        "MASS/RELOAD": "7 KG/1.85 KG",
      }),
    ]);
    const ballisticParent = selector(
      ballistic.data.table_name,
      "PARENT",
      skillSection,
    );
    const supportParent = selector(
      support.data.table_name,
      "PARENT",
      supportSection,
    );
    const target = selector(
      support.data.table_name,
      "(LT. MACHINE GUN MODE)",
      supportSection,
    );
    const tables = [ballistic, support];
    const result = buildEquipmentCatalog(
      tables,
      mapping(
        tables,
        ["weapon", "weapon"],
        [
          override(ballisticParent, { disposition: "parent" }),
          override(supportParent, { disposition: "parent" }),
          override(
            selector(
              ballistic.data.table_name,
              "(STANDARD MODE)",
              skillSection,
            ),
            { parent: ballisticParent },
          ),
          override(target, { parent: supportParent }),
          override(
            selector(
              ballistic.data.table_name,
              "(LT. MACHINE GUN MODE)",
              skillSection,
            ),
            { disposition: "crossReference", target },
          ),
        ],
      ),
      skillNames,
    );
    expect(
      result.weapons.map((item) => [
        item.cost.value,
        item.mass.value,
        item.ammoCost.value,
        item.ammoMass.value,
      ]),
    ).toEqual([
      [1385, 6, 12, 0.3],
      [1385, 7, 60, 1.85],
    ]);
    expect(result.weapons[1].sources.map((source) => source.role)).toEqual([
      "item",
      "parent",
      "crossReference",
    ]);
    expectAccounted(tables, result);
  });

  it("allows an ordinary item to parent a variant without replacing either row's statistics", () => {
    const input = table("FLECHETTE WEAPONS", weaponColumns, [
      weapon({
        ITEM: "AVENGER CCW",
        "AP/BD": "2B/6BS",
        "COST/RELOAD": "345/4",
      }),
      weapon({
        ITEM: "WITH SOLID AMMO",
        "AP/BD": "5B/6B",
        "COST/RELOAD": "345/16",
      }),
    ]);
    const result = build(input, "weapon", [
      override(selector("FLECHETTE WEAPONS", "WITH SOLID AMMO", skillSection), {
        parent: selector("FLECHETTE WEAPONS", "AVENGER CCW", skillSection),
      }),
    ]);
    expect(
      result.weapons.map((item) => [
        item.name,
        item.family,
        item.damage,
        item.ammoCost.value,
      ]),
    ).toEqual([
      ["AVENGER CCW", null, "2B/6BS", 4],
      ["AVENGER CCW (WITH SOLID AMMO)", "AVENGER CCW", "5B/6B", 16],
    ]);
    expect(result.coverage[0].disposition).toBe("item");
    expectAccounted([input], result);
  });
});

describe("explicit adapters and source accounting", () => {
  it("uses adapter-specific price/name columns and never mistakes cargo or fuel for vehicle mass", () => {
    const drugColumns = [
      "SAMPLE DRUG OR POISON",
      "PRIMARY VECTOR",
      "DRUG STRENGTH",
      "POISON AP",
      "DURATION",
      "BASE PRICE",
      "EQUIP. RATINGS",
      "NOTES",
    ];
    const vehicleColumns = [
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
    ];
    const implantColumns = [
      "ITEM",
      "EQUIPMENT RATINGS",
      "COST",
      "AFF",
      "NOTES",
    ];
    const fuelColumns = [
      "FUEL TYPE",
      "EQUIPMENT RATINGS",
      "COST PER KG",
      "NOTES",
    ];
    const tables = [
      table("DRUGS", drugColumns, [
        cells(drugColumns, {
          "SAMPLE DRUG OR POISON": "DRUG",
          "BASE PRICE": "0.5",
          "EQUIP. RATINGS": "A/A-A-A/A",
        }),
      ]),
      table("VEHICLES", vehicleColumns, [
        cells(vehicleColumns, {
          VEHICLE: "CAR",
          "COST*": "50,000",
          "CARGO (KG)": "500",
          "FUEL (KG)/TYPE***": "50/PETROL",
        }),
      ]),
      table("IMPLANTS", implantColumns, [
        cells(implantColumns, { ITEM: "IMPLANT", COST: "100" }),
      ]),
      table("FUELS", fuelColumns, [
        cells(fuelColumns, { "FUEL TYPE": "PETROL", "COST PER KG": "1.5" }),
        cells(fuelColumns, { "FUEL TYPE": "BATTERIES", "COST PER KG": "10" }),
      ]),
    ];
    const result = buildEquipmentCatalog(
      tables,
      mapping(
        tables,
        ["drug", "vehicle", "implant", "fuel"],
        [
          override(selector("FUELS", "BATTERIES"), {
            disposition: "reference",
          }),
        ],
      ),
      skillNames,
    );
    expect(
      result.equipment.map((item) => [
        item.kind,
        item.cost.value,
        item.mass.value,
      ]),
    ).toEqual([
      ["drug", 0.5, null],
      ["vehicle", 50000, null],
      ["implant", 100, null],
      ["fuel", 1.5, 1],
    ]);
    expect(result.equipment[0].equipmentRatings).toBe("A/A-A-A/A");
    expect(result.equipment[1].raw["CARGO (KG)"]).toBe("500");
    expect(result.equipment[3].mass.text).toBe("1 KG");
    expect(result.equipment[3].purchaseUnit).toBe("kg");
    expectAccounted(tables, result);
  });

  it("takes accessory and demolition-kit cost from the purchase half", () => {
    const accessoryColumns = equipmentColumns.map((column) =>
      column === "COST" ? "COST/RELOAD" : column,
    );
    const explosiveColumns = weaponColumns.map((column) =>
      column === "MASS/RELOAD" ? "MASS" : column,
    );
    const tables = [
      table("ACCESSORIES", accessoryColumns, [
        cells(accessoryColumns, {
          ITEM: "LASER SIGHT",
          "COST/RELOAD": "25",
          MASS: "100 G",
        }),
        cells(accessoryColumns, {
          ITEM: "RECOIL COMPENSATION",
          "COST/RELOAD": "X1.1",
          MASS: "X1",
        }),
      ]),
      table("DEMOLITIONS", explosiveColumns, [
        cells(explosiveColumns, {
          ITEM: "DEMOLITION KIT",
          "COST/RELOAD": "200",
          MASS: "2 KG",
          _section: "SKILL: DEMOLITIONS",
        }),
      ]),
    ];
    const result = buildEquipmentCatalog(
      tables,
      mapping(
        tables,
        ["equipment", "explosive"],
        [
          override(selector("ACCESSORIES", "RECOIL COMPENSATION"), {
            kind: "modifier",
          }),
          override(
            selector("DEMOLITIONS", "DEMOLITION KIT", "SKILL: DEMOLITIONS"),
            { output: "equipment", kind: "gear" },
          ),
        ],
      ),
      skillNames,
    );
    expect(result.weapons).toEqual([]);
    expect(
      result.equipment.map((item) => [item.cost.value, item.cost.multiplier]),
    ).toEqual([
      [25, null],
      [null, 1.1],
      [200, null],
    ]);
    expect(result.equipment[2].mass.value).toBe(2);
    expectAccounted(tables, result);
  });

  it("retains ordnance and modifier section identities and power-pack PP capacities", () => {
    const ordnanceColumns = [
      "ITEM",
      "EQUIPMENT RATINGS",
      "AP/BD",
      "COST/RELOAD",
      "AFF",
      "MASS",
      "NOTES",
    ];
    const modifierColumns = [
      "ITEM",
      "EQUIPMENT RATINGS",
      "AP/BD",
      "RANGE",
      "COST/RELOAD",
      "AFF",
      "NOTES",
    ];
    const packColumns = [
      ...equipmentColumns.slice(0, -1),
      "POWER CAPACITY",
      "NOTES",
    ];
    const tables = [
      table("ORDNANCE", ordnanceColumns, [
        cells(ordnanceColumns, {
          ITEM: "SHELL",
          "COST/RELOAD": "20",
          MASS: "100 G",
        }),
      ]),
      table("MODIFIERS", modifierColumns, [
        cells(modifierColumns, {
          ITEM: "EXPLOSIVE",
          _section: "BOW",
          "COST/RELOAD": "X3",
        }),
        cells(modifierColumns, {
          ITEM: "EXPLOSIVE",
          _section: "SLUG-THROWER",
          "COST/RELOAD": "X3",
        }),
      ]),
      table("PACKS", packColumns, [
        cells(packColumns, {
          ITEM: "POWER PACK",
          _section: "STANDARD",
          COST: "5",
          MASS: "250 G",
          "POWER CAPACITY": "20 PP",
        }),
        cells(packColumns, {
          ITEM: "POWER PACK",
          _section: "CLAN",
          COST: "25",
          MASS: "275 G",
          "POWER CAPACITY": "30 PP",
        }),
      ]),
      table(
        "REFERENCE",
        ["ECM Rating", "Effect"],
        [{ "ECM Rating": "1", Effect: "RULE" }],
      ),
    ];
    const result = buildEquipmentCatalog(
      tables,
      mapping(tables, ["ordnance", "ammoModifier", "powerPack", "reference"]),
      skillNames,
    );
    expect(result.weapons.map((item) => item.skill)).toEqual([
      "None",
      "None",
      "None",
      "None",
      "None",
    ]);
    expect(result.weapons.map((item) => item.kind)).toEqual([
      "ammunition",
      "modifier",
      "modifier",
      "powerPack",
      "powerPack",
    ]);
    expect(
      result.weapons
        .slice(1, 3)
        .map((item) => [item.name, item.cost.value, item.cost.multiplier]),
    ).toEqual([
      ["BOW / EXPLOSIVE", null, 3],
      ["SLUG-THROWER / EXPLOSIVE", null, 3],
    ]);
    expect(
      result.weapons.slice(3).map((item) => [item.capacity, item.capacityUnit]),
    ).toEqual([
      [20, "powerPoints"],
      [30, "powerPoints"],
    ]);
    expectAccounted(tables, result);
  });

  it("merges only an explicitly identical duplicate and accounts for both source rows", () => {
    const row = gear({ ITEM: "SNEAK SUIT" });
    const input = table("STEALTH", equipmentColumns, [row, { ...row }]);
    expect(() => build(input, "equipment")).toThrow(/Identity collision/);
    const overrides = [
      override(selector("STEALTH", "SNEAK SUIT", null, 1), {
        disposition: "duplicate",
        target: selector("STEALTH", "SNEAK SUIT"),
      }),
    ];
    const result = build(input, "equipment", overrides);
    expect(result.equipment).toHaveLength(1);
    expect(result.equipment[0].sources.map((source) => source.role)).toEqual([
      "item",
      "duplicate",
    ]);
    expectAccounted([input], result);
    input.data.parts[0].rows[1].row_notes = "Changed metadata";
    expect(() => build(input, "equipment", overrides)).toThrow(
      /identical cells and metadata/,
    );
  });

  it("qualifies same-label weapons by different skill, without adding ambiguous aliases", () => {
    const tables = [
      table("MELEE", weaponColumns, [
        weapon({ ITEM: "HATCHET/TOMAHAWK", _section: "SKILL: MELEE WEAPONS" }),
      ]),
      table("THROWN", weaponColumns, [
        weapon({ ITEM: "HATCHET/TOMAHAWK", _section: "SKILL: THROWN WEAPONS" }),
      ]),
    ];
    const result = buildEquipmentCatalog(
      tables,
      mapping(tables, ["weapon", "weapon"]),
      skillNames,
    );
    expect(result.weapons.map((item) => item.name)).toEqual([
      "HATCHET/TOMAHAWK [Melee Weapons]",
      "HATCHET/TOMAHAWK [Thrown Weapons]",
    ]);
    expect(result.weapons.map((item) => item.aliases)).toEqual([[], []]);
  });

  it("uses the current skill list for each build, including additions and removals", () => {
    const input = table("ARCHERY", weaponColumns, [
      weapon({ ITEM: "BOW", _section: "SKILL: ARCHERY" }),
    ]);
    const manifest = mapping([input], ["weapon"]);
    expect(() => buildEquipmentCatalog([input], manifest, [])).toThrow();
    const restored = buildEquipmentCatalog([input], manifest, ["Archery"]);
    expect(restored.weapons[0]).toMatchObject({
      name: "BOW",
      skill: "Archery",
    });
    expect(() => buildEquipmentCatalog([input], manifest, [])).toThrow();
  });

  it("honors explicit IDs and aliases but rejects cross-item lookup collisions", () => {
    const input = table("GEAR", equipmentColumns, [
      gear({ ITEM: "ONE", _section: "SECTION" }),
      gear({ ITEM: "TWO" }),
    ]);
    const overrides = [
      override(selector("GEAR", "ONE", "SECTION"), {
        id: "chosen-id",
        name: "Chosen Name",
        aliases: ["Legacy", "legacy"],
      }),
    ];
    const result = build(input, "equipment", overrides);
    expect(result.equipment[0]).toMatchObject({
      id: "chosen-id",
      name: "Chosen Name",
    });
    expect(result.equipment[0].aliases).toHaveLength(1);
    expect(result.equipment[1].aliases).toEqual([]);
    overrides.push(override(selector("GEAR", "TWO"), { aliases: ["LEGACY"] }));
    expect(() => build(input, "equipment", overrides)).toThrow(
      /GEAR.json part 0 row 1 field aliases: Ambiguous lookup/,
    );
  });
});

describe("strict source and manifest validation", () => {
  it("rejects missing and undeclared tables, duplicate manifest declarations and stale layouts", () => {
    const input = table("GEAR", equipmentColumns, [gear({})]);
    const valid = mapping([input], ["equipment"]);
    expect(() => buildEquipmentCatalog([], valid, skillNames)).toThrow(
      /Missing manifest source table/,
    );
    expect(() =>
      buildEquipmentCatalog([input], { ...valid, tables: [] }, skillNames),
    ).toThrow(/Undeclared source table/);
    expect(() =>
      buildEquipmentCatalog([input, input], valid, skillNames),
    ).toThrow(/Duplicate input table/);
    expect(() =>
      buildEquipmentCatalog(
        [input],
        {
          ...valid,
          tables: [...valid.tables, ...valid.tables],
        },
        skillNames,
      ),
    ).toThrow(/Duplicate manifest table/);
    const stale = structuredClone(valid);
    stale.tables[0].columns.push(["OBSOLETE"]);
    expect(() => buildEquipmentCatalog([input], stale, skillNames)).toThrow(
      /Stale or duplicate manifest columns layout/,
    );
    stale.tables[0].columns = [["OBSOLETE"]];
    expect(() => buildEquipmentCatalog([input], stale, skillNames)).toThrow(
      /Undeclared columns layout/,
    );
  });

  it("rejects row count discrepancies, wrong page pairs, malformed and undeclared cells", () => {
    const valid = table("GEAR", equipmentColumns, [gear({})]);
    const changedCount = structuredClone(valid);
    changedCount.data.row_count++;
    expect(() => build(changedCount, "equipment")).toThrow(/row_count/);
    const changedPages = structuredClone(valid);
    changedPages.data.source.printed_pages.push(20);
    changedPages.data.source.pdf_pages.push(22);
    changedPages.data.parts[0].pdf_page = 22;
    expect(() => build(changedPages, "equipment")).toThrow(
      /printed\/PDF page pair/,
    );
    const missing = structuredClone(valid);
    delete missing.data.parts[0].rows[0].COST;
    expect(() => build(missing, "equipment")).toThrow(
      /GEAR.json part 0 row 0 field COST: Missing declared cell/,
    );
    const extra = structuredClone(valid);
    extra.data.parts[0].rows[0].UNDECLARED = "x";
    expect(() => build(extra, "equipment")).toThrow(
      /field UNDECLARED: Undeclared cell/,
    );
    const malformed = structuredClone(valid);
    Object.assign(malformed.data.parts[0].rows[0], { COST: 123 });
    expect(() => build(malformed, "equipment")).toThrow(/GEAR.json/);
    const missingColumn = table(
      "GEAR",
      equipmentColumns.filter((column) => column !== "MASS"),
      [gear({})],
    );
    expect(() => build(missingColumn, "equipment")).toThrow(
      /Missing required column MASS/,
    );
  });

  it("rejects unresolved, repeated, unused and invalid overrides", () => {
    const input = table("GEAR", equipmentColumns, [gear({})]);
    const source = selector("GEAR", "GEAR");
    expect(() =>
      build(input, "equipment", [
        override(selector("GEAR", "MISSING"), { aliases: ["Legacy"] }),
      ]),
    ).toThrow(/Unresolved source selector/);
    expect(() =>
      build(input, "equipment", [
        override({ ...source, occurrence: 1 }, { aliases: ["Legacy"] }),
      ]),
    ).toThrow(/Unresolved source selector/);
    expect(() =>
      build(input, "equipment", [
        override(source, { aliases: ["A"] }),
        override(source, { aliases: ["B"] }),
      ]),
    ).toThrow(/Multiple overrides/);
    expect(() => build(input, "equipment", [override(source, {})])).toThrow(
      /Override has no action/,
    );
    expect(() =>
      build(input, "equipment", [override(source, { target: source })]),
    ).toThrow(/Only duplicates and cross-references/);
    expect(() =>
      build(input, "equipment", [
        override(source, { disposition: "duplicate", target: source }),
      ]),
    ).toThrow(/distinct emitted item/);
    expect(() =>
      build(input, "equipment", [override(source, { disposition: "parent" })]),
    ).toThrow(/not used by any emitted item/);
    expect(() =>
      build(input, "equipment", [override(source, { kind: "weapon" })]),
    ).toThrow(/Invalid equipment kind/);
  });

  it("rejects missing and unsupported parent associations and unknown skill sections", () => {
    const input = table("WEAPONS", weaponColumns, [
      weapon({ ITEM: "(STANDARD MODE)" }),
    ]);
    expect(() => build(input, "weapon")).toThrow(/explicit parent mapping/);
    expect(() =>
      build(input, "weapon", [
        override(selector("WEAPONS", "(STANDARD MODE)", skillSection), {
          parent: selector("WEAPONS", "MISSING", skillSection),
        }),
      ]),
    ).toThrow(/Unresolved source selector/);
    const wrongSkill = table("WEAPONS", weaponColumns, [
      weapon({ _section: "SKILL: UNKNOWN" }),
    ]);
    expect(() => build(wrongSkill, "weapon")).toThrow(
      /Unknown weapon skill section/,
    );
    const armorFamily = table("ARMOR", armorColumns, [
      armor({ ITEM: "FAMILY" }),
      armor({ ITEM: "CHILD", _section: "FAMILY" }),
    ]);
    expect(() => build(armorFamily, "armor")).toThrow(
      /explicit parent mapping/,
    );
    const gearInput = table("GEAR", equipmentColumns, [
      gear({ ITEM: "PARENT" }),
      gear({ ITEM: "CHILD" }),
    ]);
    expect(() =>
      build(gearInput, "equipment", [
        override(selector("GEAR", "CHILD"), {
          parent: selector("GEAR", "PARENT"),
        }),
      ]),
    ).toThrow(/Unsupported parent\/table association/);
  });

  it("preserves manifest order, not input file encounter order, with deterministic coverage", () => {
    const first = table("FIRST", equipmentColumns, [
      gear({ ITEM: "FIRST ITEM" }),
    ]);
    const second = table("SECOND", equipmentColumns, [
      gear({ ITEM: "SECOND ITEM" }),
    ]);
    const manifest = mapping([second, first], ["equipment", "equipment"]);
    const a = buildEquipmentCatalog([first, second], manifest, skillNames);
    const b = buildEquipmentCatalog([second, first], manifest, skillNames);
    expect(a).toEqual(b);
    expect(a.equipment.map((item) => item.name)).toEqual([
      "SECOND ITEM",
      "FIRST ITEM",
    ]);
    expectAccounted([first, second], a);
  });
});
