import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/lib/btcc/types";
import { childhoodCatalog } from "../rules/load";
import type { FlexPolicy } from "../rules/childhood-contract";
import type { Stage0Candidate } from "../rules/stage0-contract";
import {
  applyFlexAllocations,
  flexCandidates,
  validateFlexAllocations,
} from "./flex-xp";
import { ATTRIBUTE_KEYS, computeXp } from "./xp";

const perception: Stage0Candidate = { kind: "skill", value: "Perception" };
const navigation: Stage0Candidate = {
  kind: "skill",
  value: "Navigation/Ground",
};
const medTech: Stage0Candidate = { kind: "skill", value: "MedTech" };
const strength: Stage0Candidate = { kind: "attribute", value: "STR" };
const vehicle: Stage0Candidate = { kind: "trait", value: "Vehicle" };
const wealth: Stage0Candidate = { kind: "trait", value: "Wealth" };
const allowed = [perception, navigation, medTech, strength, vehicle, wealth];
const standard: FlexPolicy = {
  allowance: 1000,
  entryCaps: { attribute: 200, skill: 35, trait: 200 },
  categoryCaps: { attribute: null, skill: null, trait: null },
};

function modulePolicy(name: string): FlexPolicy {
  const policy = childhoodCatalog.modules.find(
    (module) => module.stage === 2 && module.name === name,
  )?.flexPolicy;
  if (!policy) throw new Error(`Missing Stage 2 flex policy: ${name}`);
  return policy;
}

describe("validateFlexAllocations", () => {
  it.each([
    { candidate: perception, cap: 35 },
    { candidate: strength, cap: 200 },
    { candidate: vehicle, cap: 200 },
  ])(
    "bounds $candidate.kind increments without limiting existing totals",
    ({ candidate, cap }) => {
      expect(
        validateFlexAllocations(standard, [{ candidate, xp: cap }], allowed),
      ).toEqual({
        valid: true,
        spent: cap,
        remaining: 1000 - cap,
      });
      expect(
        validateFlexAllocations(
          standard,
          [{ candidate, xp: cap + 1 }],
          allowed,
        ),
      ).toEqual({
        valid: false,
        reason: "entryCap",
      });
    },
  );

  it.each([-1, 0.5, NaN, Infinity, -Infinity])(
    "rejects malformed amount %s",
    (xp) => {
      expect(
        validateFlexAllocations(
          standard,
          [{ candidate: perception, xp }],
          allowed,
        ),
      ).toEqual({
        valid: false,
        reason: "amount",
      });
    },
  );

  it("rejects unknown or wrong-kind targets, including wildcard rows", () => {
    for (const candidate of [
      { kind: "skill", value: "Unknown" },
      { kind: "trait", value: "Perception" },
    ] as const) {
      expect(
        validateFlexAllocations(standard, [{ candidate, xp: 10 }], allowed),
      ).toEqual({
        valid: false,
        reason: "candidate",
      });
    }
    for (const candidate of [
      { kind: "skill", value: "Language/Any" },
      { kind: "attribute", value: "Unknown" },
    ] as const) {
      expect(
        validateFlexAllocations(standard, [{ candidate, xp: 10 }], [candidate]),
      ).toEqual({
        valid: false,
        reason: "candidate",
      });
    }
  });

  it("rejects duplicate kind/value entries instead of silently summing them", () => {
    expect(
      validateFlexAllocations(
        standard,
        [
          { candidate: perception, xp: 10 },
          { candidate: { ...perception }, xp: 0 },
        ],
        allowed,
      ),
    ).toEqual({ valid: false, reason: "duplicate" });
    const sameNameTrait: Stage0Candidate = {
      kind: "trait",
      value: "Perception",
    };
    expect(
      validateFlexAllocations(
        standard,
        [
          { candidate: perception, xp: 10 },
          { candidate: sameNameTrait, xp: 20 },
        ],
        [...allowed, sameNameTrait],
      ),
    ).toEqual({ valid: true, spent: 30, remaining: 970 });
  });

  it("enforces aggregate allowance while allowing exhaustion and refunds", () => {
    const policy = { ...standard, allowance: 50 };
    expect(
      validateFlexAllocations(
        policy,
        [
          { candidate: perception, xp: 35 },
          { candidate: strength, xp: 15 },
        ],
        allowed,
      ),
    ).toEqual({ valid: true, spent: 50, remaining: 0 });
    expect(
      validateFlexAllocations(
        policy,
        [
          { candidate: perception, xp: 35 },
          { candidate: strength, xp: 16 },
        ],
        allowed,
      ),
    ).toEqual({ valid: false, reason: "allowance" });
    expect(
      validateFlexAllocations(
        policy,
        [
          { candidate: perception, xp: 20 },
          { candidate: strength, xp: 15 },
        ],
        allowed,
      ),
    ).toEqual({ valid: true, spent: 35, remaining: 15 });
    expect(validateFlexAllocations(policy, [], allowed)).toEqual({
      valid: true,
      spent: 0,
      remaining: 50,
    });
  });

  it("allows only skills for Military School", () => {
    const policy = modulePolicy("Military School");
    expect(
      validateFlexAllocations(
        policy,
        [{ candidate: perception, xp: 35 }],
        allowed,
      ),
    ).toEqual({
      valid: true,
      spent: 35,
      remaining: policy.allowance - 35,
    });
    for (const candidate of [strength, vehicle]) {
      expect(
        validateFlexAllocations(policy, [{ candidate, xp: 1 }], allowed),
      ).toEqual({
        valid: false,
        reason: "categoryCap",
      });
    }
  });

  it("caps Preparatory School's combined trait increments at 80", () => {
    const policy = modulePolicy("Preparatory School");
    expect(
      validateFlexAllocations(
        policy,
        [
          { candidate: vehicle, xp: 40 },
          { candidate: wealth, xp: 40 },
        ],
        allowed,
      ),
    ).toEqual({ valid: true, spent: 80, remaining: policy.allowance - 80 });
    expect(
      validateFlexAllocations(
        policy,
        [
          { candidate: vehicle, xp: 40 },
          { candidate: wealth, xp: 41 },
        ],
        allowed,
      ),
    ).toEqual({ valid: false, reason: "categoryCap" });
  });

  it("caps Spacer Family's combined skill increments at 100", () => {
    const policy = modulePolicy("Spacer Family");
    const first = [
      { candidate: perception, xp: 35 },
      { candidate: navigation, xp: 35 },
    ];
    expect(
      validateFlexAllocations(
        policy,
        [...first, { candidate: medTech, xp: 30 }],
        allowed,
      ),
    ).toEqual({
      valid: true,
      spent: 100,
      remaining: policy.allowance - 100,
    });
    expect(
      validateFlexAllocations(
        policy,
        [...first, { candidate: medTech, xp: 31 }],
        allowed,
      ),
    ).toEqual({
      valid: false,
      reason: "categoryCap",
    });
  });
});

