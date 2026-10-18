import { describe, expect, it } from "vitest";
import { parseBtcc, serializeBtcc } from "@/lib/btcc";
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

  it("edits all inventory fields losslessly while retaining unrelated sections", () => {
    const base = { ...draft, equip: ["unsupported raw : row"] };
    const values = draftToForm(base);
    values.equip.push("Custom;20;2;N;0/0/0/0; note : keep ;2");
    values.weapons = ["unknown weapon"];
    values.equipLoc = { strange: "Custom" };
    values.chrWeapons = ["missing", "missing"];
    const next = formToDraft(base, characterFormSchema.parse(values));
    expect(next.equip).toEqual(values.equip);
    expect(next.weapons).toEqual(values.weapons);
    expect(next.equipLoc).toEqual(values.equipLoc);
    expect(next.chrWeapons).toEqual(values.chrWeapons);
    expect(next.preAttrs).toEqual(base.preAttrs);
    expect(next.preSkills).toEqual(base.preSkills);
    expect(base.equip).toEqual(["unsupported raw : row"]);
    expect(characterFormSchema.safeParse({ ...values, equip: [3] }).success).toBe(false);
    expect(characterFormSchema.safeParse({ ...values, equipLoc: [] }).success).toBe(false);
  });

  it("keeps desktop inventory and loadout bytes through an unrelated name edit", () => {
    const imported = parseBtcc(readFixture("test.btcc"));
    const values = draftToForm(imported);
    values.scalars.name = "Renamed inventory carrier";
    const next = formToDraft(imported, characterFormSchema.parse(values));
    expect(next.equip).toEqual(imported.equip);
    expect(next.weapons).toEqual(imported.weapons);
    expect(next.equipLoc).toEqual(imported.equipLoc);
    expect(next.chrWeapons).toEqual(imported.chrWeapons);
    next.scalars.name = imported.scalars.name;
    expect(serializeBtcc(next)).toBe(serializeBtcc(imported));
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

  it("produces zero trait warnings on legacy fixtures like newchar.btcc", () => {
    const newchar = parseBtcc(readFixture("newchar.btcc"));
    const warnings = catalogWarnings(newchar);
    expect(warnings.traits).toEqual([]);
  });

  it("recognizes subskill aliases like Driving/Ground Vehicle without warnings", () => {
    const withSubskillAlias = {
      ...draft,
      skills: [
        ...draft.skills,
        { name: "Driving/Ground Vehicle", xp: 30 },
        { name: "Driving/Sea Vehicle", xp: 20 },
      ],
    };
    const warnings = catalogWarnings(withSubskillAlias);
    expect(warnings.skills).not.toContain("Driving/Ground Vehicle");
    expect(warnings.skills).not.toContain("Driving/Sea Vehicle");
  });
});
