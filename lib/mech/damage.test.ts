import { describe, expect, it } from "vitest";
import { emptyMech } from "./schema";
import {
  MECH_DAMAGE_LIMITS,
  armorLost,
  coolMechHeat,
  emptyMechDamage,
  fireWeapon,
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
    weapons: [
      { name: "(IS) Heavy Gauss Rifle", location: "RA" },
      { name: "(IS) Heavy Gauss Rifle", location: "RA" },
      { name: "(IS) Machine Gun", location: "LA" },
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
      ...emptyMechDamage(),
      armor: [{ index: 15, lost: 999, extra: true }],
      structure: [{ index: 15, max: 999, lost: 999 }],
      criticals: [{ section: 15, slot: 15 }],
      heat: 999,
      pilotHits: 999,
      firedWeapons: [0, 63],
      extra: true,
    };
    const parsed = mechDamageSchema.parse(d);
    expect(parsed).toEqual({
      armor: [{ index: 15, lost: 999 }],
      structure: d.structure,
      criticals: d.criticals,
      heat: 999,
      pilotHits: 999,
      firedWeapons: [0, 63],
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
  it("accepts every distinct global weapon index without requiring a mech", () => {
    const d = {
      ...emptyMechDamage(),
      firedWeapons: Array.from({ length: 64 }, (_, i) => i),
    };
    expect(mechDamageSchema.parse(d)).toEqual(d);
  });
  it("requires the firing field even on otherwise valid legacy damage", () => {
    expect(
      mechDamageSchema.safeParse({
        armor: [],
        structure: [],
        criticals: [],
        heat: 0,
        pilotHits: 0,
      }).success,
    ).toBe(false);
  });
  it.each(
    [
      undefined,
      null,
      0,
      "0",
      {},
      ["0"],
      [true],
      [null],
      [undefined],
      [NaN],
      [Infinity],
      [-Infinity],
      [-1],
      [0.5],
      [64],
      [Number.MAX_SAFE_INTEGER],
      [0, 0],
      Array.from({ length: 65 }, (_, i) => i),
    ].map((firedWeapons) => ({ firedWeapons })),
  )("rejects malformed firing indices %#", ({ firedWeapons }) => {
    expect(
      mechDamageSchema.safeParse({ ...emptyMechDamage(), firedWeapons }).success,
    ).toBe(false);
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
    firedWeapons: [2, 1, 0, 1, 63, 64, -1, 0.5, NaN, Infinity],
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
      firedWeapons: [0, 1, 2],
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
  it("prunes removed weapon rows and clears locks when no weapons remain", () => {
    const input = freeze({ ...emptyMechDamage(), firedWeapons: [0, 1, 2] });
    const m = mech();
    expect(
      normalizeMechDamage(input, { ...m, weapons: m.weapons.slice(0, 1) }),
    ).toEqual({ ...emptyMechDamage(), firedWeapons: [0] });
    expect(normalizeMechDamage(input, { ...m, weapons: [] })).toEqual(
      emptyMechDamage(),
    );
    expect(input.firedWeapons).toEqual([0, 1, 2]);
  });
  it("canonical operations filter global indices and sort numerically without a mech", () => {
    const input = freeze({
      ...emptyMechDamage(),
      firedWeapons: [63, 10, 2, 0, 10, -1, 64, 0.5, NaN, Infinity],
    });
    const expected = { ...emptyMechDamage(), firedWeapons: [0, 2, 10, 63] };
    expect(setHeat(input, 0)).toEqual(expected);
    expect(sameMechDamage(input, expected)).toBe(true);
    expect(sameMechDamage(expected, emptyMechDamage())).toBe(false);
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
    firedWeapons: [1],
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
  it("all manual damage setters retain firing locks, including reducing heat to zero", () => {
    for (const result of [
      setArmorLost(base, m, 0, 1),
      setStructureMax(base, m, 0, 9),
      setStructureLost(base, m, 0, 2),
      toggleCritical(base, m, 0, 0),
      setHeat(base, 0),
      setPilotHits(base, 0),
    ]) {
      expect(result.firedWeapons).toEqual([1]);
    }
    expect(setHeat(base, 0)).toEqual({ ...base, heat: 0 });
    expect(base.firedWeapons).toEqual([1]);
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
      fireWeapon(emptyMechDamage(), m, 2, 0),
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

describe("weapon firing and cooling", () => {
  const m = freeze(mech());
  const base = freeze({
    ...emptyMechDamage(),
    armor: [{ index: 0, lost: 3 }],
    structure: [{ index: 0, max: 8, lost: 6 }],
    criticals: [{ section: 0, slot: 0 }],
    heat: 5,
    pilotHits: 2,
  });

  it("fires duplicate names independently by row, preserves damage and never mutates inputs", () => {
    const first = freeze(fireWeapon(base, m, 1, 2));
    expect(first).toEqual({ ...base, heat: 7, firedWeapons: [1] });
    expect(fireWeapon(first, m, 1, 2)).toEqual(first);
    const second = fireWeapon(first, m, 0, 2);
    expect(second).toEqual({ ...base, heat: 9, firedWeapons: [0, 1] });
    expect(first).toEqual({ ...base, heat: 7, firedWeapons: [1] });
    expect(base.heat).toBe(5);
    expect(base.firedWeapons).toEqual([]);
    expect(m.weapons).toEqual(mech().weapons);
  });

  it("records zero-heat firing as nonempty mech-specific damage", () => {
    const input = freeze(emptyMechDamage());
    const fired = fireWeapon(input, m, 2, 0);
    expect(fired).toEqual({ ...emptyMechDamage(), firedWeapons: [2] });
    expect(isMechDamageEmpty(fired)).toBe(false);
    expect(hasMechSpecificDamage(fired)).toBe(true);
    expect(sameMechDamage(fired, input)).toBe(false);
    expect(fireWeapon(fired, m, 2, 0)).toEqual(fired);
    expect(input).toEqual(emptyMechDamage());
  });

  it.each([2, Number.MAX_SAFE_INTEGER])(
    "clamps added heat %s at 999 while retaining the firing lock",
    (heat) => {
      const input = freeze({ ...base, heat: 998 });
      expect(fireWeapon(input, m, 0, heat)).toEqual({
        ...input,
        heat: 999,
        firedWeapons: [0],
      });
    },
  );

  it.each([-1, 3, 63, 64, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    "ignores invalid or absent weapon index %s",
    (index) => {
      expect(fireWeapon(base, m, index, 2)).toEqual(base);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "ignores invalid firing heat %s",
    (heat) => {
      expect(fireWeapon(base, m, 0, heat)).toEqual(base);
    },
  );

  it("normalizes first even when a fire request is ignored", () => {
    const input = freeze({
      ...base,
      heat: 1001,
      firedWeapons: [2, 0, 2, 63, -1],
    });
    const expected = { ...base, heat: 999, firedWeapons: [0, 2] };
    expect(fireWeapon(input, m, -1, 2)).toEqual(expected);
    expect(fireWeapon(input, m, 1, -1)).toEqual(expected);
    expect(fireWeapon(input, m, 2, 2)).toEqual(expected);
    expect(fireWeapon(input, m, 1, 0)).toEqual({
      ...expected,
      firedWeapons: [0, 1, 2],
    });
  });

  it("cools positive heat, rearms every row and preserves all other damage", () => {
    const input = freeze({ ...base, heat: 12, firedWeapons: [0, 1, 2] });
    expect(coolMechHeat(input, 10)).toEqual({
      ...base,
      heat: 2,
      firedWeapons: [],
    });
    expect(coolMechHeat(input, Number.MAX_SAFE_INTEGER)).toEqual({
      ...base,
      heat: 0,
      firedWeapons: [],
    });
    expect(input).toEqual({ ...base, heat: 12, firedWeapons: [0, 1, 2] });
    expect(coolMechHeat(base, 10)).toEqual({ ...base, heat: 0 });
  });

  it("valid cooling at zero heat rearms zero-heat weapons", () => {
    const input = freeze(fireWeapon(emptyMechDamage(), m, 2, 0));
    const cooled = coolMechHeat(input, 10);
    expect(cooled).toEqual(emptyMechDamage());
    expect(fireWeapon(cooled, m, 2, 0)).toEqual(input);
    expect(input.firedWeapons).toEqual([2]);
  });

  it.each([null, 0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "invalid sink count %s leaves heat, firing locks and other damage unchanged",
    (sinkCount) => {
      for (const heat of [0, 5]) {
        const input = freeze({ ...base, heat, firedWeapons: [0, 2] });
        expect(coolMechHeat(input, sinkCount)).toEqual(input);
      }
    },
  );

  it("reset clears locks while retaining structure maxima; removing the mech retains only pilot hits", () => {
    const input = freeze({ ...base, firedWeapons: [0, 2] });
    expect(resetMechDamage(input)).toEqual({
      ...emptyMechDamage(),
      structure: [{ index: 0, max: 8, lost: 0 }],
    });
    expect(normalizeMechDamage(input, null)).toEqual({
      ...emptyMechDamage(),
      pilotHits: 2,
    });
    expect(input.firedWeapons).toEqual([0, 2]);
  });
});
