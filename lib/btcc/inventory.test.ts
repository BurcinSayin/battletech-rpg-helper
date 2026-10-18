import { describe, expect, it } from "vitest";
import { findEquipment, findWeapon } from "../rules/load";
import type {
  CatalogAmount,
  EquipmentItem,
  WeaponItem,
} from "../validation/catalog";
import {
  createAmmoRow,
  createEquipmentRow,
  createWeaponRow,
  parseEquipmentRow,
  parseWeaponRow,
  type InventoryRowResult,
} from "./inventory";
import { parseBtcc } from "./parse";
import { serializeBtcc } from "./serialize";
import { readFixture } from "./test-fixtures";

function equipment(name: string): EquipmentItem {
  const item = findEquipment(name);
  if (!item) throw new Error(`Missing generated equipment: ${name}`);
  return item;
}

function weapon(name: string): WeaponItem {
  const item = findWeapon(name);
  if (!item) throw new Error(`Missing generated weapon: ${name}`);
  return item;
}

function row(result: InventoryRowResult): string {
  if (!result.ok)
    throw new Error(
      `Creation failed: ${result.code}: ${result.fields.join(", ")}`,
    );
  return result.row;
}

function absolute(value: number): CatalogAmount {
  return { text: String(value), value, multiplier: null };
}

const missing: CatalogAmount = { text: null, value: null, multiplier: null };
const dash: CatalogAmount = { text: "—", value: null, multiplier: null };

describe("lossless inventory views", () => {
  it("preserves all seven equipment fields, whitespace, empty segments, and colons", () => {
    const raw = " Custom: item ;001.50;;TAL;; legacy : note ;02";
    expect(parseEquipmentRow(raw)).toEqual({
      raw,
      name: " Custom: item ",
      costText: "001.50",
      massText: "",
      armorLocation: "TAL",
      bar: "",
      notes: " legacy : note ",
      countText: "02",
    });
    expect(parseEquipmentRow(";;;;;;")).toMatchObject({
      name: "",
      countText: "",
      raw: ";;;;;;",
    });
  });

  it("preserves all eleven weapon fields without interpreting numbers or characters", () => {
    const raw = "Unknown;My: weapon;;1/2/3/4;001;;N PPS;;0;;03";
    expect(parseWeaponRow(raw)).toEqual({
      raw,
      skill: "Unknown",
      name: "My: weapon",
      damage: "",
      range: "1/2/3/4",
      costText: "001",
      massText: "",
      shots: "N PPS",
      ammoCostText: "",
      ammoMassText: "0",
      notes: "",
      countText: "03",
    });
    expect(parseWeaponRow(";;;;;;;;;;")).toMatchObject({
      skill: "",
      name: "",
      countText: "",
    });
  });

  it.each(["", "a;b", "a;b;c;d;e;f;g;h", "a;b;c;d;e;f;g\n", "a;b;c;d;e;f;g\r"])(
    "declines invalid equipment shape without rewriting %j",
    (raw) => {
      expect(parseEquipmentRow(raw)).toBeNull();
    },
  );

  it.each([
    "",
    "a;b",
    "a;b;c;d;e;f;g;h;i;j;k;l",
    "a;b;c;d;e;f;g;h;i;j;k\n",
    "a;b;c;d;e;f;g;h;i;j;k\r",
  ])("declines invalid weapon shape without rewriting %j", (raw) => {
    expect(parseWeaponRow(raw)).toBeNull();
  });

  it("leaves custom, short, empty, and embedded-semicolon rows in the raw persistence path", () => {
    const equip = [
      "Custom short row",
      "Odd;1;2;N;0/0/0/0;embedded;semicolon;1",
      ";;;;;;",
    ];
    const weapons = [
      "Unknown custom weapon",
      "None;Custom;0;0;1;2;0;0;0;embedded;semicolon;1",
      ";;;;;;;;;;",
    ];
    const draft = parseBtcc(
      [
        ...equip.map((value) => `equip:${value}`),
        ...weapons.map((value) => `weapon:${value}`),
      ].join("\n"),
    );
    expect(draft.equip).toEqual(equip);
    expect(draft.weapons).toEqual(weapons);
    const imported = parseBtcc(serializeBtcc(draft));
    expect(imported.equip).toEqual(equip);
    expect(imported.weapons).toEqual(weapons);
    expect(parseEquipmentRow(equip[1])).toBeNull();
    expect(parseWeaponRow(weapons[1])).toBeNull();
  });
});

