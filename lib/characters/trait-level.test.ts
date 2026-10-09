import { describe, it, expect } from "vitest";
import { traitLevel, traitLevels } from "./trait-level";

describe("traitLevel", () => {
  it.each([
    [
      "Rank",
      [0, 99, 100, 199, 200, 270, 300, 500, 1500, 1600],
      [0, 0, 1, 1, 2, 2, 3, 5, 15, 15],
    ],
    [
      "Compulsion",
      [-99, -100, -125, -199, -200, -600],
      [0, -1, -1, -1, -2, -5],
    ],
    ["Toughness", [-300, 0, 299, 300, 500], [0, 0, 0, 3, 3]],
    ["Glass Jaw", [-299, -300, -500], [0, -3, -3]],
    ["Combat Paralysis", [100, 400], [0, 0]],
    ["Unlucky", [-50, -199, -200, -1100], [0, 0, -2, -10]],
    ["Poor Vision", [-199, -200, -1000], [0, -2, -9]],
    ["Title", [299, 300, 1100], [0, 3, 10]],
    ["Vehicle", [1300], [12]],
    ["Wealth", [-200, 270, 1100], [-1, 2, 10]],
    ["Natural Aptitude", [299, 300, 400, 500, 600], [0, 3, 3, 5, 5]],
    ["Phenotype", [-1000, 0, 1000], [0, 0, 0]],
    ["Compulsion/Paranoid", [-125], [-1]],
    ["Compulsion/Berserker", [-125], [-1]],
    ["Except Attribute", [199, 200], [0, 2]],
    ["Custom Trait", [270, -125, 99, -99], [2, -1, 0, 0]],
  ] as const)("derives legal attained tiers for %s", (name, xp, expected) => {
    const actual = xp.map((value) => traitLevel(name, value));
    expect(actual).toEqual(expected);
    for (const level of actual) expect(Object.is(level, -0)).toBe(false);
  });
});

describe("traitLevels", () => {
  it.each([
    [
      [
        { name: "Toughness", xp: 650 },
        { name: "Glass Jaw", xp: -300 },
      ],
      [3, 0],
    ],
    [
      [
        { name: "Toughness", xp: 300 },
        { name: "Glass Jaw", xp: -650 },
      ],
      [0, -3],
    ],
    [
      [
        { name: "Toughness", xp: 300 },
        { name: "Glass Jaw", xp: -300 },
      ],
      [0, 0],
    ],
    [
      [
        { name: "Toughness", xp: 350 },
        { name: "Glass Jaw", xp: -100 },
      ],
      [0, 0],
    ],
    [
      [
        { name: "Good Vision", xp: 100 },
        { name: "Poor Vision", xp: -350 },
      ],
      [0, -2],
    ],
    [
      [
        { name: "Good Vision", xp: 50 },
        { name: "Good Vision", xp: 100 },
        { name: "Poor Vision", xp: -50 },
      ],
      [1, 0, 0],
    ],
    [
      [
        { name: "Glass Jaw", xp: -300 },
        { name: "Toughness", xp: 650 },
      ],
      [0, 3],
    ],
    [
      [
        { name: "Fit", xp: 200 },
        { name: "Handicap/Allergy", xp: -325 },
      ],
      [0, -1],
    ],
    [
      [
        { name: "Fit", xp: 100 },
        { name: "Handicap/Allergy", xp: -100 },
        { name: "Handicap/Blind", xp: -150 },
      ],
      [0, -1, 0],
    ],
    [
      [
        { name: "Toughness", xp: 299 },
        { name: "Toughness", xp: 299 },
      ],
      [0, 0],
    ],
    [
      [
        { name: "Custom Toughness", xp: 650 },
        { name: "Custom Glass Jaw", xp: -300 },
      ],
      [6, -3],
    ],
    [[], []],
  ])("nets only represented canonical opponents (%j)", (rows, expected) => {
    const original = structuredClone(rows);
    const frozen = Object.freeze(rows.map((row) => Object.freeze(row)));
    expect(traitLevels(frozen)).toEqual(expected);
    expect(frozen).toEqual(original);
  });
});
