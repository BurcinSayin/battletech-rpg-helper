import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { MechWeaponReference } from "../lib/mech/weapon-reference-types";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nonempty = z.string().min(1);
const finite = z.number().finite();
const sourceSchema = z
  .record(
    nonempty,
    z.object({
      LookupName: nonempty,
      ActualName: nonempty,
      CritName: nonempty,
      ChatName: nonempty,
      MegaMekName: nonempty,
      IsCluster: z.boolean(),
      Heat: finite,
      DamSht: finite,
      DamMed: finite,
      DamLng: finite,
      RngMin: finite,
      RngSht: finite,
      RngMed: finite,
      RngLng: finite,
    }),
  )
  .superRefine((entries, ctx) => {
    if (Object.keys(entries).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected a nonempty catalog",
      });
    }
    for (const [id, entry] of Object.entries(entries)) {
      if (entry.LookupName !== id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [id, "LookupName"],
          message: "LookupName must equal the catalog key",
        });
      }
    }
  });

export function buildMechWeaponCatalog(raw: unknown): MechWeaponReference[] {
  const parsed = sourceSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `mech_weapons.json: ${parsed.error.issues
        .map(
          (issue) => `${issue.path.join(".") || "catalog"}: ${issue.message}`,
        )
        .join("; ")}`,
    );
  }
  return Object.entries(parsed.data).map(([id, entry]) => ({
    id,
    aliases: [
      ...new Set([entry.ActualName, entry.CritName, entry.ChatName]),
    ].filter((alias) => alias !== id && alias !== entry.MegaMekName),
    megaMekName: entry.MegaMekName,
    techBase: id.startsWith("(IS) ")
      ? "IS"
      : id.startsWith("(CL) ")
        ? "CL"
        : null,
    heat: entry.Heat,
    damage: [entry.DamSht, entry.DamMed, entry.DamLng],
    ranges: [entry.RngMin, entry.RngSht, entry.RngMed, entry.RngLng],
    isCluster: entry.IsCluster,
  }));
}

export function parseMechWeapons(): MechWeaponReference[] {
  const catalog = buildMechWeaponCatalog(
    JSON.parse(
      readFileSync(join(repoRoot, "docs/rule_book/mech_weapons.json"), "utf8"),
    ),
  );
  const outDirectory = join(repoRoot, "data/rules");
  // Validate and project every entry before replacing the existing artifact.
  mkdirSync(outDirectory, { recursive: true });
  writeFileSync(
    join(outDirectory, "mech-weapons.json"),
    JSON.stringify(catalog, null, 2) + "\n",
    "utf8",
  );
  console.log(`Wrote ${catalog.length} mech weapon references.`);
  return catalog;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  parseMechWeapons();
}