describe("new equipment stacks", () => {
  it("uses the accessory purchase price and non-armor desktop sentinels", () => {
    const item = equipment("LASER SIGHT");
    expect(item.cost.value).toBe(25);
    const view = parseEquipmentRow(row(createEquipmentRow(item, 2)));
    expect(view).toMatchObject({
      name: item.name,
      costText: "50",
      massText: "0.2",
      armorLocation: "N",
      bar: "0/0/0/0",
      countText: "2",
    });
  });

  it("uses inherited BAR without rewriting the primary row's dash", () => {
    const item = equipment("FLAK ARMOR / JACKET");
    expect(item.raw["BAR (M/B/E/X)"]).toBe("—");
    expect(parseEquipmentRow(row(createEquipmentRow(item, 2)))).toMatchObject({
      costText: "200",
      massText: "7",
      armorLocation: "TA",
      bar: "1/5/1/3",
    });
    expect(item.raw["BAR (M/B/E/X)"]).toBe("—");
  });

  it("requires resolved cost and mass rather than interpreting a multiplier as money", () => {
    const item = equipment("RECOIL COMPENSATION");
    expect(item.cost).toMatchObject({ value: null, multiplier: 1.1 });
    expect(createEquipmentRow(item, 1)).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["cost", "mass"],
    });
    expect(
      parseEquipmentRow(
        row(createEquipmentRow(item, 3, { unitCost: 10, unitMassKg: 0.5 })),
      ),
    ).toMatchObject({ costText: "30", massText: "1.5" });
  });

  it("distinguishes missing, dash, expression, and actual zero purchase amounts", () => {
    const item = equipment("LASER SIGHT");
    for (const cost of [
      missing,
      dash,
      { text: "10–20", value: null, multiplier: null },
      { text: "25*", value: null, multiplier: null },
    ]) {
      expect(createEquipmentRow({ ...item, cost }, 1)).toEqual({
        ok: false,
        code: "unresolved-value",
        fields: ["cost"],
      });
    }
    expect(
      parseEquipmentRow(
        row(
          createEquipmentRow(
            { ...item, cost: absolute(0), mass: absolute(0) },
            1,
          ),
        ),
      ),
    ).toMatchObject({ costText: "0", massText: "0" });
    expect(createEquipmentRow({ ...item, mass: missing }, 1)).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["mass"],
    });
  });

  it("requires a garment selection for concealed armor even after resolving price and mass", () => {
    const item = equipment("CONCEALED ARMOR / CONCEALED FLAK");
    expect(
      createEquipmentRow(item, 1, { unitCost: 100, unitMassKg: 1 }),
    ).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["armorLocation"],
    });
    expect(
      parseEquipmentRow(
        row(
          createEquipmentRow(item, 1, {
            unitCost: 100,
            unitMassKg: 1,
            armorLocation: "TA",
          }),
        ),
      ),
    ).toMatchObject({ armorLocation: "TA", bar: "1/4/1/2" });
  });

  it("keeps conditional coverage unresolved, permits dash sentinels, and orders full coverage", () => {
    const base = equipment("FLAK ARMOR / JACKET");
    if (!base.armor) throw new Error("Expected generated armor");
    const conditional = {
      ...base,
      armor: { ...base.armor, coverage: "TORSO OR LEGS", locations: null },
    };
    expect(createEquipmentRow(conditional, 1)).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["armorLocation"],
    });
    expect(
      parseEquipmentRow(
        row(createEquipmentRow(conditional, 1, { armorLocation: "L" })),
      )?.armorLocation,
    ).toBe("L");
    const noProtection = {
      ...base,
      armor: {
        ...base.armor,
        coverage: "—",
        locations: null,
        bar: "—",
        ratings: null,
      },
    };
    expect(
      parseEquipmentRow(row(createEquipmentRow(noProtection, 1))),
    ).toMatchObject({ armorLocation: "N", bar: "0/0/0/0" });
    const full: EquipmentItem = {
      ...base,
      armor: { ...base.armor, locations: ["F", "HAN", "L", "A", "T", "H"] },
    };
    expect(
      parseEquipmentRow(row(createEquipmentRow(full, 1)))?.armorLocation,
    ).toBe("FUL");
    expect(
      createEquipmentRow(
        { ...base, armor: { ...base.armor, bar: "1/2/3/*", ratings: null } },
        1,
      ),
    ).toEqual({ ok: false, code: "unresolved-value", fields: ["bar"] });
  });

  it.each(["", "TT", "ATH", "HANT", "TORSO", "HTALHANFF"])(
    "rejects noncanonical coverage override %j",
    (armorLocation) => {
      expect(
        createEquipmentRow(equipment("LASER SIGHT"), 1, { armorLocation }),
      ).toMatchObject({
        ok: false,
        code: "invalid-value",
        fields: ["armorLocation"],
      });
    },
  );

  it.each(["H", "T", "A", "L", "HAN", "F", "HTALHANF", "THAN", "FUL", "N"])(
    "accepts canonical nonrepeating coverage %j",
    (armorLocation) => {
      expect(
        parseEquipmentRow(
          row(
            createEquipmentRow(equipment("LASER SIGHT"), 1, { armorLocation }),
          ),
        )?.armorLocation,
      ).toBe(armorLocation);
    },
  );

  it.each(["", "1/2/3", "1/2/3/4/5", "-1/2/3/4", "1.5/2/3/4", "1/2/3/*"])(
    "rejects invalid BAR override %j",
    (bar) => {
      expect(
        createEquipmentRow(equipment("LASER SIGHT"), 1, { bar }),
      ).toMatchObject({ ok: false, code: "invalid-value", fields: ["bar"] });
    },
  );
});

