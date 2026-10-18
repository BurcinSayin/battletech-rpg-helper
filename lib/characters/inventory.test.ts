import { describe, expect, it } from "vitest";
import {
  armorCoverage,
  assignInventoryArmor,
  changeInventoryCount,
  clearInventoryArmor,
  inventoryAmount,
  inventoryRows,
  inventoryTotals,
  readyAllocationWarning,
  readyInventoryWeapon,
  removeInventoryRow,
  resolveInventoryName,
  unreadyInventoryWeapon,
  type Inventory,
  type InventoryChangeResult,
} from "./inventory";
const ammo =
  "None;\\_Ammo Sniper Rifle(Minolta 9000);0;0;45;1.08;10;2;0.14;None;9";
const kit = "Custom kit;20;2;N;0/0/0/0; note : keep ;2";
const gun = "Pistols;Custom pistol;3B/4;5/20/45/105;100;1;10;5;0.1; note ;2";
const empty = (): Inventory => ({
  equip: [],
  weapons: [],
  equipLoc: {},
  chrWeapons: [],
});
function changed(result: InventoryChangeResult): Inventory {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}
describe("lossless inventory", () => {
  it("uses stored stack totals once and changes only amount/count cells", () => {
    const value = { ...empty(), weapons: [ammo], equip: [kit] };
    expect(inventoryTotals(value)).toEqual({
      cost: { known: 65, unknownRows: 0 },
      mass: { known: 3.08, unknownRows: 0 },
    });
    expect(
      changed(changeInventoryCount(value, "weapon", 0, 18)).weapons[0],
    ).toBe(ammo.replace(";45;1.08;", ";90;2.16;").replace(/;9$/, ";18"));
    expect(
      changed(changeInventoryCount(value, "equipment", 0, 3)).equip[0],
    ).toBe("Custom kit;30;3;N;0/0/0/0; note : keep ;3");
    expect(
      changed(changeInventoryCount(value, "equipment", 0, 2)).equip[0],
    ).toBe(kit);
    expect(value.weapons).toEqual([ammo]);
  });
  it("rejects unsupported counts and unrepresentable recalculations without mutation", () => {
    for (const raw of [
      "bad",
      "Kit;?;2;N;0;notes;2",
      "Kit;1;2;N;0;notes;2",
      "Kit;2;2;N;0;notes;1.5",
    ]) {
      const value = { ...empty(), equip: [raw] };
      expect(changeInventoryCount(value, "equipment", 0, 3).ok).toBe(false);
      expect(value.equip).toEqual([raw]);
    }
    for (const count of [0, -1, 1.5, 2147483648, Infinity])
      expect(
        changeInventoryCount(
          { ...empty(), equip: [kit] },
          "equipment",
          0,
          count,
        ).ok,
      ).toBe(false);
  });
  it("tracks unknown cost and mass independently", () => {
    expect(
      inventoryTotals({
        ...empty(),
        equip: ["A;20;?;N;0;;1", "B;0x10;2;N;0;;1", "broken"],
      }),
    ).toEqual({
      cost: { known: 20, unknownRows: 2 },
      mass: { known: 2, unknownRows: 2 },
    });
    expect(inventoryTotals(empty())).toEqual({
      cost: { known: 0, unknownRows: 0 },
      mass: { known: 0, unknownRows: 0 },
    });
  });
  it("accepts only full decimal amounts and rejects invalid indexes", () => {
    for (const text of ["", " ", "-", "2 kg", "0x10", "Infinity", "1e3", "-1"])
      expect(inventoryAmount(text)).toBeNull();
    expect(inventoryAmount(" 2.50 ")).toBe(2.5);
    const value = { ...empty(), equip: [kit], weapons: [gun] };
    for (const index of [-1, 0.5, 8]) {
      expect(changeInventoryCount(value, "equipment", index, 2).ok).toBe(false);
      expect(removeInventoryRow(value, "weapon", index).ok).toBe(false);
      expect(readyInventoryWeapon(value, index).ok).toBe(false);
      expect(unreadyInventoryWeapon(value, index).ok).toBe(false);
      expect(assignInventoryArmor(value, index, ["Head"]).ok).toBe(false);
    }
    expect(clearInventoryArmor(value, "missing").ok).toBe(false);
  });
  it("groups ammunition without losing its weapon-array identity and reports all exact matches", () => {
    const value = {
      ...empty(),
      weapons: [ammo, gun, gun.replace("3B/4", "4B/5"), "bad"],
    };
    expect(
      inventoryRows(value).map((row) => [row.group, row.kind, row.index]),
    ).toEqual([
      ["Other Gear", "weapon", 0],
      ["Weapons", "weapon", 1],
      ["Weapons", "weapon", 2],
      ["Weapons", "weapon", 3],
    ]);
    expect(
      resolveInventoryName(value, "weapon", "Custom pistol").map(
        (entry) => entry.index,
      ),
    ).toEqual([1, 2]);
    expect(resolveInventoryName(value, "weapon", "custom pistol")).toEqual([]);
    expect(readyInventoryWeapon(value, 0).ok).toBe(false);
    expect(
      readyAllocationWarning(
        { ...value, chrWeapons: Array(5).fill("Custom pistol") },
        "Custom pistol",
      ),
    ).not.toBeNull();
    expect(
      readyInventoryWeapon(
        { ...value, chrWeapons: ["other", "other", "other"] },
        1,
      ).ok,
    ).toBe(false);
  });
  it("removes exactly one duplicate and cleans only last exact-name references", () => {
    const value = {
      ...empty(),
      weapons: [gun, gun],
      chrWeapons: ["Custom pistol", "other", "Custom pistol"],
    };
    const one = changed(removeInventoryRow(value, "weapon", 0));
    expect(one.chrWeapons).toEqual(value.chrWeapons);
    expect(changed(removeInventoryRow(one, "weapon", 0)).chrWeapons).toEqual([
      "other",
    ]);
    const armor = {
      ...empty(),
      equip: [kit, kit],
      equipLoc: { Head: "Custom kit", strange: "other" },
    };
    const first = changed(removeInventoryRow(armor, "equipment", 0));
    expect(first.equipLoc).toEqual(armor.equipLoc);
    expect(changed(removeInventoryRow(first, "equipment", 0)).equipLoc).toEqual(
      { strange: "other" },
    );
  });
  it("preserves readiness order, caps only new entries and removes by ready index", () => {
    const value = { ...empty(), weapons: [gun] };
    const one = changed(readyInventoryWeapon(value, 0));
    const two = changed(readyInventoryWeapon(one, 0));
    expect(two.chrWeapons).toEqual(["Custom pistol", "Custom pistol"]);
    expect(readyInventoryWeapon(two, 0).ok).toBe(false);
    expect(changed(unreadyInventoryWeapon(two, 0)).chrWeapons).toEqual([
      "Custom pistol",
    ]);
    const excess = {
      ...two,
      chrWeapons: ["Custom pistol", "other", "Custom pistol", "unknown"],
    };
    expect(readyInventoryWeapon(excess, 0).ok).toBe(false);
    expect(
      changed(changeInventoryCount(excess, "weapon", 0, 1)).chrWeapons,
    ).toEqual(excess.chrWeapons);
    expect(
      readyInventoryWeapon(
        { ...value, weapons: [gun, gun.replace(/;2$/, ";?")] },
        0,
      ).ok,
    ).toBe(false);
  });
  it("decodes desktop coverage and replaces whole displaced garments", () => {
    expect(armorCoverage("HAN")?.slots).toEqual(["Hands"]);
    expect(armorCoverage("TAH")?.slots).toEqual(["Torso", "Arms", "Head"]);
    expect(armorCoverage("FUL")?.slots).toHaveLength(6);
    const value = {
      ...empty(),
      equip: ["Suit;100;3;TOR;1/2/3/4;;1"],
      equipLoc: {
        Full: "Old suit",
        Head: "Old suit",
        Torso: "Jacket",
        Arms: "Jacket",
        odd: "keep",
      },
    };
    expect(assignInventoryArmor(value, 0, ["Torso", "Legs"]).ok).toBe(false);
    const next = changed(assignInventoryArmor(value, 0, ["Torso"]));
    expect(next.equipLoc).toEqual({ Torso: "Suit", odd: "keep" });
    expect(changed(clearInventoryArmor(next, "Torso")).equipLoc).toEqual({
      odd: "keep",
    });
  });
});
