import { mechSchema, MECH_LIMITS } from "./schema";
import {
  KNOWN_SLOT_LOCATIONS,
  type MechArmorValue,
  type MechData,
  type MechSlotSection,
  type MechWeapon,
} from "./types";

export type MtfParseResult =
  { ok: true; mech: MechData } | { ok: false; error: string };

// Whole-file cap, checked before splitting. Real catalog files are 1.5–7KB.
export const MTF_MAX_CHARS = 64 * 1024;

class MtfError extends Error {}

type Section =
  | { kind: "weapons" }
  | { kind: "slots"; slots: string[] }
  | { kind: "unknown" }
  | null;

function fail(message: string): never {
  throw new MtfError(message);
}

const clip = (value: string, max: number) => value.slice(0, max);

function wholeNumber(label: string, value: string): number {
  if (!/^\d{1,6}$/.test(value)) {
    fail(`${label} must be a whole number.`);
  }
  return Number(value);
}

/**
 * Parses a BattleTech `.mtf` mech file into `MechData`.
 *
 * Accepts the header variants seen in the catalog: a `Version:` line followed by
 * unlabeled chassis and model lines, or explicit `chassis:` / `model:` keys;
 * keys in any case with or without spaces (`walk mp:` / `Walk MP:`). Armor
 * (`LA Armor:6`), weapons (`Weapons:N` then `name, location[, detail]`), and
 * critical-slot sections (`Left Arm:` followed by one entry per line) are
 * modeled. Every other line is kept verbatim in `unsupported`. Blank lines end
 * a section; CRLF and LF are both accepted.
 *
 * Fails when the chassis or mass is missing, when a number is required but not
 * a whole number, or when the result fails `mechSchema`. Free-text values are
 * clipped to the schema's string caps; a collection beyond its cap moves its
 * extra lines to `unsupported`. `catalogFile` is always null here; the caller
 * sets provenance.
 */
export function parseMtf(text: unknown): MtfParseResult {
  if (typeof text !== "string") {
    return { ok: false, error: "Mech file must be text." };
  }
  if (text.length > MTF_MAX_CHARS) {
    return { ok: false, error: "Mech file is too large." };
  }

  try {
    const mech = parseLines(text);
    const parsed = mechSchema.safeParse(mech);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.join(".") || "mech";
      return {
        ok: false,
        error: `Invalid ${where}: ${issue?.message ?? "value rejected"}.`,
      };
    }
    return { ok: true, mech: parsed.data };
  } catch (error) {
    if (error instanceof MtfError) return { ok: false, error: error.message };
    throw error;
  }
}

