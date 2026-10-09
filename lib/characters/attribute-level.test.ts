import { describe, expect, it } from "vitest";
import { attributeLevel, attributeLinkModifier } from "./attribute-level";

describe("attributeLevel", () => {
  it.each([
    [undefined, null],
    [-1, -1],
    [0, 0],
    [99, 0],
    [100, 1],
    [199, 1],
    [200, 2],
    [299, 2],
    [300, 3],
    [399, 3],
    [400, 4],
    [600, 6],
    [699, 6],
    [700, 7],
    [750, 7],
    [900, 9],
    [999, 9],
    [1000, 10],
    [1099, 10],
    [1100, 11],
    [1199, 11],
    [1200, 12],
    [1500, 15],
  ])("converts %s XP to level %s", (xp, expected) => {
    expect(attributeLevel(xp)).toBe(expected);
  });
});

describe("attributeLinkModifier", () => {
  it.each([
    [null, null],
    [-1, null],
    [0, null],
    [1, -2],
    [2, -1],
    [3, -1],
    [4, 0],
    [6, 0],
    [7, 1],
    [9, 1],
    [10, 2],
    [11, 3],
    [12, 4],
    [15, 5],
  ])("converts level %s to modifier %s", (level, expected) => {
    expect(attributeLinkModifier(level)).toBe(expected);
  });
});
