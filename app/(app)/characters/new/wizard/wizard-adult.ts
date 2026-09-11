import {
  projectSchool,
  availableRealLife,
  resolveAdultModule,
  applyAdultModule,
  type AdultContext,
  type SchoolSelection,
  type RealLifeSelection,
  type ResolvedRealLife,
} from "@/lib/characters";

export function projectAdult(
  context: AdultContext,
  stage3: SchoolSelection | null,
  stage4: RealLifeSelection | null,
) {
  const school = projectSchool(context, stage3);
  if (!school) return null;
  let draft = school.draft;
  let cost = school.cost;
  const lifeContext = {
    ...context,
    draft,
    militaryField: school.militaryField,
  };
  const committed: ResolvedRealLife[] = [];
  if (
    stage4 &&
    (!school.complete ||
      (stage4.skipped && (stage4.modules.length || stage4.pending)))
  )
    return null;
  for (const name of stage4?.modules ?? []) {
    const entry = availableRealLife(
      lifeContext,
      committed.map((entry) => entry.module.name),
    ).find((entry) => entry.name === name);
    if (!entry) return null;
    const resolved = resolveAdultModule(entry, lifeContext);
    draft = applyAdultModule(draft, resolved, lifeContext);
    draft = {
      ...draft,
      scalars: {
        ...draft.scalars,
        age: draft.scalars.age + (resolved.age ?? 0),
      },
    };
    cost += resolved.xpCost ?? 0;
    committed.push({
      module: resolved,
      cost: resolved.xpCost ?? 0,
      age: resolved.age ?? 0,
    });
  }
  draft = {
    ...draft,
    scalars: {
      ...draft.scalars,
      reallife: committed.map((entry) => entry.module.name).join("; "),
    },
  };
  const offered = school.complete
    ? availableRealLife(lifeContext, stage4?.modules ?? [])
    : [];
  const pending = offered.find((entry) => entry.name === stage4?.pending);
  if (stage4?.pending && !pending) return null;
  return {
    school,
    draft,
    cost,
    life: {
      offered,
      committed,
      pending: pending ? resolveAdultModule(pending, lifeContext) : null,
    },
  };
}
export type AdultView = NonNullable<ReturnType<typeof projectAdult>>;
