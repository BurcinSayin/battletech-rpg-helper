import type { Stage0Layer, Stage0Source } from "./stage0-contract";

export type FlexPolicy = {
  readonly allowance: number;
  readonly entryCaps: {
    readonly attribute: number;
    readonly skill: number;
    readonly trait: number;
  };
  readonly categoryCaps: {
    readonly attribute: number | null;
    readonly skill: number | null;
    readonly trait: number | null;
  };
};

export type SibkoPool = {
  readonly budgetXp: number;
  readonly stepXp: number;
  readonly rebateXp: number;
  readonly groups: readonly {
    readonly id: string;
    readonly skills: readonly string[];
  }[];
};

export type SibkoBranch = {
  readonly name: string;
  readonly clans: readonly string[] | null;
  readonly xpCost: number;
  readonly flexPolicy: FlexPolicy;
  readonly layer: Stage0Layer;
  readonly basic: SibkoPool;
  readonly advanced: SibkoPool;
  readonly source: Stage0Source;
};

export type ChildhoodModule = {
  readonly stage: 1 | 2;
  readonly name: string;
  readonly description: string | null;
  readonly xpCost: number | null;
  readonly layer: Stage0Layer;
  readonly parametrizedGrants: {
    readonly language: number;
    readonly protocols: number;
    readonly streetwise: number;
  };
  readonly phenotypes: readonly string[];
  readonly casteLayers: readonly {
    readonly caste: string;
    readonly layer: Stage0Layer;
  }[];
  readonly flexPolicy: FlexPolicy | null;
  readonly sibkoBranches: readonly SibkoBranch[];
  readonly source: Stage0Source;
};

export type ChildhoodGate = {
  readonly stage: 1 | 2;
  readonly operation: "replace" | "remove";
  readonly modules: readonly string[];
  readonly source: Stage0Source;
  readonly when: {
    readonly affiliations: readonly string[];
    readonly subAffiliationIds?: readonly number[];
    readonly traitsAny?: {
      readonly names: readonly string[];
      readonly present: boolean;
    };
    readonly stage1Modules?: readonly string[];
  };
};

export type ChildhoodCatalog = {
  readonly modules: readonly ChildhoodModule[];
  readonly gates: readonly ChildhoodGate[];
  readonly affiliationSkills: readonly {
    readonly affiliation: string;
    readonly protocol: string;
    readonly streetwise: string;
    readonly source: Stage0Source;
  }[];
};
