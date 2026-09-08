import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import subskills from "../data/rules/subskills.json";
import { extractStage0 } from "./extract-stage0";
import { sourceFunction, selectedStatements } from "./stage0-source";

const root = resolve(process.env.BTCC_SOURCE_DIR ?? fileURLToPath(new URL("../../Battletech-Character-Creator/resource", import.meta.url)), "..");
const read = (file: string): string => readFileSync(resolve(root, file), "latin1");

describe("strict Stage 0 source boundary", () => {
  it("rejects an unexpected labeled empty slot instead of hiding a newly broken source choice", () => {
    const text = read("text_resurce.cpp").replace(/subAffElem4More << [^\n]+;/, "subAffElem4More.clear();");
    const extract = () => extractStage0((file) => file === "text_resurce.cpp" ? text : read(file), subskills);
    expect(extract).toThrow(/text_resurce.cpp:\d+:.*Empty selectable choice: subAffElem4More/);
  });
  it("rejects an unsupported live statement with file and line when reading a temporary fixture", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "stage0-source-"));
    try {
      const text = read("text_resurce.cpp");
      const marker = 'affProtocol = "Protocol/FedSuns";';
      const line = text.slice(0, text.indexOf(marker)).split("\n").length;
      writeFileSync(resolve(directory, "text_resurce.cpp"), text.replace(marker, "unsupportedLiveGrant = 7;"), "latin1");
      const extract = () => extractStage0((file) => file === "text_resurce.cpp" ? readFileSync(resolve(directory, file), "latin1") : read(file), subskills);
      expect(extract).toThrow(`text_resurce.cpp:${line}: Unsupported Stage 0 source: unsupportedLiveGrant = 7;`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("ignores braces in comments when identifying function boundaries", () => {
    const fixture = 'void Text_Resurce::rSubAff(int affStrNum) {\n// } ignored\n/* { ignored */\naffAttr["WIL"] = 50;\n}';
    const statements = selectedStatements(sourceFunction(fixture, "rSubAff"), {});
    expect(statements).toEqual([{ code: 'affAttr["WIL"] = 50;', source: { file: "text_resurce.cpp", line: 4 } }]);
  });

  it("rejects orphan affiliation branches instead of silently losing active grants", () => {
    const text = read("text_resurce.cpp").replace('subAffList << "error!";', 'subAffList << "error!";\ncase 99: affAttr["WIL"] = 5; break;');
    const extract = () => extractStage0((file) => file === "text_resurce.cpp" ? text : read(file), subskills);
    expect(extract).toThrow(/text_resurce.cpp:\d+:.*affiliation/i);
  });

  it("rejects conflicting choice rates instead of arbitrarily picking one kind", () => {
    const text = read("text_resurce.cpp").replace('affElem1 << "Natural Aptitude/Protocol"', 'elem1XPSkills = 5; affElem1 << "Natural Aptitude/Protocol"');
    const extract = () => extractStage0((file) => file === "text_resurce.cpp" ? text : read(file), subskills);
    expect(extract).toThrow(/text_resurce.cpp:\d+:.*rate/i);
  });

  it("provides concrete candidates and resolvable earlier references for every required catalog choice", () => {
    const catalog = extractStage0(read, subskills);
    const layers = [
      ...catalog.affiliations.flatMap((affiliation) => [
        { base: affiliation.base, layer: affiliation.base },
        ...affiliation.subAffiliations.map(({ layer }) => ({ base: affiliation.base, layer })),
      ]),
      ...catalog.castes.map(({ layer }) => ({ base: layer, layer })),
      ...catalog.overlays.flatMap(({ base, layer }) => [{ base, layer: base }, { base, layer }]),
    ];
    for (const { base, layer } of layers) {
      for (const [index, choice] of layer.choices.entries()) {
        if (choice.selectionCount <= 0) continue;
        expect(choice.candidates.length, `${layer.source.line}/${choice.id}`).toBeGreaterThan(0);
        const selection = choice.candidateSelection;
        if (selection.mode === "all") continue;
        for (const reference of selection.references) {
          if (reference.scope === "startingLanguage") continue;
          const prior = reference.scope === "base" ? base.choices : layer.choices.slice(0, index);
          const referenced = prior.find(({ id }) => id === reference.choiceId);
          expect(referenced, `${choice.id} -> ${reference.choiceId}`).toBeDefined();
          expect(referenced?.candidates.length).toBeGreaterThan(0);
          if (selection.mode === "includeSelected") expect(referenced?.selectionCount).toBeGreaterThanOrEqual(choice.selectionCount);
        }
      }
    }
  });

  it("follows numeric dispatcher boundaries rather than spelling when classifying candidates", () => {
    const original = read("text_resurce.cpp");
    const text = original.replace('subAffElem4More << "STR"', 'subAffElem4More << "Language/Deliberately Misleading"');
    const catalog = extractStage0((file) => file === "text_resurce.cpp" ? text : read(file), subskills);
    const mixed = catalog.affiliations[3].subAffiliations[5].layer.choices.find(({ id }) => id === "subAffElem4More");
    expect(mixed?.candidates[0]).toEqual({ kind: "attribute", value: "Language/Deliberately Misleading" });
  });
});
