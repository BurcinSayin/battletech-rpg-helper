import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseTraitPointLevels,
  type RulebookTraitInput,
} from "./parse-rulebook-traits";
import generated from "../data/rules/traits.json";
import { traitSchema, traitsSchema } from "../lib/validation/catalog";

describe("parseTraitPointLevels", () => {
  it.each([
    ["+3 TP", [3]],
    ["–1 to –5 TP", [-5, -4, -3, -2, -1]],
    ["−2 TP", [-2]],
    ["–1 to +2 TP", [-1, 0, 1, 2]],
    ["+3 or +5 TP", [3, 5]],
    ["+5 or +3 or +5 TP", [3, 5]],
    ["0 TP", [0]],
  ])("parses %s", (score, levels) => {
    expect(parseTraitPointLevels(score)).toEqual(levels);
  });

  it.each([
    "",
    "3",
    "+3 TP trailing",
    "prefix +3 TP",
    "+3 to +5 or +7 TP",
    "+3.5 TP",
    "+3-+5 TP",
  ])("rejects unsupported score %s", (score) => {
    expect(() => parseTraitPointLevels(score)).toThrow(
      `Unsupported trait TP score: ${score}`,
    );
  });

  it("keeps committed legal tiers in agreement with every canonical source record", () => {
    const source: RulebookTraitInput[] = JSON.parse(
      readFileSync(
        new URL("../docs/rule_book/traits.json", import.meta.url),
        "utf8",
      ),
    );
    const catalog = traitsSchema.parse(generated);
    expect(catalog.map((trait) => trait.name).sort()).toEqual(
      source.map((trait) => trait.name.trim()).sort(),
    );
    for (const trait of source) {
      expect(
        catalog.find((entry) => entry.name === trait.name.trim())?.tp_levels,
      ).toEqual(parseTraitPointLevels(trait.tp_score));
    }
  });

  it.each([undefined, [], [3, 3], [3, 1], [1.5], [NaN]])(
    "rejects invalid catalog tiers %j",
    (tp_levels) => {
      expect(
        traitSchema.safeParse({ ...generated[0], tp_levels }).success,
      ).toBe(false);
    },
  );
});
