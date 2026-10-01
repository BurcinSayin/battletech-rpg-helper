import { describe, expect, it } from "vitest";
import type { BtccRow } from "@/lib/btcc/types";
import { skillLevel } from "./skill-level";

const modes: {
  name: string;
  traits: BtccRow[];
  thresholds: number[];
}[] = [
  {
    name: "no traits",
    traits: [],
    thresholds: [30, 50, 80, 120, 170, 230, 300, 380, 470, 570],
  },
  {
    name: "Fast Learner",
    traits: [{ name: "Fast Learner", xp: 300 }],
    thresholds: [24, 40, 64, 96, 136, 184, 240, 304, 376, 456],
  },
  {
    name: "Slow Learner",
    traits: [{ name: "Slow Learner", xp: -300 }],
    thresholds: [36, 60, 96, 144, 204, 276, 360, 456, 564, 684],
  },
  {
    name: "both qualifying traits",
    traits: [
      { name: "Fast Learner", xp: 300 },
      { name: "Slow Learner", xp: -300 },
    ],
    thresholds: [30, 50, 80, 120, 170, 230, 300, 380, 470, 570],
  },
];

describe("skillLevel", () => {
  for (const { name, traits, thresholds } of modes) {
    describe(name, () => {
      it.each(thresholds.map((threshold, index) => [threshold, index]))(
        "crosses the threshold at %i XP",
        (threshold, index) => {
          expect(skillLevel(threshold - 1, traits)).toBe(index);
          expect(skillLevel(threshold, traits)).toBe(index + 1);
          expect(skillLevel(threshold + 1, traits)).toBe(index + 1);
        },
      );

      it.each([
        [-100, 0],
        [0, 0],
        [10000, 10],
      ])("returns level %i XP -> %i", (xp, expected) => {
        expect(skillLevel(xp, traits)).toBe(expected);
      });
    });
  }

  it.each([
    [299, 0],
    [300, 1],
    [301, 1],
  ])("activates Fast Learner at raw trait XP %i", (xp, expected) => {
    expect(skillLevel(24, [{ name: "Fast Learner", xp }])).toBe(expected);
  });

  it.each([
    [-299, 1],
    [-300, 0],
    [-301, 0],
  ])("activates Slow Learner at raw trait XP %i", (xp, expected) => {
    expect(skillLevel(30, [{ name: "Slow Learner", xp }])).toBe(expected);
  });

  it.each([
    [299, -299, 1],
    [300, -299, 1],
    [299, -300, 0],
    [300, -300, 1],
  ])(
    "combines Fast Learner %i and Slow Learner %i",
    (fastXp, slowXp, expected) => {
      expect(
        skillLevel(30, [
          { name: "Fast Learner", xp: fastXp },
          { name: "Slow Learner", xp: slowXp },
        ]),
      ).toBe(expected);
    },
  );

  it.each(["Fit", "fast learner"])(
    "ignores the nonmatching trait name %s",
    (name) => {
      expect(skillLevel(24, [{ name, xp: 300 }])).toBe(0);
    },
  );

  it.each([
    ["Fast Learner", 150, 24, 0],
    ["Fast Learner", 300, 20, 0],
    ["Slow Learner", -150, 30, 1],
    ["Slow Learner", -300, 36, 1],
  ] as const)(
    "does not sum or stack duplicate %s rows at %i trait XP",
    (name, traitXp, xp, expected) => {
      expect(
        skillLevel(xp, [
          { name, xp: traitXp },
          { name, xp: traitXp },
        ]),
      ).toBe(expected);
    },
  );

  it.each([
    [299, 300],
    [300, 299],
  ])("uses any qualifying row in order %i, %i", (first, second) => {
    expect(
      skillLevel(24, [
        { name: "Fast Learner", xp: first },
        { name: "Fast Learner", xp: second },
      ]),
    ).toBe(1);
  });

  it("leaves frozen traits and their rows unchanged", () => {
    const traits = Object.freeze([
      Object.freeze({ name: "Fast Learner", xp: 300 }),
    ]);
    expect(skillLevel(24, traits)).toBe(1);
    expect(traits).toEqual([{ name: "Fast Learner", xp: 300 }]);
  });

  it("recalculates after a character trait changes", () => {
    const trait = { name: "Fast Learner", xp: 299 };
    const traits = [trait];
    expect(skillLevel(24, traits)).toBe(0);
    trait.xp = 300;
    expect(skillLevel(24, traits)).toBe(1);
  });
});
