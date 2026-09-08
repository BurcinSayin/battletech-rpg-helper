import { z } from "zod";
import { stage0LayerSchema, stage0SourceSchema } from "./catalog";
import type { Stage0Catalog } from "../rules/stage0-contract";

const amount = z.number().int().nonnegative();
const names = z.array(z.string().min(1));
const attributeKeys: Readonly<Record<string, true>> = {
  STR: true,
  BOD: true,
  RFL: true,
  DEX: true,
  INT: true,
  WIL: true,
  CHA: true,
  EDG: true,
};
const layerSchema = stage0LayerSchema.superRefine((layer, ctx) => {
  for (const field of ["attrDeltas", "prerequisites"] as const) {
    const attrs =
      field === "attrDeltas" ? layer.attrDeltas : layer.prerequisites.attrs;
    for (const key of Object.keys(attrs))
      if (!Object.hasOwn(attributeKeys, key))
        ctx.addIssue({
          code: "custom",
          message: `Unknown attribute ${key}`,
          path: [field, key],
        });
  }
  const ids = new Set<string>();
  layer.choices.forEach((choice, index) => {
    if (ids.has(choice.id))
      ctx.addIssue({
        code: "custom",
        message: "Duplicate choice ID",
        path: ["choices", index, "id"],
      });
    ids.add(choice.id);
    if (choice.candidateSelection.mode !== "all" || choice.unique)
      ctx.addIssue({
        code: "custom",
        message: "Childhood choices are independent explicit candidates",
        path: ["choices", index],
      });
    choice.candidates.forEach((candidate, candidateIndex) => {
      if (
        candidate.kind === "attribute" &&
        !Object.hasOwn(attributeKeys, candidate.value)
      )
        ctx.addIssue({
          code: "custom",
          message: "Unknown candidate attribute",
          path: ["choices", index, "candidates", candidateIndex],
        });
    });
  });
});
export const flexPolicySchema = z
  .object({
    allowance: amount,
    entryCaps: z
      .object({ attribute: amount, skill: amount, trait: amount })
      .strict(),
    categoryCaps: z
      .object({
        attribute: amount.nullable(),
        skill: amount.nullable(),
        trait: amount.nullable(),
      })
      .strict(),
  })
  .strict();