describe("flexCandidates", () => {
  it("expands skill parents but permits existing exact source rows independently", () => {
    const draft = emptyDraft();
    const before = flexCandidates(draft);
    expect(
      before
        .filter((candidate) => candidate.kind === "attribute")
        .map((candidate) => candidate.value),
    ).toEqual(ATTRIBUTE_KEYS);
    expect(before).toContainEqual({ kind: "skill", value: "Art/Dance" });
    expect(before).not.toContainEqual({ kind: "skill", value: "Art" });
    draft.skills = [
      { name: "Art", xp: 15 },
      { name: "Art/Dance", xp: 30 },
      { name: "Raw Source Skill", xp: 25 },
      { name: "Language/Any", xp: 15 },
    ];
    draft.traits = [
      { name: "Exceptional Attribute/", xp: 10 },
      { name: "Raw Source Skill", xp: -5 },
    ];
    const candidates = flexCandidates(draft);
    expect(candidates).toContainEqual({ kind: "skill", value: "Art" });
    expect(candidates).toContainEqual({
      kind: "skill",
      value: "Raw Source Skill",
    });
    expect(candidates).toContainEqual({
      kind: "trait",
      value: "Raw Source Skill",
    });
    expect(candidates).toContainEqual({
      kind: "trait",
      value: "Exceptional Attribute/",
    });
    expect(
      candidates.filter((candidate) => candidate.value === "Art/Dance"),
    ).toEqual([{ kind: "skill", value: "Art/Dance" }]);
    expect(
      candidates.some((candidate) => candidate.value.endsWith("/Any")),
    ).toBe(false);
    draft.skills = [];
    expect(flexCandidates(draft)).not.toContainEqual({
      kind: "skill",
      value: "Raw Source Skill",
    });
  });
});

describe("applyFlexAllocations", () => {
  it("replays replacements and deletion from the fixed prefix without erasing grants", () => {
    const draft = emptyDraft();
    draft.skills = [{ name: "Perception", xp: 65 }];
    draft.scalars.gmxpmod = -30;
    const prefixXp = computeXp(draft).remaining;
    const policy = { ...standard, allowance: 125 };
    for (const xp of [35, 20, 0]) {
      const allocations = xp ? [{ candidate: perception, xp }] : [];
      expect(
        validateFlexAllocations(policy, allocations, flexCandidates(draft)),
      ).toEqual({
        valid: true,
        spent: xp,
        remaining: 125 - xp,
      });
      const applied = applyFlexAllocations(draft, allocations);
      expect(applied.skills).toEqual([{ name: "Perception", xp: 65 + xp }]);
      expect(computeXp(applied).remaining).toBe(prefixXp - xp);
      expect(applied.scalars.gmxpmod).toBe(-30);
      expect(draft.skills).toEqual([{ name: "Perception", xp: 65 }]);
    }
  });

  it("preserves signed rows, removes only final zeroes, and charges missing attributes from their baseline", () => {
    const draft = emptyDraft();
    draft.skills = [
      { name: "Raw Skill", xp: -10 },
      { name: "Perception", xp: -5 },
    ];
    draft.traits = [
      { name: "Vehicle", xp: -20 },
      { name: "Unlucky", xp: -50 },
    ];
    const applied = applyFlexAllocations(draft, [
      { candidate: strength, xp: 200 },
      { candidate: perception, xp: 5 },
      { candidate: vehicle, xp: 20 },
      { candidate: wealth, xp: 0 },
    ]);
    expect(applied.attrs.STR).toBe(300);
    expect(applied.skills).toEqual([{ name: "Raw Skill", xp: -10 }]);
    expect(applied.traits).toEqual([{ name: "Unlucky", xp: -50 }]);
    expect(computeXp(applied).remaining).toBe(computeXp(draft).remaining - 225);
  });
});