describe("new weapons, power packs, and physical reloads", () => {
  it("multiplies purchase totals only, keeping magazine and reload values per unit", () => {
    const item = weapon("AUTO-PISTOL");
    const raw = row(createWeaponRow(item, 2));
    expect(raw.split(";")).toHaveLength(11);
    expect(parseWeaponRow(raw)).toMatchObject({
      skill: "Small Arms",
      name: "AUTO-PISTOL",
      costText: "100",
      massText: "1",
      shots: "10",
      ammoCostText: "2",
      ammoMassText: "0.14",
      countText: "2",
    });
  });

  it("buys nine Minolta reloads as nine purchase units, not ninety divided rounds", () => {
    const item = weapon("Sniper Rifle(Minolta 9000)");
    expect(parseWeaponRow(row(createAmmoRow(item, 9)))).toMatchObject({
      skill: "None",
      name: `\\_Ammo ${item.name}`,
      damage: "0",
      range: "0",
      costText: "45",
      massText: "1.08",
      shots: "10",
      ammoCostText: "0",
      ammoMassText: "0",
      countText: "9",
    });
  });

  it("keeps Avenger solid-ammo damage and reloads distinct from the ordinary item", () => {
    const ordinary = weapon("AVENGER CCW");
    const solid = weapon("AVENGER CCW (WITH SOLID AMMO)");
    expect(solid.family).toBe(ordinary.name);
    expect(parseWeaponRow(row(createWeaponRow(ordinary, 1)))).toMatchObject({
      damage: "2B/6BS",
      ammoCostText: "4",
    });
    expect(parseWeaponRow(row(createWeaponRow(solid, 1)))).toMatchObject({
      damage: "5B/6B",
      ammoCostText: "16",
    });
    expect(solid.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "parent", table: "FLECHETTE WEAPONS" }),
      ]),
    );
  });

  it("does not invent a power pack for a pure PPS weapon", () => {
    const item = weapon("Pulse Laser Pistol, Clan");
    expect(item).toMatchObject({ capacity: null, powerPerShot: 3 });
    expect(createAmmoRow(item, 1)).toMatchObject({
      ok: false,
      code: "unresolved-value",
      fields: expect.arrayContaining(["shots"]),
    });
    const pack = weapon("Power Pack");
    expect(parseWeaponRow(row(createWeaponRow(pack, 2)))).toMatchObject({
      skill: "None",
      name: pack.name,
      damage: "0",
      range: "0",
      costText: "10",
      massText: "0.5",
      shots: "20 PP",
      ammoCostText: "0",
      ammoMassText: "0",
    });
    expect(createAmmoRow(pack, 1)).toMatchObject({
      ok: false,
      code: "unresolved-value",
      fields: expect.arrayContaining(["kind", "shots"]),
    });
  });

  it("rejects conflicting power-pack overrides but accepts equivalent values and purchase overrides", () => {
    const pack = weapon("Power Pack");
    expect(
      createWeaponRow(pack, 1, {
        damage: "1",
        range: "2",
        shots: "40 PP",
        ammoCost: 2,
        ammoMassKg: 0.14,
      }),
    ).toEqual({
      ok: false,
      code: "invalid-value",
      fields: ["damage", "range", "shots", "ammoCost", "ammoMass"],
    });
    expect(
      parseWeaponRow(
        row(
          createWeaponRow(pack, 1, {
            damage: "0",
            range: "0",
            shots: "20 PP",
            ammoCost: 0,
            ammoMassKg: 0,
            unitCost: 6,
            unitMassKg: 0.3,
          }),
        ),
      ),
    ).toMatchObject({
      costText: "6",
      massText: "0.3",
      shots: "20 PP",
      ammoCostText: "0",
    });
  });

  it("requires overrides for symbolic reload values but maps absent/dash reloads to zero", () => {
    const item = weapon("AUTO-PISTOL");
    const unresolved = {
      ...item,
      ammoCost: { text: "*", value: null, multiplier: null },
      ammoMass: { text: "X3", value: null, multiplier: 3 },
    };
    expect(createWeaponRow(unresolved, 1)).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["ammoCost", "ammoMass"],
    });
    expect(createAmmoRow(unresolved, 1)).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["ammoCost", "ammoMass"],
    });
    expect(
      parseWeaponRow(
        row(createWeaponRow(unresolved, 2, { ammoCost: 3, ammoMassKg: 0.2 })),
      ),
    ).toMatchObject({ ammoCostText: "3", ammoMassText: "0.2" });
    const noReload = {
      ...item,
      ammoCost: missing,
      ammoMass: dash,
      damage: null,
      range: "—",
      shots: null,
    };
    expect(parseWeaponRow(row(createWeaponRow(noReload, 1)))).toMatchObject({
      damage: "0",
      range: "0",
      shots: "0",
      ammoCostText: "0",
      ammoMassText: "0",
    });
    expect(createAmmoRow(noReload, 1)).toMatchObject({
      ok: false,
      code: "unresolved-value",
      fields: ["ammoCost", "ammoMass"],
    });
  });

  it("retains complex nonempty statistics without combat evaluation", () => {
    expect(
      parseWeaponRow(
        row(
          createWeaponRow(weapon("AUTO-PISTOL"), 1, {
            damage: "STR+1/B",
            range: "STR x 2",
            shots: "10, 2 PPS",
          }),
        ),
      ),
    ).toMatchObject({
      damage: "STR+1/B",
      range: "STR x 2",
      shots: "10, 2 PPS",
    });
    for (const field of ["damage", "range", "shots"] as const) {
      expect(
        createWeaponRow(weapon("AUTO-PISTOL"), 1, { [field]: "" }),
      ).toEqual({ ok: false, code: "invalid-value", fields: [field] });
    }
  });
});