export const sibkoPoolSchema = z
  .object({
    budgetXp: amount,
    stepXp: z.number().int().positive(),
    rebateXp: amount,
    groups: z
      .array(z.object({ id: z.string().min(1), skills: names.min(1) }).strict())
      .min(1),
  })
  .strict()
  .superRefine((pool, ctx) => {
    if (
      new Set(pool.groups.map((group) => group.id)).size !== pool.groups.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate field group" });
    for (const group of pool.groups)
      if (new Set(group.skills).size !== group.skills.length)
        ctx.addIssue({ code: "custom", message: "Duplicate field skill" });
  });
const branchSchema = z
  .object({
    name: z.string().min(1),
    clans: names.min(1).nullable(),
    xpCost: amount,
    flexPolicy: flexPolicySchema,
    layer: layerSchema,
    basic: sibkoPoolSchema,
    advanced: sibkoPoolSchema,
    source: stage0SourceSchema,
  })
  .strict();
export const childhoodModuleSchema = z
  .object({
    stage: z.union([z.literal(1), z.literal(2)]),
    name: z.string().min(1),
    description: z.string().nullable(),
    xpCost: amount.nullable(),
    layer: layerSchema,
    parametrizedGrants: z
      .object({
        language: z.number().int(),
        protocols: z.number().int(),
        streetwise: z.number().int(),
      })
      .strict(),
    phenotypes: names,
    casteLayers: z.array(
      z.object({ caste: z.string().min(1), layer: layerSchema }).strict(),
    ),
    flexPolicy: flexPolicySchema.nullable(),
    sibkoBranches: z.array(branchSchema),
    source: stage0SourceSchema,
  })
  .strict()
  .superRefine((module, ctx) => {
    if (
      module.xpCost === null &&
      !(
        module.stage === 2 &&
        module.name === "Trueborn Sibko" &&
        module.sibkoBranches.length
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Only unresolved Trueborn Sibko may have null cost",
      });
    if (
      module.stage === 1 &&
      (module.flexPolicy !== null || module.sibkoBranches.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Stage 1 has no flex or Sibko pools",
      });
    if (
      new Set(module.sibkoBranches.map((branch) => branch.name)).size !==
      module.sibkoBranches.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate Sibko branch" });
    if (
      new Set(module.casteLayers.map((layer) => layer.caste)).size !==
      module.casteLayers.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate caste overlay" });
  });
export const childhoodCatalogSchema = z
  .object({
    modules: z.array(childhoodModuleSchema).min(1),
    gates: z
      .array(
        z
          .object({
            stage: z.union([z.literal(1), z.literal(2)]),
            operation: z.enum(["replace", "remove"]),
            modules: names.min(1),
            source: stage0SourceSchema,
            when: z
              .object({
                affiliations: names.min(1),
                subAffiliationIds: z.array(amount).min(1).optional(),
                traitsAny: z
                  .object({ names: names.min(1), present: z.boolean() })
                  .strict()
                  .optional(),
                stage1Modules: names.min(1).optional(),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1),
    affiliationSkills: z
      .array(
        z
          .object({
            affiliation: z.string().min(1),
            protocol: z.string().min(1),
            streetwise: z.string().min(1),
            source: stage0SourceSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const modules = new Set(
      catalog.modules.map((module) => `${module.stage}:${module.name}`),
    );
    if (modules.size !== catalog.modules.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate stage/module identity",
      });
    const affiliations = new Set(
      catalog.affiliationSkills.map((entry) => entry.affiliation),
    );
    if (affiliations.size !== catalog.affiliationSkills.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate affiliation parameter mapping",
      });
    catalog.gates.forEach((gate, index) => {
      for (const name of gate.modules)
        if (!modules.has(`${gate.stage}:${name}`))
          ctx.addIssue({
            code: "custom",
            message: `Unknown gate module ${name}`,
            path: ["gates", index],
          });
      for (const name of gate.when.stage1Modules ?? [])
        if (!modules.has(`1:${name}`))
          ctx.addIssue({
            code: "custom",
            message: `Unknown prior module ${name}`,
            path: ["gates", index],
          });
      for (const name of gate.when.affiliations)
        if (!affiliations.has(name))
          ctx.addIssue({
            code: "custom",
            message: `Unknown gate affiliation ${name}`,
            path: ["gates", index],
          });
    });
  });

/** Validate joins against the same Stage 0 catalog used by generation and loading. */
export function parseChildhoodCatalog(value: unknown, stage0: Stage0Catalog) {
  return childhoodCatalogSchema
    .superRefine((catalog, ctx) => {
      const affiliations = new Map(
        stage0.affiliations.map((entry) => [entry.name, entry]),
      );
      const castes = new Set(stage0.castes.map((entry) => entry.name));
      for (const affiliation of affiliations.keys())
        if (
          !catalog.affiliationSkills.some(
            (entry) => entry.affiliation === affiliation,
          )
        )
          ctx.addIssue({
            code: "custom",
            message: `Missing parameter join ${affiliation}`,
          });
      for (const entry of catalog.affiliationSkills)
        if (!affiliations.has(entry.affiliation))
          ctx.addIssue({
            code: "custom",
            message: `Unknown parameter join ${entry.affiliation}`,
          });
      for (const ruleModule of catalog.modules)
        for (const overlay of ruleModule.casteLayers)
          if (!castes.has(overlay.caste))
            ctx.addIssue({
              code: "custom",
              message: `Unknown caste ${overlay.caste}`,
            });
      for (const gate of catalog.gates)
        for (const name of gate.when.affiliations)
          for (const id of gate.when.subAffiliationIds ?? [])
            if (
              !affiliations
                .get(name)
                ?.subAffiliations.some((child) => child.id === id)
            )
              ctx.addIssue({
                code: "custom",
                message: `Unknown sub-affiliation ${name}/${id}`,
              });
      const clans = new Set(
        stage0.affiliations
          .filter((entry) => entry.casteRequired)
          .flatMap((entry) => entry.subAffiliations.map((child) => child.name)),
      );
      for (const ruleModule of catalog.modules)
        for (const branch of ruleModule.sibkoBranches)
          for (const clan of branch.clans ?? [])
            if (!clans.has(clan))
              ctx.addIssue({
                code: "custom",
                message: `Unknown Sibko clan ${clan}`,
              });
    })
    .parse(value);
}
