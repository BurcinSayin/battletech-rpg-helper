import { describe, expect, it } from "vitest";
import { emptyDraft, parseBtcc, serializeBtcc } from "@/lib/btcc";
import { adultModules, careerFields, stage0Catalog } from "@/lib/rules/load";
import { matchesCondition } from "@/lib/rules/condition";
import {
  availableSchools,
  availableRealLife,
  resolveAdultModule,
  schoolChoices,
  fieldChoices,
  applyAdultModule,
  type AdultContext,
} from "./adult";
import { projectSchool, type SchoolFieldSelection } from "./school";
import { ATTRIBUTE_KEYS, computeXp } from "./xp";
import { characterFormSchema, draftToForm } from "./schema";

function context(aff = "Major Periphery State"): AdultContext {
  const draft = emptyDraft();
  draft.scalars = { ...draft.scalars, aff, age: 16 };
  return {
    draft,
    startingLanguage: "Language/English",
    militaryField: false,
    clanFields: [],
  };
}
function module(name: string) {
  const entry = adultModules.find(
    (entry) => entry.name === name && entry.kind !== "field",
  );
  if (!entry) throw new Error(`Missing fixture ${name}`);
  return entry;
}

describe("adult rules", () => {
  it("preserves the school price range and every selectable career-field occurrence", () => {
    const schools = availableSchools(context());
    expect(schools).toHaveLength(9);
    expect(Math.min(...schools.map((entry) => entry.xpCost!))).toBe(550);
    expect(Math.max(...schools.map((entry) => entry.xpCost!))).toBe(830);
    for (const school of schools)
      for (const group of Object.values(
        resolveAdultModule(school, context()).fields ?? {},
      ))
        for (const name of group?.skills ?? [])
          expect(
            careerFields.fields.some((field) => field.name === name),
            name,
          ).toBe(true);
    expect(
      careerFields.fields
        .find((field) => field.name === "Anthropologist")
        ?.skills.filter((skill) => skill === "Language/Any"),
    ).toHaveLength(2);
  });

  it("normalizes school deferred skills, traits, and attributes", () => {
    const solaris = schoolChoices(module("Solaris Internship"));
    expect(
      solaris.find((choice) => choice.label === "Choose one")?.candidates,
    ).toEqual([
      { kind: "trait", value: "Equipped" },
      { kind: "trait", value: "Vehicle" },
    ]);
    expect(
      solaris.find((choice) => choice.label === "Attribute/Any")?.candidates,
    ).toContainEqual({ kind: "attribute", value: "STR" });
    const trade = schoolChoices(module("Trade School"));
    expect(trade[0].candidates).toContainEqual({
      kind: "skill",
      value: "Language/English",
    });
    expect(trade[0].candidates).not.toContainEqual({
      kind: "skill",
      value: "Language",
    });
  });

  it("charges duplicate field occurrences and max-merges their prerequisites", () => {
    const ctx = context();
    const school = resolveAdultModule(module("University"), ctx);
    const initial = projectSchool(ctx, {
      moduleName: school.name,
      choices: { "school-1-0": schoolChoices(school)[0].candidates[0] },
      fields: [
        { tier: "basic", name: "Cartographer", choices: {} },
        { tier: "advanced", name: "Anthropologist", choices: {} },
      ],
    })!;
    const selected = Object.fromEntries(
      initial.fields[1].choices.map((choice) => [
        choice.id,
        choice.candidates[0],
      ]),
    );
    const result = projectSchool(ctx, {
      moduleName: school.name,
      choices: { "school-1-0": schoolChoices(school)[0].candidates[0] },
      fields: [
        { tier: "basic", name: "Cartographer", choices: {} },
        { tier: "advanced", name: "Anthropologist", choices: selected },
      ],
    })!;
    expect(result.complete).toBe(true);
    expect(result.cost).toBe(710 + 12 * 30);
    expect(result.rebate).toBe(12 * 6);
    expect(
      result.draft.skills.find((row) => row.name === "Language/English")?.xp,
    ).toBe(60);
    expect(result.draft.preAttrs.INT).toBe(400);
    expect(result.draft.scalars.age).toBe(19);
    expect(ctx.draft.skills).toEqual([]);
  });

  it("resolves school conditions against childhood and affiliation", () => {
    const ctx = context();
    expect(resolveAdultModule(module("University"), ctx).attrDeltas.WIL).toBe(
      75,
    );
    ctx.draft.scalars.latechild = "Preparatory School";
    expect(resolveAdultModule(module("University"), ctx).attrDeltas.WIL).toBe(
      75,
    );
    expect(
      resolveAdultModule(module("Trade School"), ctx).fields?.advanced?.skills,
    ).not.toContain("HPG Technician");
    ctx.draft.scalars.aff = "Invading Clan";
    expect(
      resolveAdultModule(module("Trade School"), ctx).fields?.advanced?.skills,
    ).toContain("HPG Technician");
  });

  it.each(["Back Woods", "Preparatory School"])(
    "uses University's final attribute assignments after %s without discarding conditional traits",
    (latechild) => {
      const ctx = context();
      ctx.draft.scalars.latechild = latechild;
      ctx.draft.attrs = Object.fromEntries(
        ATTRIBUTE_KEYS.map((key) => [key, 100]),
      );
      const resolved = resolveAdultModule(module("University"), ctx);
      expect(resolved.attrDeltas).toEqual({
        INT: 150,
        WIL: 75,
        CHA: 25,
        EDG: 25,
      });
      const choices = schoolChoices(resolved);
      const draft = applyAdultModule(
        ctx.draft,
        resolved,
        ctx,
        choices,
        Object.fromEntries(
          choices.map((choice) => [choice.id, choice.candidates[0]]),
        ),
      );
      expect(draft.attrs.WIL).toBe(175);
      expect(draft.attrs.EDG).toBe(125);
      expect(draft.traits).toEqual([
        {
          name: "Connections",
          xp: latechild === "Preparatory School" ? 200 : 400,
        },
        { name: "Equipped", xp: 50 },
        {
          name: "Reputation",
          xp: latechild === "Preparatory School" ? 75 : -25,
        },
        {
          name: "Wealth",
          xp: latechild === "Preparatory School" ? -200 : -300,
        },
      ]);
      expect(computeXp(draft).remaining).toBe(3710);
    },
  );

  it("keeps Military Academy's conditional EDG assignment when no later write replaces it", () => {
    const ctx = context();
    expect(
      resolveAdultModule(module("Military Academy"), ctx).attrDeltas,
    ).toMatchObject({ WIL: 100, EDG: -100 });
    ctx.draft.scalars.latechild = "Military School";
    expect(
      resolveAdultModule(module("Military Academy"), ctx).attrDeltas.EDG,
    ).toBeUndefined();
  });

  it.each(["Family Training", "Military Enlistment", "Police Academy"])(
    "%s field durations preserve integer ages through form validation and .btcc round trips",
    (name) => {
      const ctx = context();
      ctx.draft.scalars.name = "Field duration regression";
      ctx.draft.attrs = Object.fromEntries(
        ATTRIBUTE_KEYS.map((key) => [key, 100]),
      );
      const school = resolveAdultModule(module(name), ctx);
      const choices = Object.fromEntries(
        schoolChoices(school).map((choice) => [
          choice.id,
          choice.candidates[0],
        ]),
      );
      const fields: SchoolFieldSelection[] = [];
      for (const [index, tier] of (["basic", "advanced"] as const).entries()) {
        const field = school.fields![tier]!;
        const fieldName = field.skills[0];
        fields.push({
          tier,
          name: fieldName,
          choices: Object.fromEntries(
            fieldChoices(fieldName, ctx).map((choice) => [
              choice.id,
              choice.candidates[0],
            ]),
          ),
        });
        const result = projectSchool(ctx, {
          moduleName: name,
          choices,
          fields,
        })!;
        expect(result.complete).toBe(true);
        expect(result.fields[index].age).toBe(index);
        // Truncate each C++ int assignment, not the accumulated fractional total:
        // 16 + trunc(0.5) + trunc(1.5) = 17 (Police Academy's advanced tier is 1).
        expect(result.draft.scalars.age).toBe(16 + index);
        expect(
          characterFormSchema.safeParse(draftToForm(result.draft)).success,
        ).toBe(true);
        const serialized = serializeBtcc(result.draft);
        const parsed = parseBtcc(serialized);
        expect(parsed.scalars.age).toBe(result.draft.scalars.age);
        expect(serializeBtcc(parsed)).toBe(serialized);
      }
    },
  );

  it("honors school restrictions without blocking a skip", () => {
    const ctx = context("Federated Suns");
    ctx.draft.scalars.latechild = "Civilian Job";
    expect(availableSchools(ctx)).toEqual([]);
    expect(projectSchool(ctx, null)?.complete).toBe(true);
    ctx.draft.scalars.latechild = "Back Woods";
    ctx.draft.scalars.subaff = "JarnFolk";
    expect(availableSchools(ctx).map((entry) => entry.name)).toEqual([
      "Family Training",
    ]);
  });

  it("gates Real Life from the prefix and resolves conditional Tour of Duty prices", () => {
    const ctx = context();
    expect(availableRealLife(ctx, []).map((entry) => entry.name)).not.toContain(
      "Tour Of Duty",
    );
    expect(
      availableRealLife({ ...ctx, militaryField: true }, []).map(
        (entry) => entry.name,
      ),
    ).toContain("Tour Of Duty");
    expect(resolveAdultModule(module("Tour Of Duty"), ctx).xpCost).toBe(700);
    expect(
      resolveAdultModule(module("Tour Of Duty"), context("Federated Suns"))
        .xpCost,
    ).toBe(800);
    expect(
      resolveAdultModule(module("Tour Of Duty"), context("Invading Clan"))
        .xpCost,
    ).toBe(1000);
    expect(
      availableRealLife(ctx, ["Travel"]).map((entry) => entry.name),
    ).not.toContain("Travel");
    ctx.draft.traits = [{ name: "Transit Disorientation Syndrome", xp: -100 }];
    expect(availableRealLife(ctx, []).map((entry) => entry.name)).not.toContain(
      "Travel",
    );
  });

  it("interprets every catalog branch for every affiliation and caste", () => {
    for (const aff of stage0Catalog.affiliations)
      for (const caste of ["", ...aff.castes]) {
        const ctx = context(aff.name);
        ctx.draft.scalars.clancaste = caste;
        expect(() => availableRealLife(ctx, [])).not.toThrow();
        for (const entry of adultModules)
          expect(
            () => resolveAdultModule(entry, ctx),
            entry.name,
          ).not.toThrow();
      }
  });
});

describe("generated condition interpreter", () => {
  it("preserves operator precedence, negation, and spaces inside names", () => {
    expect(
      matchesCondition('a == "Inner Sphere" || b == true && c != false', {
        a: "Inner Sphere",
        b: false,
        c: false,
      }),
    ).toBe(true);
    expect(
      matchesCondition('!(a == "Inner Sphere") && b == true', {
        a: "Clan",
        b: true,
      }),
    ).toBe(true);
  });
  it("rejects unsupported expressions and unknown variables even on a short-circuited branch", () => {
    expect(() =>
      matchesCondition("a == true || unknown == true", { a: true }),
    ).toThrow();
    expect(() => matchesCondition("a == true; run()", { a: true })).toThrow();
    expect(() => matchesCondition("(a == true", { a: true })).toThrow();
  });
});
