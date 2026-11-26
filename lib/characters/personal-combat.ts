import { z } from "zod";

// The Unicode flag counts code points. PostgreSQL jsonb also rejects NUL and
// unpaired surrogates before personal_combat_is_valid sees the label.
const labelCharacters =
  /^[^\u0000-\u001f\u007f\u0085\u2028\u2029\p{Cs}]{1,64}$/u;

const conditionLabel = z
  .string()
  .regex(labelCharacters)
  .refine(
    (label) =>
      !label.startsWith(" ") && !label.endsWith(" ") && /\P{Zs}/u.test(label),
  );

export const personalCombatSchema = z
  .object({
    damage: z.number().int().min(0).max(999),
    conditions: z.array(conditionLabel).max(12),
  })
  .strict();

export type PersonalCombat = z.infer<typeof personalCombatSchema>;
