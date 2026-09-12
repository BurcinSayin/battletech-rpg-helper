import { z } from "zod";

const row = z.object({ name: z.string().min(1), xp: z.number().int() });
const prerequisites = z.object({
  attrs: z.record(z.number().int()),
  skills: z.array(row),
  traits: z.array(row),
});
const fieldGroup = z.object({
  skills: z.array(z.string()),
  age: z.number().int().nonnegative().nullable(),
});
const attributeWrite = z.object({
  key: z.string().min(1),
  operation: z.enum(["set", "add"]),
  xp: z.number().int(),
  conditions: z.array(z.string().min(1)),
});
export type AdultAttributeWrite = z.infer<typeof attributeWrite>;
const fields = z.object({
  basic: fieldGroup.nullable(),
  advanced: fieldGroup.nullable(),
  specialist: fieldGroup.nullable(),
});
const pick = z.object({
  namespace: z.enum(["main", "advanced", "more"]),
  slot: z.number().int(),
  label: z.string().nullable(),
  kind: z.enum(["skill", "trait", "attribute"]),
  candidates: z.array(z.string()).nullable(),
  candidatesSource: z.string().nullable().optional(),
  xp: z.number().int().nullable(),
  repeats: z.number().int().nullable(),
});
const parameters = z.object({
  language: z.number().int().optional(),
  protocols: z.number().int().optional(),
  streetwise: z.number().int().optional(),
});
const effects = z.object({
  xpCost: z.number().int().optional(),
  flexXp: z.number().int().optional(),
  flexXpDelta: z.number().int().optional(),
  attrDeltas: z.record(z.number().int()).optional(),
  skillGrants: z.array(row).optional(),
  traitGrants: z.array(row).optional(),
  parametrizedGrants: parameters.optional(),
  prerequisites: prerequisites.optional(),
  fields: fields.optional(),
  picks: z.array(pick).optional(),
});
export type AdultEffects = z.infer<typeof effects>;
export type AdultBranch = {
  condition: string;
  effects: AdultEffects;
  elseEffects: AdultEffects | null;
  conditionals?: AdultBranch[];
};
const branch: z.ZodType<AdultBranch> = z.lazy(() =>
  z.object({
    condition: z.string(),
    effects,
    elseEffects: effects.nullable(),
    conditionals: z.array(branch).optional(),
  }),
);
export const adultModuleSchema = z.object({
  stage: z.union([z.literal(3), z.literal(4)]),
  kind: z.enum(["school", "field", "module"]),
  name: z.string().min(1),
  description: z.string().nullable(),
  xpCost: z.number().int().nullable(),
  flexXp: z.number().int().nullable(),
  age: z.number().nullable(),
  attrDeltas: z.record(z.number().int()),
  attributeWrites: z.array(attributeWrite).optional(),
  skillGrants: z.array(row),
  traitGrants: z.array(row),
  parametrizedGrants: parameters,
  deferredPicks: z.array(pick),
  prerequisites,
  conditionals: z.array(branch),
  fields: fields.optional(),
  fieldClass: z.enum(["civ", "pol", "mil"]).optional(),
  inDefaultSchoolList: z.boolean().optional(),
});
export type AdultModule = z.infer<typeof adultModuleSchema>;
export const adultGateSchema = z.object({
  stage: z.number().int(),
  kind: z.string(),
  name: z.string(),
  condition: z.string().optional(),
  schools: z.array(z.string()).optional(),
});
export const careerFieldsSchema = z.object({
  fields: z.array(
    z.object({
      name: z.string().min(1),
      skills: z.array(z.string().min(1)).min(1),
      source: z.object({ file: z.string(), line: z.number().int().positive() }),
    }),
  ),
  choices: z.array(
    z.object({
      match: z.string().min(1),
      candidates: z.array(z.string().min(1)).min(1),
    }),
  ),
});
export type CareerFields = z.infer<typeof careerFieldsSchema>;