function parseLines(text: string): MechData {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);

  const seen = new Set<string>();
  const once = (field: string) => {
    if (seen.has(field)) return false;
    seen.add(field);
    return true;
  };

  const out = {
    chassis: "",
    model: "",
    mulId: undefined as string | undefined,
    config: "",
    techBase: "",
    era: "",
    source: "",
    rulesLevel: "",
    mass: undefined as number | undefined,
    engine: "",
    structure: "",
    myomer: "",
    heatSinks: "",
    walkMP: 0,
    jumpMP: 0,
    armorType: "",
    armor: [] as MechArmorValue[],
    weapons: [] as MechWeapon[],
    criticalSlots: [] as MechSlotSection[],
    unsupported: [] as string[],
    catalogFile: null,
  };

  const keep = (line: string) => {
    if (out.unsupported.length >= MECH_LIMITS.unsupportedLines) {
      fail("Mech file has too many unrecognized lines.");
    }
    out.unsupported.push(clip(line, MECH_LIMITS.unsupportedLine));
  };

  let section: Section = null;
  // Unlabeled chassis/model lines are only valid in the header block (before the
  // first blank line), at most two of them.
  let inHeader = true;
  let positional = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      section = null;
      inHeader = false;
      continue;
    }

    if (section?.kind === "weapons") {
      const parts = line.split(",").map((part) => part.trim());
      const [name, location] = parts;
      if (
        out.weapons.length < MECH_LIMITS.weapons &&
        parts.length >= 2 &&
        name &&
        location
      ) {
        const detail = parts.slice(2).join(", ");
        out.weapons.push({
          name: clip(name, MECH_LIMITS.weaponName),
          location: clip(location, MECH_LIMITS.weaponLocation),
          ...(detail ? { detail: clip(detail, MECH_LIMITS.weaponDetail) } : {}),
        });
      } else {
        keep(line);
      }
      continue;
    }

    if (section?.kind === "slots") {
      if (section.slots.length < MECH_LIMITS.slotsPerSection) {
        section.slots.push(clip(line, MECH_LIMITS.slotEntry));
      } else {
        keep(line);
      }
      continue;
    }

    if (section?.kind === "unknown") {
      keep(line);
      continue;
    }

    const colon = line.indexOf(":");
    if (colon === -1) {
      if (inHeader && positional < 2) {
        if (positional === 0) out.chassis = clip(line, MECH_LIMITS.chassis);
        else out.model = clip(line, MECH_LIMITS.model);
        positional += 1;
      } else {
        keep(line);
      }
      continue;
    }

    const rawKey = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    const key = rawKey.toLowerCase().replace(/\s+/g, " ");

    if (value === "") {
      const slotName = KNOWN_SLOT_LOCATIONS.find(
        (name) => name.toLowerCase() === key,
      );
      if (slotName !== undefined) {
        if (out.criticalSlots.length < MECH_LIMITS.slotSections) {
          const slots: string[] = [];
          out.criticalSlots.push({ location: slotName, slots });
          section = { kind: "slots", slots };
        } else {
          keep(line);
          section = { kind: "unknown" };
        }
      } else if (key === "weapons") {
        section = { kind: "weapons" };
      } else {
        keep(line);
        section = { kind: "unknown" };
      }
      continue;
    }

    switch (key) {
      case "version":
        break;
      case "chassis":
        if (once("chassis")) out.chassis = clip(value, MECH_LIMITS.chassis);
        else keep(line);
        break;
      case "model":
        if (once("model")) out.model = clip(value, MECH_LIMITS.model);
        else keep(line);
        break;
      case "mul id":
        if (once("mulId")) out.mulId = clip(value, MECH_LIMITS.mulId);
        else keep(line);
        break;
      case "config":
        if (once("config")) out.config = clip(value, MECH_LIMITS.config);
        else keep(line);
        break;
      case "techbase":
        if (once("techBase")) out.techBase = clip(value, MECH_LIMITS.techBase);
        else keep(line);
        break;
      case "era":
        if (once("era")) out.era = clip(value, MECH_LIMITS.era);
        else keep(line);
        break;
      case "source":
        if (once("source")) out.source = clip(value, MECH_LIMITS.source);
        else keep(line);
        break;
      case "rules level":
        if (once("rulesLevel")) {
          out.rulesLevel = clip(value, MECH_LIMITS.rulesLevel);
        } else keep(line);
        break;
      case "mass":
        if (once("mass")) out.mass = wholeNumber("Mass", value);
        else keep(line);
        break;
      case "engine":
        if (once("engine")) out.engine = clip(value, MECH_LIMITS.engine);
        else keep(line);
        break;
      case "structure":
        if (once("structure")) {
          out.structure = clip(value, MECH_LIMITS.structure);
        } else keep(line);
        break;
      case "myomer":
        if (once("myomer")) out.myomer = clip(value, MECH_LIMITS.myomer);
        else keep(line);
        break;
      case "heat sinks":
        if (once("heatSinks")) {
          out.heatSinks = clip(value, MECH_LIMITS.heatSinks);
        } else keep(line);
        break;
      case "walk mp":
        if (once("walkMP")) out.walkMP = wholeNumber("Walk MP", value);
        else keep(line);
        break;
      case "jump mp":
        if (once("jumpMP")) out.jumpMP = wholeNumber("Jump MP", value);
        else keep(line);
        break;
      case "armor":
        if (once("armorType")) {
          out.armorType = clip(value, MECH_LIMITS.armorType);
        } else keep(line);
        break;
      case "weapons": {
        // `Weapons:N` declares a count; the entries follow as lines. The count
        // is validated but not trusted: the entries define the list.
        wholeNumber("Weapon count", value);
        section = { kind: "weapons" };
        break;
      }
      default: {
        const armor = /^([a-z]{1,4}) armor$/.exec(key);
        const code = armor?.[1];
        if (code !== undefined && !seen.has(`armor:${code}`)) {
          seen.add(`armor:${code}`);
          const armorValue = wholeNumber(`${code.toUpperCase()} armor`, value);
          if (out.armor.length < MECH_LIMITS.armorEntries) {
            out.armor.push({
              location: clip(code.toUpperCase(), MECH_LIMITS.armorLocation),
              value: armorValue,
            });
          } else {
            keep(line);
          }
        } else {
          keep(line);
        }
      }
    }
  }

  const mass = out.mass;
  if (!out.chassis || mass === undefined) {
    fail("Not a BattleTech mech file: missing chassis or mass.");
  }

  return {
    chassis: out.chassis,
    model: out.model,
    ...(out.mulId !== undefined ? { mulId: out.mulId } : {}),
    config: out.config,
    techBase: out.techBase,
    era: out.era,
    source: out.source,
    rulesLevel: out.rulesLevel,
    mass,
    engine: out.engine,
    structure: out.structure,
    myomer: out.myomer,
    heatSinks: out.heatSinks,
    walkMP: out.walkMP,
    jumpMP: out.jumpMP,
    armorType: out.armorType,
    armor: out.armor,
    weapons: out.weapons,
    criticalSlots: out.criticalSlots,
    unsupported: out.unsupported,
    catalogFile: null,
  };
}
