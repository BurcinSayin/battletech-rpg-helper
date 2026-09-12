import type { AdultModule } from "@/lib/validation/adult";
import { adultModules } from "@/lib/rules/load";
import {
  availableSchools,
  resolveAdultModule,
  schoolChoices,
  fieldChoices,
  applyAdultModule,
  validAdultChoices,
  completeAdultChoices,
  type AdultContext,
  type AdultChoiceSelection,
} from "./adult";

export type SchoolTier = "basic" | "advanced" | "specialist";
export type SchoolFieldSelection = {
  readonly tier: SchoolTier;
  readonly name: string;
  readonly choices: AdultChoiceSelection;
};
export type SchoolSelection = {
  readonly moduleName: string;
  readonly choices: AdultChoiceSelection;
  readonly fields: readonly SchoolFieldSelection[];
};

/** One basic field, then either two advanced fields or advanced + specialist
 * (wizard.cpp:3773–3835). Every change is replayed from the Stage 2 prefix. */
export function projectSchool(
  context: AdultContext,
  selection: SchoolSelection | null,
) {
  const modules = availableSchools(context);
  const entry = modules.find((entry) => entry.name === selection?.moduleName);
  if (selection && !entry) return null;
  const resolved = entry ? resolveAdultModule(entry, context) : null;
  const choices = resolved ? schoolChoices(resolved) : [];
  if (selection && !validAdultChoices(choices, selection.choices)) return null;
  let draft = context.draft;
  let cost = 0;
  let rebate = 0;
  const fields: {
    selection: SchoolFieldSelection;
    choices: ReturnType<typeof fieldChoices>;
    complete: boolean;
    cost: number;
    rebate: number;
    age: number;
  }[] = [];
  let complete = resolved === null;
  if (resolved && selection) {
    complete = completeAdultChoices(choices, selection.choices);
    if (complete) {
      draft = applyAdultModule(
        draft,
        resolved,
        context,
        choices,
        selection.choices,
      );
      draft = {
        ...draft,
        scalars: { ...draft.scalars, schoolname: resolved.name },
      };
      cost += resolved.xpCost ?? 0;
    }
    if (selection.fields.length > 3) return null;
    for (const [index, field] of selection.fields.entries()) {
      if (
        (index === 0 && field.tier !== "basic") ||
        (index === 1 && field.tier !== "advanced") ||
        (index === 2 && field.tier === "basic")
      )
        return null;
      const group = resolved.fields?.[field.tier];
      const fieldModule = adultModules.find(
        (entry) => entry.kind === "field" && entry.name === field.name,
      );
      if (!group?.skills.includes(field.name) || !fieldModule) return null;
      const choices = fieldChoices(field.name, context);
      if (!validAdultChoices(choices, field.choices)) return null;
      const fieldComplete =
        complete && completeAdultChoices(choices, field.choices);
      const fieldCost = choices.length * 30;
      const fieldRebate = choices.length * 6;
      const age = group.age ?? 0;
      fields.push({
        selection: field,
        choices,
        complete: fieldComplete,
        cost: fieldCost,
        rebate: fieldRebate,
        age,
      });
      if (fieldComplete) {
        draft = applyAdultModule(
          draft,
          fieldModule,
          context,
          choices,
          field.choices,
        );
        const key = (
          {
            basic: "basicschool",
            advanced: "advschool",
            specialist: "specschool",
          } as const
        )[field.tier];
        draft = {
          ...draft,
          scalars: {
            ...draft.scalars,
            age: draft.scalars.age + age,
            // Desktop handoff stores the last field in each tier. The selection
            // ledger above retains both advanced fields for replay and display.
            [key]: field.name,
          },
        };
        cost += fieldCost;
        rebate += fieldRebate;
      }
      complete = fieldComplete;
    }
    if (resolved.fields?.basic?.skills.length && !selection.fields.length)
      complete = false;
  }
  return {
    modules,
    module: resolved,
    choices,
    fields,
    complete,
    draft,
    cost,
    rebate,
    militaryField: context.militaryField || resolved?.fieldClass === "mil",
  };
}
export type SchoolView = NonNullable<ReturnType<typeof projectSchool>>;

export type RealLifeSelection = {
  readonly modules: readonly string[];
  readonly pending: string | null;
  readonly skipped: boolean;
  readonly choices?: Readonly<Record<string, AdultChoiceSelection>>;
  readonly pendingChoices?: AdultChoiceSelection;
};

export type ResolvedRealLife = {
  readonly module: AdultModule;
  readonly cost: number;
  readonly age: number;
};
