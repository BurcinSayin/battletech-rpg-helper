import { describe, expect, it } from "vitest";
import { parseBtcc } from "@/lib/btcc";
import { readFixture } from "@/lib/btcc/test-fixtures";
import {
  catalogWarnings,
  characterFormSchema,
  draftToForm,
  formToDraft,
} from "./schema";

describe("character form schema", () => {
  const draft = parseBtcc(readFixture("lisa.btcc"));

  it("draftToForm yields parseable values with all 8 attributes", () => {
    const values = draftToForm(draft);
    expect(characterFormSchema.safeParse(values).success).toBe(true);
    expect(Object.keys(values.attributes)).toHaveLength(8);
    expect(values.attributes.STR).toBe(195);
  });

  it("coerces string numbers from form inputs", () => {
    const values = draftToForm(draft);
    const parsed = characterFormSchema.parse({
      ...values,
      attributes: { ...values.attributes, STR: "210" },
      scalars: { ...values.scalars, age: "30" },
    });
    expect(parsed.attributes.STR).toBe(210);
    expect(parsed.scalars.age).toBe(30);
  });

  it("rejects an empty name", () => {
    const values = draftToForm(draft);
    const result = characterFormSchema.safeParse({
      ...values,
      scalars: { ...values.scalars, name: "" },
    });
    expect(result.success).toBe(false);
  });

  it("formToDraft applies edits and preserves untouched sections", () => {
    const values = draftToForm(draft);
    values.scalars.name = "Renamed";
    values.attributes.STR = 200;
    const next = formToDraft(draft, values);
    expect(next.scalars.name).toBe("Renamed");
    expect(next.attrs.STR).toBe(200);
    expect(next.equip).toEqual(draft.equip);
    expect(next.weapons).toEqual(draft.weapons);
    expect(next.preAttrs).toEqual(draft.preAttrs);
  });
});

describe("catalogWarnings", () => {
  const draft = parseBtcc(readFixture("lisa.btcc"));

  it("flags unknown names but never blocks parsing", () => {
    const dirty = {
      ...draft,
      skills: [...draft.skills, { name: "Totally Fake Skill", xp: 10 }],
      traits: [...draft.traits, { name: "Bogus Trait", xp: 5 }],
    };
    const warnings = catalogWarnings(dirty);
    expect(warnings.skills).toContain("Totally Fake Skill");
    expect(warnings.traits).toContain("Bogus Trait");
    expect(characterFormSchema.safeParse(draftToForm(dirty)).success).toBe(true);
  });
});
