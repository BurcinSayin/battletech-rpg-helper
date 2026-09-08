export type Stage0Source = {
  readonly file: string;
  readonly line: number;
};

export type Stage0Candidate = {
  readonly kind: "attribute" | "skill" | "trait";
  readonly value: string;
};

export type Stage0ChoiceReference =
  | { readonly scope: "startingLanguage" }
  | { readonly scope: "base" | "layer"; readonly choiceId: string };

export type Stage0Choice = {
  readonly id: string;
  readonly label: string | null;
  readonly candidates: readonly Stage0Candidate[];
  readonly xp: number;
  readonly selectionCount: number;
  readonly unique: boolean;
  /** includeSelected replaces literals with referenced picks; excludeSelected filters the literal list. */
  readonly candidateSelection:
    | { readonly mode: "all" }
    | { readonly mode: "includeSelected" | "excludeSelected";
        readonly references: readonly Stage0ChoiceReference[] };
  readonly source: Stage0Source;
};

export type Stage0Grant = { readonly name: string; readonly xp: number };

export type Stage0Layer = {
  readonly attrDeltas: Readonly<Record<string, number>>;
  readonly skillGrants: readonly Stage0Grant[];
  readonly traitGrants: readonly Stage0Grant[];
  readonly prerequisites: {
    readonly attrs: Readonly<Record<string, number>>;
    readonly skills: readonly Stage0Grant[];
    readonly traits: readonly Stage0Grant[];
  };
  readonly choices: readonly Stage0Choice[];
  readonly source: Stage0Source;
};

export type Stage0Languages = {
  readonly mode: "base" | "subAffiliationOverride";
  readonly candidates: readonly string[];
  readonly source: Stage0Source;
};

export type Stage0SubAffiliation = {
  readonly id: number;
  readonly affiliationId: number;
  readonly name: string;
  readonly layer: Stage0Layer;
  readonly startingLanguages: Stage0Languages | null;
  readonly castes: readonly string[] | null;
  readonly source: Stage0Source;
};

export type Stage0Affiliation = {
  readonly id: number;
  readonly name: string;
  readonly xpCost: number;
  readonly startingLanguages: Stage0Languages;
  readonly casteRequired: boolean;
  readonly castes: readonly string[];
  readonly base: Stage0Layer;
  readonly subAffiliations: readonly Stage0SubAffiliation[];
  readonly source: Stage0Source;
};

export type Stage0Catalog = {
  readonly affiliations: readonly Stage0Affiliation[];
  readonly castes: readonly { readonly name: string; readonly layer: Stage0Layer }[];
  readonly overlays: readonly {
    readonly name: string;
    readonly xpCost: number;
    readonly base: Stage0Layer;
    readonly layer: Stage0Layer;
  }[];
};
