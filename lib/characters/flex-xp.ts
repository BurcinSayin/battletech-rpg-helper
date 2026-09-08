import type { BtccDraft, BtccRow } from "@/lib/btcc/types";
import type { FlexPolicy } from "../rules/childhood-contract";
import type { Stage0Candidate } from "../rules/stage0-contract";
import { subskills } from "../rules/load";
import { catalogSkillNames, catalogTraitNames } from "./schema";
import { mergeRows } from "./grants";
import { ATTRIBUTE_BASE, ATTRIBUTE_KEYS } from "./xp";

export type FlexAllocation = {
  readonly candidate: Stage0Candidate;
  readonly xp: number;
};

export type FlexValidation =
  | { readonly valid: true; readonly spent: number; readonly remaining: number }
  | {
      readonly valid: false;
      readonly reason:
        | "candidate"
        | "amount"
        | "duplicate"
        | "entryCap"
        | "categoryCap"
        | "allowance";
    };

function candidateKey(candidate: Stage0Candidate): string {
  return `${candidate.kind}:${candidate.value}`;
}

function concreteCandidate(candidate: Stage0Candidate): boolean {
  if (candidate.kind === "attribute") {
    return ATTRIBUTE_KEYS.some((key) => key === candidate.value);
  }
  return (
    (candidate.kind === "skill" || candidate.kind === "trait") &&
    candidate.value.length > 0 &&
    !candidate.value.endsWith("/Any")
  );
}

/** Derive from the fixed-plus-fields draft, never a draft already carrying flex. */
export function flexCandidates(draft: BtccDraft): readonly Stage0Candidate[] {
  const candidates: Stage0Candidate[] = [];
  const seen = new Set<string>();
  const add = (kind: Stage0Candidate["kind"], value: string) => {
    const candidate = { kind, value };
    const key = candidateKey(candidate);
    if (concreteCandidate(candidate) && !seen.has(key)) {
      seen.add(key);
      candidates.push(candidate);
    }
  };
  for (const key of ATTRIBUTE_KEYS) add("attribute", key);
  for (const name of catalogSkillNames()) {
    if (!subskills[name]?.length) add("skill", name);
  }
  for (const name of catalogTraitNames()) add("trait", name);
  // Exact source rows remain legal even when absent from the editable catalog,
  // including an existing unspecialized skill parent.
  for (const row of draft.skills) add("skill", row.name);
  for (const row of draft.traits) add("trait", row.name);
  return candidates;
}

export function validateFlexAllocations(
  policy: FlexPolicy,
  allocations: readonly FlexAllocation[],
  allowed: readonly Stage0Candidate[],
): FlexValidation {
  const allowedKeys = new Set(allowed.map(candidateKey));
  const seen = new Set<string>();
  const categorySpent = { attribute: 0, skill: 0, trait: 0 };
  let spent = 0;
  for (const { candidate, xp } of allocations) {
    const key = candidateKey(candidate);
    if (!concreteCandidate(candidate) || !allowedKeys.has(key)) {
      return { valid: false, reason: "candidate" };
    }
    if (!Number.isFinite(xp) || !Number.isInteger(xp) || xp < 0) {
      return { valid: false, reason: "amount" };
    }
    if (seen.has(key)) return { valid: false, reason: "duplicate" };
    seen.add(key);
    if (xp > policy.entryCaps[candidate.kind])
      return { valid: false, reason: "entryCap" };
    categorySpent[candidate.kind] += xp;
    const categoryCap = policy.categoryCaps[candidate.kind];
    if (categoryCap !== null && categorySpent[candidate.kind] > categoryCap) {
      return { valid: false, reason: "categoryCap" };
    }
    spent += xp;
    if (spent > policy.allowance) return { valid: false, reason: "allowance" };
  }
  return { valid: true, spent, remaining: policy.allowance - spent };
}

/** Apply a validated ledger once to its pre-flex prefix; replay handles refunds. */
export function applyFlexAllocations(
  draft: BtccDraft,
  allocations: readonly FlexAllocation[],
): BtccDraft {
  const result = structuredClone(draft);
  const skills: BtccRow[] = [];
  const traits: BtccRow[] = [];
  for (const { candidate, xp } of allocations) {
    if (xp === 0) continue;
    switch (candidate.kind) {
      case "attribute":
        result.attrs[candidate.value] =
          (result.attrs[candidate.value] ?? ATTRIBUTE_BASE) + xp;
        break;
      case "skill":
        skills.push({ name: candidate.value, xp });
        break;
      case "trait":
        traits.push({ name: candidate.value, xp });
        break;
    }
  }
  result.skills = mergeRows(result.skills, skills, (a, b) => a + b).filter(
    (row) => row.xp !== 0,
  );
  result.traits = mergeRows(result.traits, traits, (a, b) => a + b).filter(
    (row) => row.xp !== 0,
  );
  return result;
}
