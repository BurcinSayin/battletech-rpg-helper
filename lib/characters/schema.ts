// Zod schema for the editable character form plus form <-> draft mapping. The
// form edits scalars, the 8 attributes, skills, traits, and notes; every other
// draft section (equip/weapons/pre*) is preserved verbatim through the round-trip.
//
// Catalog membership is a WARN-not-fail check (per PLAN.md / the `.btcc` import
// rule): `.btcc` names are version-drifted (backticks, plural "Interests",
// "MedText"), so unknown names surface a warning but never block a save.

import { z } from "zod";
import type { BtccDraft, BtccScalars } from "@/lib/btcc/types";
import { skills as skillCatalog, traits as traitCatalog } from "@/lib/rules/load";
import { compositeSkillNames } from "@/lib/rules/load";
import { ATTRIBUTE_KEYS } from "./xp";

const intField = z.coerce.number().int();
const nonNegIntField = z.coerce.number().int().min(0);

/** All 21 scalars; `name` is required, numeric fields coerce from form inputs. */
export const scalarsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  aff: z.string(),
  subaff: z.string(),
  clancaste: z.string(),
  earlychild: z.string(),
  latechild: z.string(),
  schoolname: z.string(),
  basicschool: z.string(),
  advschool: z.string(),
  specschool: z.string(),
  reallife: z.string(),
  phenotype: z.string(),
  nameplanet: z.string(),
  sex: z.string(),
  age: nonNegIntField,
  haircolor: z.string(),
  eyecolor: z.string(),
  height: nonNegIntField,
  weight: nonNegIntField,
  gmxpmod: intField,
  cbillmod: intField,
});

// Compile-time guard: parsed scalars must be assignable to BtccScalars (and vice
// versa), so the form stays in lockstep with the `.btcc` model.
const _toScalars = (v: z.infer<typeof scalarsSchema>): BtccScalars => v;
const _fromScalars = (v: BtccScalars): z.infer<typeof scalarsSchema> => v;
void _toScalars;
void _fromScalars;

export const attributesSchema = z.object({
  STR: nonNegIntField,
  BOD: nonNegIntField,
  RFL: nonNegIntField,
  DEX: nonNegIntField,
  INT: nonNegIntField,
  WIL: nonNegIntField,
  CHA: nonNegIntField,
  EDG: nonNegIntField,
});

const rowSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  xp: intField,
});

export const characterFormSchema = z.object({
  scalars: scalarsSchema,
  attributes: attributesSchema,
  skills: z.array(rowSchema),
  traits: z.array(rowSchema),
  notes: z.string(),
});

export type CharacterFormValues = z.infer<typeof characterFormSchema>;

/** Project a draft into form values (8 attributes default to the free base 100). */
export function draftToForm(draft: BtccDraft): CharacterFormValues {
  const attributes = Object.fromEntries(
    ATTRIBUTE_KEYS.map((key) => [key, draft.attrs[key] ?? 100]),
  ) as CharacterFormValues["attributes"];
  return {
    scalars: { ...draft.scalars },
    attributes,
    skills: draft.skills.map((row) => ({ ...row })),
    traits: draft.traits.map((row) => ({ ...row })),
    notes: draft.notes,
  };
}

/** Merge edited form values back onto a base draft, preserving untouched sections. */
export function formToDraft(base: BtccDraft, values: CharacterFormValues): BtccDraft {
  return {
    ...base,
    scalars: { ...values.scalars },
    attrs: { ...base.attrs, ...values.attributes },
    skills: values.skills.map((row) => ({ ...row })),
    traits: values.traits.map((row) => ({ ...row })),
    notes: values.notes,
  };
}

let validSkillNames: Set<string> | null = null;
let validTraitNames: Set<string> | null = null;

function skillNameSet(): Set<string> {
  if (!validSkillNames) {
    validSkillNames = new Set([
      ...skillCatalog.map((s) => s.name),
      ...compositeSkillNames(),
    ]);
  }
  return validSkillNames;
}

function traitNameSet(): Set<string> {
  if (!validTraitNames) {
    validTraitNames = new Set(traitCatalog.map((t) => t.name));
  }
  return validTraitNames;
}

export interface CatalogWarnings {
  skills: string[];
  traits: string[];
}

/** Names not present in the static rules catalog. Informational only (never blocks). */
export function catalogWarnings(draft: BtccDraft): CatalogWarnings {
  const knownSkills = skillNameSet();
  const knownTraits = traitNameSet();
  return {
    skills: draft.skills.map((r) => r.name).filter((n) => !knownSkills.has(n)),
    traits: draft.traits.map((r) => r.name).filter((n) => !knownTraits.has(n)),
  };
}

/** Sorted skill names (incl. composites) for the editor's skill `<datalist>`. */
export function catalogSkillNames(): string[] {
  return [...skillNameSet()].sort((a, b) => a.localeCompare(b));
}

/** Sorted trait names for the editor's trait `<datalist>`. */
export function catalogTraitNames(): string[] {
  return [...traitNameSet()].sort((a, b) => a.localeCompare(b));
}