describe("desktop monetary and count boundaries", () => {
  it.each([0, -1, 0.5, NaN, Infinity, 2147483648, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid count %s for every creator",
    (count) => {
      const failure = { ok: false, code: "invalid-count", fields: ["count"] };
      expect(createEquipmentRow(equipment("LASER SIGHT"), count)).toEqual(
        failure,
      );
      expect(createWeaponRow(weapon("AUTO-PISTOL"), count)).toEqual(failure);
      expect(createAmmoRow(weapon("AUTO-PISTOL"), count)).toEqual(failure);
    },
  );

  it("preserves fractional catalog prices but requires integer unit prices even for integer stack totals", () => {
    const fuel = equipment("PETROCHEMICAL");
    expect(fuel.cost.value).toBe(1.5);
    expect(fuel.purchaseUnit).toBe("kg");
    expect(createEquipmentRow(fuel, 2)).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["cost"],
    });
    expect(
      parseEquipmentRow(row(createEquipmentRow(fuel, 2, { unitCost: 2 }))),
    ).toMatchObject({ costText: "4", massText: "2", countText: "2" });
    expect(fuel.cost.value).toBe(1.5);
    const item = weapon("AUTO-PISTOL");
    expect(createWeaponRow({ ...item, cost: absolute(1.5) }, 2)).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["cost"],
    });
    expect(createWeaponRow({ ...item, ammoCost: absolute(0.5) }, 2)).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["ammoCost"],
    });
    expect(createAmmoRow({ ...item, ammoCost: absolute(0.5) }, 2)).toEqual({
      ok: false,
      code: "unresolved-value",
      fields: ["ammoCost"],
    });
  });

  it("rejects fractional monetary overrides and signed-32-bit overflow", () => {
    const item = weapon("AUTO-PISTOL");
    expect(createWeaponRow(item, 2, { unitCost: 1.5 })).toEqual({
      ok: false,
      code: "invalid-value",
      fields: ["cost"],
    });
    expect(createWeaponRow(item, 1, { ammoCost: 0.5 })).toEqual({
      ok: false,
      code: "invalid-value",
      fields: ["ammoCost"],
    });
    expect(
      createEquipmentRow(equipment("LASER SIGHT"), 2, { unitCost: 2147483647 }),
    ).toEqual({ ok: false, code: "invalid-value", fields: ["cost"] });
    expect(createWeaponRow(item, 2, { unitCost: 2147483647 })).toEqual({
      ok: false,
      code: "invalid-value",
      fields: ["cost"],
    });
    expect(
      createAmmoRow({ ...item, ammoCost: absolute(2147483647) }, 2),
    ).toEqual({ ok: false, code: "invalid-value", fields: ["ammoCost"] });
    expect(createWeaponRow(item, 1, { ammoCost: 2147483648 })).toEqual({
      ok: false,
      code: "invalid-value",
      fields: ["ammoCost"],
    });
  });

  it("accepts the signed-32-bit limit and rejects nonfinite or negative mass and totals", () => {
    const item = equipment("LASER SIGHT");
    expect(
      parseEquipmentRow(
        row(createEquipmentRow(item, 1, { unitCost: 2147483647 })),
      )?.costText,
    ).toBe("2147483647");
    expect(
      parseEquipmentRow(
        row(
          createEquipmentRow(item, 2147483647, { unitCost: 0, unitMassKg: 0 }),
        ),
      )?.countText,
    ).toBe("2147483647");
    for (const unitMassKg of [-1, NaN, Infinity]) {
      expect(createEquipmentRow(item, 1, { unitMassKg })).toEqual({
        ok: false,
        code: "invalid-value",
        fields: ["mass"],
      });
    }
    expect(
      createEquipmentRow(item, 2, { unitMassKg: Number.MAX_VALUE }),
    ).toEqual({ ok: false, code: "invalid-value", fields: ["mass"] });
    expect(
      createWeaponRow(weapon("AUTO-PISTOL"), 1, { ammoMassKg: -1 }),
    ).toEqual({ ok: false, code: "invalid-value", fields: ["ammoMass"] });
  });
});

