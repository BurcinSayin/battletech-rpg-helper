import skillsTable from "@/docs/rule_book/skills_table.json";

const complexities: Record<string, string | undefined> = Object.assign(
  Object.create(null),
  Object.fromEntries(
    skillsTable.rows.map((row) => [row.skill_name, row.complexity]),
  ),
);

/** Resolve specialties through their parent; tiered skills advance at level 4. */
export function skillComplexity(
  name: string,
  level: number,
): string | undefined {
  const exact = complexities[name];
  if (exact) return exact;
  const parent = name.split("/", 1)[0];
  return (
    complexities[parent] ??
    complexities[`${parent} [${level >= 4 ? "Advanced" : "Basic"} Tier]`]
  );
}
