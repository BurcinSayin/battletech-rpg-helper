import { describe, expect, it } from "vitest";
import {
  equipment,
  weapons,
  findEquipment,
  findWeapon,
  equipmentById,
  weaponById,
  equipmentByCategory,
  weaponsByCategory,
  weaponsBySkill,
} from "./load";
import {
  equipmentSchema,
  weaponsSchema,
  catalogAmountSchema,
} from "../validation/catalog";

function primary(
  item: (typeof equipment)[number] | (typeof weapons)[number] | undefined,
) {
  expect(item).toBeDefined();
  return item!.sources.find((source) => source.role === "item")!;
}

describe("generated Warrior's Catalog", () => {
  it("validates complete catalogs and rejects ambiguous identities and amounts", () => {
    expect(equipmentSchema.safeParse(equipment).success).toBe(true);
    expect(weaponsSchema.safeParse(weapons).success).toBe(true);
    const first = equipment[0];
    expect(
      equipmentSchema.safeParse([first, { ...first, name: "Other" }]).success,
    ).toBe(false);
    expect(
      equipmentSchema.safeParse([
        first,
        {
          ...first,
          id: "other",
          name: "Other",
          aliases: [first.name.toLowerCase()],
        },
      ]).success,
    ).toBe(false);
    expect(
      catalogAmountSchema.safeParse({ text: "X3", value: 3, multiplier: 3 })
        .success,
    ).toBe(false);
    expect(
      catalogAmountSchema.safeParse({ text: null, value: -1, multiplier: null })
        .success,
    ).toBe(false);
    expect(
      catalogAmountSchema.safeParse({
        text: null,
        value: Infinity,
        multiplier: null,
      }).success,
    ).toBe(false);
  });

  it("projects purchase and reload units without interpreting combat notation", () => {
    const pistol = findWeapon("  Auto-Pistol ")!;
    expect(pistol).toMatchObject({
      skill: "Small Arms",
      damage: "3B/4",
      capacity: 10,
      capacityUnit: "rounds",
      cost: { value: 50 },
      mass: { value: 0.5 },
      ammoCost: { value: 2 },
      ammoMass: { value: 0.14 },
      rangeMeters: [5, 20, 45, 105],
    });
    const flak = findEquipment("FLAK ARMOR / JACKET")!;
    expect(flak.armor?.ratings).toEqual([1, 5, 1, 3]);
    expect(flak.raw["BAR (M/B/E/X)"]).toBe("—");
    expect(findEquipment("LASER SIGHT")?.cost.value).toBe(25);
    expect(findEquipment("RECOIL COMPENSATION")).toMatchObject({
      kind: "modifier",
      cost: { value: null, multiplier: 1.1 },
      mass: { value: null, multiplier: 1.1 },
    });
  });

  it("keeps section-dependent packs and ammunition modifiers distinct", () => {
    const standard = findWeapon("Power Pack")!;
    const clan = findWeapon("CLAN PACKS / POWER PACK")!;
    expect(standard).toMatchObject({
      section: "STANDARD PACKS",
      capacity: 20,
      capacityUnit: "powerPoints",
      cost: { value: 5 },
      mass: { value: 0.25 },
    });
    expect(clan).toMatchObject({ capacity: 30, cost: { value: 25 } });
    expect(clan.id).not.toBe(standard.id);
    const bow = findWeapon("BOW AND ARROW SPECIALTY AMMO / EXPLOSIVE")!;
    const slug = findWeapon("SLUG-THROWER SPECIALTY AMMO / EXPLOSIVE")!;
    expect(bow.id).not.toBe(slug.id);
    for (const item of [bow, slug])
      expect(item.cost).toMatchObject({ value: null, multiplier: 3 });
    expect(findWeapon("EXPLOSIVE")).toBeUndefined();
    expect(findWeapon("HATCHET/TOMAHAWK")).toBeUndefined();
  });

  it("flattens modes without losing the ordinary Avenger or solid-ammo statistics", () => {
    const ordinary = findWeapon("AVENGER CCW")!;
    const solid = findWeapon("AVENGER CCW (WITH SOLID AMMO)")!;
    expect(ordinary).toMatchObject({
      damage: "2B/6BS",
      ammoCost: { value: 4 },
    });
    expect(solid).toMatchObject({
      family: ordinary.name,
      damage: "5B/6B",
      ammoCost: { value: 16 },
    });
    expect(solid.sources.some((s) => s.role === "parent")).toBe(true);
    expect(findWeapon("Ebony Assault Rifle")).toMatchObject({
      name: "EBONY ASSAULT RIFLE (STANDARD MODE)",
      family: "EBONY ASSAULT RIFLE",
    });
    expect(findWeapon("Federated-barret M42B")?.skill).toBe("Small Arms");
    expect(
      findWeapon("Federated-Barret M42B(Lt. Machine Gun Mode)")?.skill,
    ).toBe("Support Weapons");
  });

  it("resolves reviewed legacy aliases to their intended source identities", () => {
    for (const [alias, printed] of [
      ["Marian/Helmet", "HELMET"],
      ["Marian/Suit", "JACKET"],
      ["Marian/Boots", "BOOTS"],
      ["Marian/Gloves", "GLOVES"],
    ]) {
      const item = findEquipment(alias)!;
      expect(item).toMatchObject({
        section: "MARIAN HEGEMONY",
        raw: { ITEM: printed },
      });
      expect(primary(item).table).toBe("STANDARD ARMOR KITS (BY FACTION)");
    }
    expect(findEquipment("Marian/Suit")?.armor?.locations).toEqual(["T", "A"]);
    expect(primary(findWeapon("Sniper Rifle(Minolta 9000)"))).toMatchObject({
      table: "BALLISTIC WEAPONS",
    });
    for (const alias of ["Knife", "Dagger", "Bayonet"])
      expect(findWeapon(alias)?.raw.ITEM).toBe("KNIFE/DAGGER/BAYONET");
    for (const alias of ["Hatchet", "Tomahawk"])
      expect(findWeapon(alias)?.skill).toBe("Melee Weapons");
    for (const alias of ["(R)Hatchet", "(R)Tomahawk"])
      expect(findWeapon(alias)?.skill).toBe("Thrown Weapons");
    for (const alias of ["Vibroblade", "Vibrodagger"])
      expect(findWeapon(alias)?.raw.ITEM).toBe("VIBROBLADE/VIBRODAGGER");
    expect(findWeapon("Pulse Laser Pistol, Clan")?.raw.ITEM).toBe(
      "PULSE LASER PISTOL, CLAN",
    );
    expect(findEquipment("My custom armor")).toBeUndefined();
    expect(findWeapon("")).toBeUndefined();
  });

  it("provides exact IDs/categories and canonical skill filters", () => {
    const pistol = findWeapon("AUTO-PISTOL")!;
    const armor = findEquipment("Marian/Suit")!;
    expect(weaponById(pistol.id)).toBe(pistol);
    expect(equipmentById(armor.id)).toBe(armor);
    expect(weaponById(" " + pistol.id)).toBeUndefined();
    expect(equipmentByCategory(" STANDARD ARMOR KITS (BY FACTION) ")).toContain(
      armor,
    );
    expect(weaponsByCategory("BALLISTIC WEAPONS")).toContain(pistol);
    expect(weaponsBySkill("Small Arms")).toContain(pistol);
    expect(weaponsBySkill("None")).toContain(findWeapon("Power Pack"));
    expect(weaponsBySkill("Unknown skill")).toEqual([]);
    expect(equipmentByCategory("Unknown category")).toEqual([]);
  });
});
