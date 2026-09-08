import { z } from "zod";

// Zod schemas for the generated rules JSON under `data/rules/`. Used to validate
// the ingested catalog (tests now) and, later, to validate character writes
// against the legal catalog (PLAN.md step #5).

export const skillSchema = z.object({
  name: z.string().min(1),
  attributes: z.string().min(1),
  targetNumber: z.number().int(),
  category: z.string().min(1),
});

export const traitSchema = z.object({
  name: z.string().min(1),
  page: z.string().min(1),
});

export const skillsSchema = z.array(skillSchema);
export const traitsSchema = z.array(traitSchema);

/** subskills.json: parent skill → ordered list of sub-skill names. */
export const subskillsSchema = z.record(z.string(), z.array(z.string().min(1)));

/** Plain string-list catalogs (affiliations, careers, colors, etc.). */
export const stringListSchema = z.array(z.string().min(1));

export const stage0SourceSchema = z
  .object({
    file: z.string().min(1),
    line: z.number().int().positive(),
  })
  .strict();

export const stage0CandidateSchema = z
  .object({
    kind: z.enum(["attribute", "skill", "trait"]),
    value: z.string().min(1),
  })
  .strict();

export const stage0ChoiceReferenceSchema = z.union([
  z.object({ scope: z.literal("startingLanguage") }).strict(),
  z
    .object({
      scope: z.enum(["base", "layer"]),
      choiceId: z.string().min(1),
    })
    .strict(),
]);

export const stage0CandidateSelectionSchema = z.union([
  z.object({ mode: z.literal("all") }).strict(),
  z
    .object({
      mode: z.enum(["includeSelected", "excludeSelected"]),
      references: z.array(stage0ChoiceReferenceSchema).min(1),
    })
    .strict(),
]);

export const stage0ChoiceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).nullable(),
    candidates: z.array(stage0CandidateSchema).min(1),
    xp: z.number().int(),
    selectionCount: z.number().int().positive(),
    unique: z.boolean(),
    candidateSelection: stage0CandidateSelectionSchema,
    source: stage0SourceSchema,
  })
  .strict()
  .superRefine((choice, context) => {
    const available = choice.unique
      ? new Set(choice.candidates.map(({ kind, value }) => `${kind}\u0000${value}`))
          .size
      : choice.candidates.length;
    if (choice.selectionCount > available) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: available,
        type: "number",
        inclusive: true,
        path: ["selectionCount"],
        message: "Selection count exceeds available candidates",
      });
    }
  });

export const stage0GrantSchema = z
  .object({ name: z.string().min(1), xp: z.number().int() })
  .strict();

export const stage0LayerSchema = z
  .object({
    attrDeltas: z.record(z.string().min(1), z.number().int()),
    skillGrants: z.array(stage0GrantSchema),
    traitGrants: z.array(stage0GrantSchema),
    prerequisites: z
      .object({
        attrs: z.record(z.string().min(1), z.number().int()),
        skills: z.array(stage0GrantSchema),
        traits: z.array(stage0GrantSchema),
      })
      .strict(),
    choices: z.array(stage0ChoiceSchema),
    source: stage0SourceSchema,
  })
  .strict();

export const stage0LanguagesSchema = z
  .object({
    mode: z.enum(["base", "subAffiliationOverride"]),
    candidates: z.array(z.string().min(1)),
    source: stage0SourceSchema,
  })
  .strict()
  .superRefine((languages, context) => {
    if (languages.mode === "base" && languages.candidates.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: "array",
        inclusive: true,
        path: ["candidates"],
        message: "Base starting languages require at least one candidate",
      });
    }
  });

export const stage0SubAffiliationSchema = z
  .object({
    id: z.number().int().nonnegative(),
    affiliationId: z.number().int().nonnegative(),
    name: z.string().min(1),
    layer: stage0LayerSchema,
    startingLanguages: stage0LanguagesSchema.nullable(),
    castes: z.array(z.string().min(1)).nullable(),
    source: stage0SourceSchema,
  })
  .strict();

export const stage0AffiliationSchema = z
  .object({
    id: z.number().int().nonnegative(),
    name: z.string().min(1),
    xpCost: z.number().int(),
    startingLanguages: stage0LanguagesSchema,
    casteRequired: z.boolean(),
    castes: z.array(z.string().min(1)),
    base: stage0LayerSchema,
    subAffiliations: z.array(stage0SubAffiliationSchema).min(1),
    source: stage0SourceSchema,
  })
  .strict()
  .superRefine((affiliation, context) => {
    affiliation.subAffiliations.forEach((subAffiliation, index) => {
      if (subAffiliation.affiliationId !== affiliation.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["subAffiliations", index, "affiliationId"],
          message: "Sub-affiliation belongs to a different affiliation",
        });
      }
    });
  });

export const stage0CasteSchema = z
  .object({ name: z.string().min(1), layer: stage0LayerSchema })
  .strict();

export const stage0OverlaySchema = z
  .object({
    name: z.string().min(1),
    xpCost: z.number().int(),
    base: stage0LayerSchema,
    layer: stage0LayerSchema,
  })
  .strict();

export const stage0CatalogSchema = z
  .object({
    affiliations: z.array(stage0AffiliationSchema).min(1),
    castes: z.array(stage0CasteSchema),
    overlays: z.array(stage0OverlaySchema),
  })
  .strict();

export type Skill = z.infer<typeof skillSchema>;
export type Trait = z.infer<typeof traitSchema>;
export type Subskills = z.infer<typeof subskillsSchema>;
