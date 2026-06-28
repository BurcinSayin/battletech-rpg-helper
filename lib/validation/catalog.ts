import { z } from "zod";

// Zod schemas for the generated rules JSON under `data/rules/`. Used to validate
// the ingested catalog (tests now) and, later, to validate character writes
// against the legal catalog (PLAN.md step #5).

export const skillSchema = z.object({
  name: z.string().min(1),
  attributes: z.string().min(1),
  cost: z.number().int(),
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

export type Skill = z.infer<typeof skillSchema>;
export type Trait = z.infer<typeof traitSchema>;
export type Subskills = z.infer<typeof subskillsSchema>;
