import {
  projectSchool,
  availableRealLife,
  resolveAdultModule,
  applyAdultModule,
  realLifeChoices,
  applyRealLifeChoices,
  validAdultChoices,
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
    const choices = realLifeChoices(resolved, lifeContext);
    const selected = stage4?.choices?.[name] ?? {};
    if (!validAdultChoices(choices, selected)) return null;
    draft = applyRealLifeChoices(
      applyAdultModule(draft, resolved, lifeContext),
      resolved,
      choices,
      selected,
    );
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
  const pendingModule = pending
    ? resolveAdultModule(pending, lifeContext)
    : null;
  const pendingChoices = pendingModule
    ? realLifeChoices(pendingModule, lifeContext)
    : [];
  if (!validAdultChoices(pendingChoices, stage4?.pendingChoices ?? {}))
    return null;
  if (pendingModule && stage4?.pendingChoices)
    draft = applyRealLifeChoices(
      draft,
      pendingModule,
      pendingChoices,
      stage4.pendingChoices,
    );
  return {
    school,
    draft,
    cost,
    life: {
      offered,
      committed,
      pending: pendingModule,
      pendingChoices,
      choices: committed.map((entry) =>
        realLifeChoices(entry.module, lifeContext),
      ),
    },
  };
}
export type AdultView = NonNullable<ReturnType<typeof projectAdult>>;
