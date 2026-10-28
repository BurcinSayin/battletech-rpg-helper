import weaponsJson from "@/data/rules/mech-weapons.json";
import type {
  MechWeaponReference,
  MechWeaponReferenceResult,
} from "./weapon-reference-types";

const catalog = weaponsJson as unknown as MechWeaponReference[];
type Index = Map<string, MechWeaponReference[]>;
const canonicalIds: Index = new Map();
const exactAliases: Index = new Map();
const relaxedAliases: Index = new Map();
const exactMegaMek: Index = new Map();
const relaxedMegaMek: Index = new Map();

function exact(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ");
}

function relaxed(name: string): string {
  return exact(name).replace(/[\s\-/]/g, "");
}

function add(index: Index, key: string, reference: MechWeaponReference): void {
  const entries = index.get(key);
  if (!entries) index.set(key, [reference]);
  else if (!entries.some((entry) => entry.id === reference.id))
    entries.push(reference);
}

for (const reference of catalog) {
  add(canonicalIds, exact(reference.id), reference);
  for (const alias of [
    reference.id,
    ...reference.aliases,
    reference.megaMekName,
  ]) {
    add(exactAliases, exact(alias), reference);
    add(relaxedAliases, relaxed(alias), reference);
  }
  add(exactMegaMek, exact(reference.megaMekName), reference);
  add(relaxedMegaMek, relaxed(reference.megaMekName), reference);
}

/** Reference enrichment only: never rewrites the saved mount or infers mixed technology. */
export function resolveMechWeaponReference(
  name: string,
  mechTechBase: string,
): MechWeaponReferenceResult {
  const cleaned = name
    .trim()
    .replace(/^[1-9]\d*\s+/, "")
    .replace(/\s*\(R\)\s*$/i, "")
    .trim();
  if (!cleaned) return { status: "unmatched" };
  const exactKey = exact(cleaned);
  const canonical = canonicalIds.get(exactKey);
  if (canonical) {
    return canonical.length === 1
      ? { status: "matched", reference: canonical[0] }
      : { status: "ambiguous" };
  }

  let candidates = exactAliases.get(exactKey);
  let isMegaMek = exactMegaMek.has(exactKey);
  if (!candidates) {
    const relaxedKey = relaxed(cleaned);
    candidates = relaxedAliases.get(relaxedKey);
    isMegaMek = relaxedMegaMek.has(relaxedKey);
  }
  if (!candidates) return { status: "unmatched" };
  if (candidates.length === 1)
    return { status: "matched", reference: candidates[0] };
  if (/^\((IS|CL)\)/i.test(cleaned) || isMegaMek)
    return { status: "ambiguous" };

  const declared = mechTechBase.trim().toLowerCase();
  const preferred =
    declared === "inner sphere" ? "IS" : declared === "clan" ? "CL" : null;
  if (preferred) {
    let match: MechWeaponReference | undefined;
    for (const candidate of candidates) {
      if (candidate.techBase !== preferred && candidate.techBase !== null)
        continue;
      if (match) return { status: "ambiguous" };
      match = candidate;
    }
    if (match) return { status: "matched", reference: match };
  }
  return { status: "ambiguous" };
}