describe("new-note presentation and desktop delimiter safety", () => {
  it("makes Hawk Eagle burst notes safe for the desktop's colon and semicolon dispatch", () => {
    const item = weapon("AUTO-PISTOL (HAWK EAGLE)");
    const originalNotes = JSON.stringify(item.notes);
    const raw = row(createWeaponRow(item, 1));
    expect(`weapon:${raw}`.split(":")).toHaveLength(2);
    expect(raw.split(";")).toHaveLength(11);
    expect(parseWeaponRow(raw)?.notes).toMatch(/BURST,\s*3/i);
    expect(JSON.stringify(item.notes)).toBe(originalNotes);
  });

  it("keeps Gauss table-context power-pack requirements on weapons and physical ammunition", () => {
    const item = weapon("GAUSS PISTOL");
    expect(item).toMatchObject({
      capacity: 4,
      capacityUnit: "rounds",
      powerPerShot: 1,
    });
    for (const raw of [
      row(createWeaponRow(item, 1)),
      row(createAmmoRow(item, 2)),
    ]) {
      expect(parseWeaponRow(raw)?.notes).toMatch(
        /Table context - .*power packs/i,
      );
      expect(parseWeaponRow(raw)?.notes).toContain(
        `p. ${item.sources[0].printedPage}`,
      );
    }
    expect(parseWeaponRow(row(createAmmoRow(item, 2)))).toMatchObject({
      costText: "2",
      massText: "0.02",
      shots: "4, 1PPS",
    });
  });

  it("replaces only presentation notes while preserving pages and ordered contextual notes", () => {
    const item: EquipmentItem = {
      ...equipment("LASER SIGHT"),
      notes: [
        { text: "item effect", scope: "item", section: null },
        { text: "family effect", scope: "family", section: null },
        { text: "row effect", scope: "row", section: null },
        { text: "part: one;\n next", scope: "part", section: null },
        { text: "shared: two", scope: "shared", section: "GROUP" },
        { text: "shared three", scope: "shared", section: null },
      ],
    };
    const notes = parseEquipmentRow(
      row(createEquipmentRow(item, 1, { notes: "custom: note;\r\n text" })),
    )!.notes;
    expect(notes).toContain("custom, note, text");
    expect(notes).not.toMatch(/item effect|family effect|row effect/);
    expect(notes).toContain(`p. ${item.sources[0].printedPage}`);
    expect(notes).toContain("Table context - part, one, next");
    expect(notes).toContain("Shared context (GROUP) - shared, two");
    expect(notes).toContain(`Shared context (${item.category}) - shared three`);
    expect(notes.indexOf("Table context")).toBeLessThan(
      notes.indexOf("Shared context"),
    );
    expect(notes).not.toMatch(/[;:\r\n]/);
    const emptyOverride = parseEquipmentRow(
      row(createEquipmentRow(item, 1, { notes: "" })),
    )!.notes;
    expect(emptyOverride).toContain("Table context");
    expect(emptyOverride).not.toContain("item effect");
    const w = weapon("GAUSS PISTOL");
    expect(
      parseWeaponRow(
        row(createWeaponRow(w, 1, { notes: "custom: safe; note" })),
      )?.notes,
    ).toMatch(/custom, safe, note.*Table context - .*power packs/i);
  });

  it("rejects colon-bearing canonical names rather than inventing a new escape format", () => {
    const alcohol = equipment("ALCOHOL: BEER/WINE");
    expect(
      createEquipmentRow(alcohol, 1, { unitCost: 1, unitMassKg: 1 }),
    ).toEqual({ ok: false, code: "unsafe-field", fields: ["name"] });
    for (const delimiter of [";", ":", "\r", "\n"]) {
      expect(
        createWeaponRow(
          { ...weapon("AUTO-PISTOL"), name: `Custom${delimiter}weapon` },
          1,
        ),
      ).toEqual({ ok: false, code: "unsafe-field", fields: ["name"] });
      expect(
        createAmmoRow(
          { ...weapon("AUTO-PISTOL"), name: `Custom${delimiter}weapon` },
          1,
        ),
      ).toEqual({ ok: false, code: "unsafe-field", fields: ["name"] });
      expect(
        createWeaponRow(weapon("AUTO-PISTOL"), 1, { damage: `1${delimiter}2` }),
      ).toEqual({ ok: false, code: "unsafe-field", fields: ["damage"] });
    }
  });
});

