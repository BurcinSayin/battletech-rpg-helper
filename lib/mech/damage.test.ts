import { describe, expect, it } from "vitest";
import { emptyMech } from "./schema";
import {
  MECH_DAMAGE_LIMITS,
  armorLost,
  emptyMechDamage,
  hasMechSpecificDamage,
  isCriticalHit,
  isMechDamageEmpty,
  locationLabels,
  mechDamageSchema,
  normalizeMechDamage,
  resetMechDamage,
  sameMechDamage,
  setArmorLost,
  setHeat,
  setPilotHits,
  setStructureLost,
  setStructureMax,
  structureTrack,
  toggleCritical,
  type MechDamage,
} from "./damage";

function mech() {
  return {
    ...emptyMech(),
    armor: [
      { location: "LA", value: 5 },
      { location: "LA", value: 10 },
      { location: "RTC", value: 0 },
    ],
    criticalSlots: [
      { location: "Left Arm", slots: ["-Empty-", "Laser"] },
      { location: "Left Arm", slots: ["Laser"] },
    ],
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe("mechDamageSchema", () => {
  it("accepts the boundary values, strips unknown keys and is not mech aware", () => {
    const d = {
      armor: [{ index: 15, lost: 999, extra: true }],
      structure: [{ index: 15, max: 999, lost: 999 }],
      criticals: [{ section: 15, slot: 15 }],
      heat: 999,
      pilotHits: 999,
      extra: true,
    };
    const parsed = mechDamageSchema.parse(d);
    expect(parsed).toEqual({
      armor: [{ index: 15, lost: 999 }],
      structure: d.structure,
      criticals: d.criticals,
      heat: 999,
      pilotHits: 999,
    });
    expect(parsed).not.toHaveProperty("extra");
    expect(MECH_DAMAGE_LIMITS).toMatchObject({
      armorEntries: 16,
      structureEntries: 16,
      criticals: 256,
      slotIndexMax: 15,
      serializedBytes: 16384,
    });
  });
  it.each([
    null,
    {},
    "damage",
    { ...emptyMechDamage(), heat: -1 },
    { ...emptyMechDamage(), heat: 1000 },
    { ...emptyMechDamage(), heat: 1.5 },
    { ...emptyMechDamage(), pilotHits: NaN },
    { ...emptyMechDamage(), pilotHits: Infinity },
    { ...emptyMechDamage(), pilotHits: "1" },
    { ...emptyMechDamage(), armor: [{ index: 0, lost: 0 }] },
    { ...emptyMechDamage(), armor: [{ index: 16, lost: 1 }] },
    { ...emptyMechDamage(), armor: [{ index: -1, lost: 1 }] },
    { ...emptyMechDamage(), armor: [{ index: 0.5, lost: 1 }] },
    { ...emptyMechDamage(), armor: [{ index: 0, lost: 1000 }] },
    { ...emptyMechDamage(), structure: [{ index: 0, max: 0, lost: 0 }] },
    { ...emptyMechDamage(), structure: [{ index: 0, max: 1, lost: 2 }] },
    { ...emptyMechDamage(), criticals: [{ section: 0, slot: 16 }] },
    { ...emptyMechDamage(), criticals: [{ section: 16, slot: 0 }] },
  ])("rejects hostile input %#", (d) => {
    expect(mechDamageSchema.safeParse(d).success).toBe(false);
  });
  it("rejects duplicate identities and overlong collections", () => {
    for (const [key, entry, limit] of [
      ["armor", { index: 0, lost: 1 }, 16],
      ["structure", { index: 0, max: 1, lost: 0 }, 16],
      ["criticals", { section: 0, slot: 0 }, 256],
    ] as const) {
      expect(
        mechDamageSchema.safeParse({
          ...emptyMechDamage(),
          [key]: [entry, entry],
        }).success,
      ).toBe(false);
      expect(
        mechDamageSchema.safeParse({
          ...emptyMechDamage(),
          [key]: Array.from({ length: limit + 1 }, () => entry),
        }).success,
      ).toBe(false);
    }
  });
});

describe("normalization", () => {
  const damaged: MechDamage = {
    armor: [
      { index: 1, lost: 1001 },
      { index: 0, lost: 6 },
      { index: 0, lost: 2 },
      { index: 2, lost: 3 },
      { index: 3, lost: 1 },
      { index: -1, lost: 1 },
    ],
    structure: [
      { index: 1, max: 1000, lost: 1000 },
      { index: 0, max: 5, lost: 7 },
      { index: 0, max: 2, lost: 1 },
      { index: 2, max: 1, lost: 0 },
    ],
    criticals: [
      { section: 1, slot: 0 },
      { section: 0, slot: 1 },
      { section: 0, slot: 1 },
      { section: 0, slot: 0 },
      { section: 1, slot: 1 },
      { section: 2, slot: 0 },
    ],
    heat: -3,
    pilotHits: 1002,
  };
  it("repairs, clamps, sorts and deduplicates first-wins without mutation", () => {
    const input = freeze(structuredClone(damaged));
    const expected = {
      armor: [
        { index: 0, lost: 5 },
        { index: 1, lost: 10 },
      ],
      structure: [
        { index: 0, max: 5, lost: 5 },
        { index: 1, max: 999, lost: 999 },
      ],
      criticals: [
        { section: 0, slot: 0 },
        { section: 0, slot: 1 },
        { section: 1, slot: 0 },
      ],
      heat: 0,
      pilotHits: 999,
    };
    const result = normalizeMechDamage(input, freeze(mech()));
    expect(result).toEqual(expected);
    expect(normalizeMechDamage(result, mech())).toEqual(result);
    expect(result).not.toBe(input);
  });
  it("null damage is empty; no mech retains only pilot hits", () => {
    expect(normalizeMechDamage(null, mech())).toEqual(emptyMechDamage());
    expect(normalizeMechDamage(damaged, null)).toEqual({
      ...emptyMechDamage(),
      pilotHits: 999,
    });
  });
  it("repairs fractional and non-finite counters", () => {
    expect(
      normalizeMechDamage(
        { ...emptyMechDamage(), heat: NaN, pilotHits: 2.8 },
        mech(),
      ),
    ).toMatchObject({ heat: 0, pilotHits: 2 });
  });
});

describe("pure damage operations and array identity", () => {
  const base = freeze({
    ...emptyMechDamage(),
    armor: [{ index: 0, lost: 3 }],
    structure: [{ index: 0, max: 8, lost: 6 }],
    criticals: [{ section: 0, slot: 0 }],
    heat: 10,
    pilotHits: 2,
  });
  const m = freeze(mech());
  it("armor setters clamp and keep duplicate locations independent", () => {
    const d = setArmorLost(base, m, 1, 9999);
    expect(armorLost(d, 0)).toBe(3);
    expect(armorLost(d, 1)).toBe(10);
    expect(armorLost(d, 12)).toBe(0);
    expect(setArmorLost(base, m, 0, -1).armor).toEqual([]);
    for (const index of [-1, 3, 0.5, NaN])
      expect(setArmorLost(base, m, index, 1)).toEqual(base);
    expect(base.armor).toEqual([{ index: 0, lost: 3 }]);
  });
  it("structure maxima are manual; lowering clamps lost; null/zero remove", () => {
    expect(structureTrack(setStructureMax(base, m, 0, 4), 0)).toEqual({
      index: 0,
      max: 4,
      lost: 4,
    });
    expect(setStructureMax(base, m, 0, null).structure).toEqual([]);
    expect(setStructureMax(base, m, 0, 0).structure).toEqual([]);
    expect(structureTrack(setStructureMax(base, m, 1, 9999), 1)).toEqual({
      index: 1,
      max: 999,
      lost: 0,
    });
    expect(setStructureMax(base, m, 2, 10)).toEqual(base);
    expect(structureTrack(base, 12)).toBeNull();
    expect(structureTrack(base, 0)).not.toBe(base.structure[0]);
    expect(setStructureLost(base, m, 1, 4)).toEqual(base);
    expect(setStructureLost(base, m, 0, 100).structure[0].lost).toBe(8);
    expect(setStructureLost(base, m, 0, -1).structure[0].lost).toBe(0);
  });
  it.each([
    ["FLL", "FRL", "RLL", "RRL"],
    ["Left Leg", "Right Leg", "Center Leg"],
    ["Unknown", "Unknown"],
  ])(
    "offers structure for each section regardless of configuration: %j",
    (...names) => {
      const sections = names as string[];
      const configured = {
        ...emptyMech(),
        criticalSlots: sections.map((location) => ({ location, slots: [] })),
      };
      let d = emptyMechDamage();
      sections.forEach((_, i) => {
        d = setStructureMax(d, configured, i, 10);
      });
      expect(d.structure.map((s) => s.index)).toEqual(
        sections.map((_, i) => i),
      );
      expect(
        setStructureMax(
          emptyMechDamage(),
          { ...configured, criticalSlots: [] },
          0,
          10,
        ),
      ).toEqual(emptyMechDamage());
    },
  );
  it("toggles any slot including empty; duplicate section names are independent", () => {
    expect(isCriticalHit(base, 0, 0)).toBe(true);
    expect(toggleCritical(base, m, 0, 0).criticals).toEqual([]);
    expect(toggleCritical(base, m, 1, 0).criticals).toEqual([
      { section: 0, slot: 0 },
      { section: 1, slot: 0 },
    ]);
    for (const [section, slot] of [
      [-1, 0],
      [2, 0],
      [1, 1],
      [0, 0.5],
    ])
      expect(toggleCritical(base, m, section, slot)).toEqual(base);
  });
  it("clamps heat/pilot and reset keeps only undamaged structure maxima", () => {
    expect(setHeat(base, 1000).heat).toBe(999);
    expect(setHeat(base, -1).heat).toBe(0);
    expect(setPilotHits(base, 1000).pilotHits).toBe(999);
    expect(setPilotHits(base, -1).pilotHits).toBe(0);
    expect(resetMechDamage(base)).toEqual({
      ...emptyMechDamage(),
      structure: [{ index: 0, max: 8, lost: 0 }],
    });
    expect(base.heat).toBe(10);
    expect(base.structure[0].lost).toBe(6);
  });
  it("compares canonical forms and distinguishes pilot-only from mech-specific damage", () => {
    const d = { ...base, armor: [{ index: 1, lost: 1 }, ...base.armor] };
    expect(sameMechDamage(d, { ...d, armor: [...d.armor].reverse() })).toBe(
      true,
    );
    expect(isMechDamageEmpty(emptyMechDamage())).toBe(true);
    expect(isMechDamageEmpty(setPilotHits(emptyMechDamage(), 1))).toBe(false);
    expect(hasMechSpecificDamage(setPilotHits(emptyMechDamage(), 1))).toBe(
      false,
    );
    for (const d of [
      setArmorLost(emptyMechDamage(), m, 0, 1),
      setStructureMax(emptyMechDamage(), m, 0, 1),
      toggleCritical(emptyMechDamage(), m, 0, 0),
      setHeat(emptyMechDamage(), 1),
    ])
      expect(hasMechSpecificDamage(d)).toBe(true);
  });
  it("numbers only duplicate labels in encounter order", () => {
    expect(
      locationLabels(["LA", "RA", "LA", "LA", "Manual", "Manual"]),
    ).toEqual(["LA #1", "RA", "LA #2", "LA #3", "Manual #1", "Manual #2"]);
    expect(locationLabels([])).toEqual([]);
  });
});
