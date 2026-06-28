// Types for the `.btcc` character file format used by the C++/Qt desktop app.
//
// Ground truth: Battletech-Character-Creator/mainwindow.cpp
//   - prepSaveFile (serialization) ~lines 2285-2431
//   - openFile     (parsing)       ~lines 2037-2259
//
// A `.btcc` file is newline-delimited `key:value` lines, then a verbatim
// `<notes>…</notes>` block. The desktop persists only a subset of the in-memory
// model (wizard XP is recomputed, not stored). Our `BtccDraft` captures
// everything in the file so a parse → serialize round-trip is lossless, even
// for sections the MVP editor does not yet touch (equip/weapons/etc.).

/** An ordered (name, xp) row — used for skills, traits, pre-skills, pre-traits. */
export interface BtccRow {
  name: string;
  xp: number;
}

/**
 * The 21 scalar fields, in the exact order the desktop writes them.
 * `aff`/`subaff`/… store only the persisted name string; the paired XP shown in
 * the desktop wizard is recomputed and is NOT present in the file.
 */
export interface BtccScalars {
  name: string;
  aff: string;
  subaff: string;
  clancaste: string;
  earlychild: string;
  latechild: string;
  schoolname: string;
  basicschool: string;
  advschool: string;
  specschool: string;
  reallife: string;
  phenotype: string;
  nameplanet: string;
  sex: string;
  age: number;
  haircolor: string;
  eyecolor: string;
  height: number;
  weight: number;
  gmxpmod: number;
  cbillmod: number;
}

/** Scalar keys in desktop emit order — the single source of truth for ordering. */
export const SCALAR_KEYS = [
  "name",
  "aff",
  "subaff",
  "clancaste",
  "earlychild",
  "latechild",
  "schoolname",
  "basicschool",
  "advschool",
  "specschool",
  "reallife",
  "phenotype",
  "nameplanet",
  "sex",
  "age",
  "haircolor",
  "eyecolor",
  "height",
  "weight",
  "gmxpmod",
  "cbillmod",
] as const satisfies readonly (keyof BtccScalars)[];

/** Which scalar keys are integers (parsed via `.toInt()` semantics, default 0). */
export const NUMERIC_SCALAR_KEYS = new Set<keyof BtccScalars>([
  "age",
  "height",
  "weight",
  "gmxpmod",
  "cbillmod",
]);

/** A fully-parsed `.btcc` character. */
export interface BtccDraft {
  scalars: BtccScalars;
  /** `attr:` rows. Serialized alphabetically by key (desktop uses a QMap). */
  attrs: Record<string, number>;
  /** `skill:` rows, in file (insertion) order. */
  skills: BtccRow[];
  /** `trait:` rows, in file (insertion) order. */
  traits: BtccRow[];
  /** `equip:` rows — raw `;`-joined value strings, preserved verbatim. */
  equip: string[];
  /** `preattr:` rows. Serialized alphabetically; only positive values emitted. */
  preAttrs: Record<string, number>;
  /** `preskill:` rows, in file order. */
  preSkills: BtccRow[];
  /** `pretrait:` rows, in file order. */
  preTraits: BtccRow[];
  /** `equiploc:` rows. Serialized alphabetically; only non-empty values emitted. */
  equipLoc: Record<string, string>;
  /** `weapon:` rows — raw `;`-joined value strings, preserved verbatim. */
  weapons: string[];
  /** `chrweapon:` rows — equipped weapon names, in file order. */
  chrWeapons: string[];
  /** The verbatim body between `<notes>\n` and the final `\n</notes>`. */
  notes: string;
}

/** A complete, empty draft. Parsing starts from this so partial files fill in. */
export function emptyDraft(): BtccDraft {
  return {
    scalars: {
      name: "",
      aff: "",
      subaff: "",
      clancaste: "",
      earlychild: "",
      latechild: "",
      schoolname: "",
      basicschool: "",
      advschool: "",
      specschool: "",
      reallife: "",
      phenotype: "",
      nameplanet: "",
      sex: "",
      age: 0,
      haircolor: "",
      eyecolor: "",
      height: 0,
      weight: 0,
      gmxpmod: 0,
      cbillmod: 0,
    },
    attrs: {},
    skills: [],
    traits: [],
    equip: [],
    preAttrs: {},
    preSkills: [],
    preTraits: [],
    equipLoc: {},
    weapons: [],
    chrWeapons: [],
    notes: "",
  };
}