describe("legacy compatibility and persistence", () => {
  it("keeps imported Marian coverage, ammo metadata, and all Power Pack rows byte-identical", () => {
    const original = readFixture("test.btcc");
    const draft = parseBtcc(original);
    const marian = draft.equip
      .map(parseEquipmentRow)
      .find((entry) => entry?.name === "Marian/Suit")!;
    expect(marian.armorLocation).toBe("TAL");
    expect(findEquipment(marian.name)?.raw.ITEM).toBe("JACKET");
    const ammo = draft.weapons
      .map(parseWeaponRow)
      .find((entry) => entry?.name.startsWith("\\_Ammo "))!;
    expect(ammo).toMatchObject({
      costText: "45",
      massText: "1.08",
      shots: "10",
      ammoCostText: "2",
      ammoMassText: "0.14",
      countText: "9",
    });
    const packs = draft.weapons
      .map(parseWeaponRow)
      .filter((entry) => entry?.name === "Power Pack");
    expect(packs).toHaveLength(3);
    const catalogPistol = weapon("Pulse Laser Pistol, Clan");
    expect(catalogPistol.ammoCost).toMatchObject({ text: "†", value: null });
    expect(catalogPistol.ammoMass).toMatchObject({ text: "†", value: null });
    const desktopPistol = draft.weapons
      .map(parseWeaponRow)
      .find((entry) => entry?.name === "Pulse Laser Pistol, Clan")!;
    expect(desktopPistol).toMatchObject({
      ammoCostText: "5",
      ammoMassText: "0.25",
    });
    for (const pack of packs) {
      expect(pack).toMatchObject({
        costText: desktopPistol.ammoCostText,
        massText: desktopPistol.ammoMassText,
        shots: "20 PP",
        ammoCostText: "2",
        ammoMassText: "0.14",
      });
      expect(findWeapon(pack!.name)?.kind).toBe("powerPack");
    }
    expect(serializeBtcc(draft)).toBe(original);
  });

  it("exports and reimports newly created rows in exactly the expected positions", () => {
    const draft = parseBtcc(readFixture("test.btcc"));
    const pistol = row(createWeaponRow(weapon("AUTO-PISTOL"), 2));
    const ammo = row(createAmmoRow(weapon("Sniper Rifle(Minolta 9000)"), 9));
    const sight = row(createEquipmentRow(equipment("LASER SIGHT"), 2));
    draft.weapons.push(pistol, ammo);
    draft.equip.push(sight);
    const imported = parseBtcc(serializeBtcc(draft));
    expect(imported.weapons.slice(-2)).toEqual([pistol, ammo]);
    expect(imported.equip.at(-1)).toBe(sight);
    expect(pistol.split(";").slice(4, 9)).toEqual([
      "100",
      "1",
      "10",
      "2",
      "0.14",
    ]);
    expect(ammo.split(";").slice(4, 9)).toEqual(["45", "1.08", "10", "0", "0"]);
    expect(pistol.split(";")[10]).toBe("2");
    expect(ammo.split(";")[10]).toBe("9");
  });
});
