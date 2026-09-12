import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/lib/btcc";
import { adultModules } from "@/lib/rules/load";
import {
  resolveAdultModule,
  type AdultContext,
  type AdultChoiceSelection,
} from "./adult";
import { realLifeChoices, applyRealLifeChoices } from "./real-life-choices";
import { computeXp } from "./xp";

function context(aff = "Major Periphery State"): AdultContext {
  const draft = emptyDraft();
  draft.scalars.aff = aff;
  draft.attrs.WIL = 350;
  draft.skills = [{ name: "Science", xp: 25 }];
  draft.traits = [{ name: "Dark Secret", xp: -25 }];
  return {
    draft,
    startingLanguage: "Language/English",
    militaryField: true,
    clanFields: [],
  };
}
function resolve(name: string, ctx = context()) {
  const resolved = resolveAdultModule(
    adultModules.find((entry) => entry.stage === 4 && entry.name === name)!,
    ctx,
  );
  return { module: resolved, choices: realLifeChoices(resolved, ctx) };
}

describe("S4AdvDial choices", () => {
  it("resolves conditional attributes and applies repeated grants to the prefix", () => {
    const ctx = context("Federated Suns");
    const { module, choices } = resolve("Tour Of Duty", ctx);
    const selected = {
      "life-6-0": { kind: "attribute", value: "WIL" },
      "life-6-1": { kind: "attribute", value: "WIL" },
      "life-1-0": { kind: "trait", value: "Equipped" },
      "life-3-0": { kind: "trait", value: "Equipped" },
    } as const;
    expect(choices.find((choice) => choice.id === "life-6-1")?.xp).toBe(50);
    const applied = applyRealLifeChoices(ctx.draft, module, choices, selected);
    expect(applied.attrs.WIL).toBe(450);
    expect(applied.traits).toContainEqual({ name: "Equipped", xp: 150 });
    const replaced = applyRealLifeChoices(ctx.draft, module, choices, {
      "life-6-0": { kind: "attribute", value: "BOD" },
    });
    expect(replaced.attrs.WIL).toBe(350);
    expect(replaced.traits).toEqual(ctx.draft.traits);
    expect(applyRealLifeChoices(ctx.draft, module, choices, {})).toEqual(
      ctx.draft,
    );
  });

  it.each([
    [
      "Fast Learner(+75 XP)&Combat Paralysis(-75 XP)",
      [],
      [
        { name: "Fast Learner", xp: 75 },
        { name: "Combat Paralysis", xp: -75 },
      ],
    ],
    [
      "Natural Aptitude/Any Interest(+75 XP)",
      [],
      [{ name: "Natural Aptitude/Any Interest", xp: 75 }],
    ],
    [
      "Science Skill(+75 XP)&Dark Secret(-75 XP)",
      [{ name: "Science", xp: 100 }],
      [{ name: "Dark Secret", xp: -100 }],
    ],
  ])(
    "expands Scientist option %s with signed grants",
    (value, skills, traits) => {
      const ctx = context("Invading Clan");
      const { module, choices } = resolve("Scientist Caste Service", ctx);
      const result = applyRealLifeChoices(ctx.draft, module, choices, {
        "life-1-0": { kind: "trait", value },
      });
      for (const row of skills) expect(result.skills).toContainEqual(row);
      for (const row of traits) expect(result.traits).toContainEqual(row);
      expect(result.traits.some((row) => row.name === value)).toBe(false);
      expect(applyRealLifeChoices(ctx.draft, module, choices, {})).toEqual(
        ctx.draft,
      );
    },
  );

  it("replaces paired police traits without retaining the prior pair", () => {
    const ctx = context();
    ctx.draft.traits.push({ name: "Handicap", xp: 50 });
    const { module, choices } = resolve("To Serve And Protect", ctx);
    const first = applyRealLifeChoices(ctx.draft, module, choices, {
      "life-2-0": { kind: "trait", value: "Attractive(+50XP)&Handicap(-50XP)" },
    });
    expect(first.traits.some((row) => row.name === "Handicap")).toBe(false);
    const second = applyRealLifeChoices(ctx.draft, module, choices, {
      "life-2-0": { kind: "trait", value: "Fit(+50XP) and Dependent(-50XP)" },
    });
    expect(second.traits).toContainEqual({ name: "Handicap", xp: 50 });
    expect(second.traits).toContainEqual({ name: "Fit", xp: 50 });
    expect(second.traits).toContainEqual({ name: "Dependent", xp: -50 });
    expect(second.traits.some((row) => row.name === "Attractive")).toBe(false);
    expect(computeXp(second).remaining).toBe(computeXp(ctx.draft).remaining);
  });

  it("expands school Any fields, deduplicates repeats, and includes Clan fields", () => {
    const ctx = context("Invading Clan");
    ctx.draft.scalars.basicschool = "Pilot - Aerospace (Civilian)";
    ctx.draft.scalars.advschool = ctx.draft.scalars.basicschool;
    const clanContext = {
      ...ctx,
      clanFields: [{ name: "Clan-only skill", xp: 30 }],
    };
    const { choices } = resolve("Tour Of Duty", clanContext);
    const field = choices.find((choice) => choice.id === "life-7-0")!;
    expect(field.candidates).toContainEqual({
      kind: "skill",
      value: "Clan-only skill",
    });
    expect(
      new Set(field.candidates.map((candidate) => candidate.value)).size,
    ).toBe(field.candidates.length);
    expect(
      choices.filter((choice) => choice.id.startsWith("life-7-")),
    ).toHaveLength(10);
    expect(
      resolve("Civilian Job").choices.some((choice) =>
        choice.id.startsWith("life-7-"),
      ),
    ).toBe(false);
    const fallback = resolve("Comstar/WoB Service", context("ComStar")).choices;
    expect(
      fallback.find((choice) => choice.id === "life-7-0")?.candidates,
    ).toContainEqual({ kind: "skill", value: "Acrobatics" });
  });

  it("keeps literal field names, zero XP, and negative repeated grants", () => {
    const ctx = context("Invading Clan");
    ctx.draft.scalars.basicschool = "Pilot - Aerospace (Civilian)";
    const washout = resolve("Clan Warrior Washout", ctx);
    expect(
      washout.choices.filter((choice) => choice.id.startsWith("life-7-")),
    ).toHaveLength(2);
    expect(washout.choices.find((choice) => choice.id === "life-7-0")?.xp).toBe(
      -30,
    );
    expect(
      resolve("Cloister Training", ctx).choices.find(
        (choice) => choice.id === "life-7-0",
      )?.candidates,
    ).toContainEqual({ kind: "skill", value: "Clan MechWarrior" });
  });

  it("replays every resolved module without mutating the prefix or accumulating grants", () => {
    for (const aff of [
      "Major Periphery State",
      "Federated Suns",
      "ComStar",
      "Word of Blake",
      "Invading Clan",
      "Homeworld Clan",
      "Terran",
    ]) {
      const ctx = context(aff);
      for (const entry of adultModules.filter((entry) => entry.stage === 4)) {
        const resolved = resolveAdultModule(entry, ctx);
        const choices = realLifeChoices(resolved, ctx);
        const selected: AdultChoiceSelection = Object.fromEntries(
          choices.map((choice) => [choice.id, choice.candidates[0]]),
        );
        const before = structuredClone(ctx.draft);
        const first = applyRealLifeChoices(
          ctx.draft,
          resolved,
          choices,
          selected,
        );
        expect(
          applyRealLifeChoices(ctx.draft, resolved, choices, selected),
        ).toEqual(first);
        expect(applyRealLifeChoices(ctx.draft, resolved, choices, {})).toEqual(
          before,
        );
        expect(ctx.draft).toEqual(before);
      }
    }
  });
});
