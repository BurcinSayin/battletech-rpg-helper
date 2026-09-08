import { describe, expect, it } from "vitest";
import type { Stage0Catalog } from "../lib/rules/stage0-contract";
import subskills from "../data/rules/subskills.json";

export function stage0Cases(extract: () => Stage0Catalog): void {
  describe("layered Stage 0 source contract", () => {
    it("emits only selectable Marian slots when the second desktop control has no items", () => {
      const choices = extract().affiliations[7].subAffiliations[3].layer.choices;
      // text_resurce.cpp:1372-1382; wizard.cpp:426-432; s0moredialog.cpp:83-97.
      expect(choices).toMatchObject([
        { id: "subAffElem1More", xp: 15 },
        { id: "subAffElem3More", xp: 15 },
      ]);
      expect(choices.map(({ candidates }) => candidates.length)).toEqual([8, 16]);
    });
    it("keeps all 13 affiliations in catalog order when switches are reordered", () => {
      const catalog = extract();
      expect(catalog.affiliations.map(({ id, name }) => [id, name])).toEqual([
        [0, "Federated Suns"], [1, "Cappelan Confederation"],
        [2, "Draconis Combine"], [3, "Free Worlds League"],
        [4, "Lyran Alliance"], [5, "Free Rasalhague Republic"],
        [6, "Minor Periphery"], [7, "Major Periphery State"],
        [8, "Deep Periphery"], [9, "Invading Clan"],
        [10, "Homeworld Clan"], [11, "Terran"], [12, "Independent"],
      ]);
    });

    it("keeps grants and prerequisites in the base layer when extracting Federated Suns", () => {
      const affiliation = extract().affiliations[0];
      expect(affiliation).toMatchObject({
        xpCost: 150, source: { file: "resource/affilations.dat", line: 1 },
        base: {
          attrDeltas: {}, traitGrants: [],
          skillGrants: [{ name: "Protocol/FedSuns", xp: 10 }],
          prerequisites: { attrs: { INT: 400 }, skills: [], traits: [] },
          source: { file: "text_resurce.cpp", line: 127 },
        },
      });
      expect(affiliation.base.choices).toMatchObject([{
        id: "affElem1", label: "Choose Natural Aptitude", xp: 100,
        selectionCount: 1, unique: true,
        candidates: [
          { kind: "trait", value: "Natural Aptitude/Protocol" },
          { kind: "trait", value: "Natural Aptitude/Strategy" },
        ],
      }]);
    });

    it("preserves signed active grants and exact spellings when comments disagree", () => {
      const catalog = extract();
      expect(catalog.affiliations[1].base.traitGrants[0]).toEqual({ name: "Except Attribute/EDG", xp: 100 });
      expect(catalog.affiliations[11].base.attrDeltas).toEqual({ INT: 100, EDG: -150 });
      expect(catalog.affiliations[7].base.traitGrants).toEqual([{ name: "Equipped", xp: -50 }]);
      expect(catalog.affiliations[7].xpCost).toBe(75);
    });

    it("uses only source parents when extracting sub-affiliations", () => {
      const catalog = extract();
      for (const affiliation of catalog.affiliations) {
        expect(affiliation.subAffiliations[0]).toMatchObject({ id: 0, name: "None" });
        for (const [id, child] of affiliation.subAffiliations.entries()) {
          expect(child).toMatchObject({ id, affiliationId: affiliation.id });
        }
      }
      expect(catalog.affiliations[0].subAffiliations[1]).toMatchObject({
        name: "Capellan March", layer: {
          attrDeltas: { WIL: 40 }, source: { file: "text_resurce.cpp", line: 557 },
          choices: [{ id: "subAffElem1", label: "Language/Choose one", xp: 5 }],
        },
      });
    });

    it("resolves sentinel languages through sub-affiliations instead of offering a sentinel", () => {
      const catalog = extract();
      for (const id of [8, 12]) {
        expect(catalog.affiliations[id].startingLanguages).toMatchObject({ mode: "subAffiliationOverride", candidates: [] });
      }
      expect(catalog.affiliations[8].subAffiliations[1].startingLanguages).toMatchObject({
        candidates: ["Language/German", "Language/English"],
      });
      expect(catalog.affiliations[7].subAffiliations[1].startingLanguages).toMatchObject({
        candidates: ["Language/English", "Language/German", "Language/Spanish"],
      });
    });

    it("keeps a mixed source slot as one selection when dispatching Other FWL Worlds", () => {
      const mixed = extract().affiliations[3].subAffiliations[5].layer.choices.find((choice) => choice.id === "subAffElem4More");
      expect(mixed).toMatchObject({ selectionCount: 1, xp: 25,
        label: "to any one Attribute, Trait, or Lang Skill",
        source: { file: "text_resurce.cpp", line: 918 },
      });
      expect(mixed?.candidates[7].kind).toBe("attribute");
      expect(mixed?.candidates[8].kind).toBe("trait");
      expect(mixed?.candidates[63].kind).toBe("trait");
      expect(mixed?.candidates[64].kind).toBe("skill");
    });

    it("keeps dependent literal candidates and earlier choice references for Terran penalties", () => {
      const terran = extract().affiliations[11];
      expect(terran.base.choices).toMatchObject([
        { id: "affElem1", xp: 15, selectionCount: 2, unique: true },
        { id: "affElem2", xp: 50, selectionCount: 2, unique: true },
      ]);
      for (const id of [3, 6]) {
        expect(terran.subAffiliations[id].layer.choices[0]).toMatchObject({
          id: "subAffElem1", xp: -10, candidates: [{ kind: "skill", value: "Language/English" }],
          candidateSelection: { mode: "includeSelected", references: [{ scope: "base", choiceId: "affElem1" }] },
        });
      }
    });

    it("separates Clan base layers from source-ordered caste layers and restrictions", () => {
      const catalog = extract();
      expect(catalog.castes).toHaveLength(11);
      for (const id of [9, 10]) {
        expect(catalog.affiliations[id]).toMatchObject({ casteRequired: true, base: { choices: [] } });
        expect(catalog.affiliations[id].castes).toEqual(catalog.castes.map(({ name }) => name));
      }
      expect(catalog.affiliations[9].xpCost).toBe(75);
      expect(catalog.affiliations[10].xpCost).toBe(50);
      expect(catalog.affiliations[9].subAffiliations[2].castes).toContain("Elemental-Advanced");
      expect(catalog.affiliations[9].subAffiliations[2].castes).not.toContain("Aerospace");
    });

    it("expands the existing subskills catalog when extracting Scientist and Merchant choices", () => {
      const catalog = extract();
      const scientist = catalog.castes.find(({ name }) => name === "Scientist Caste");
      const merchant = catalog.castes.find(({ name }) => name === "Merchant Caste");
      expect(scientist?.layer).toMatchObject({ attrDeltas: { STR: -50, INT: 100 }, skillGrants: [],
        choices: [{ label: "Interests/Any", xp: 10 }, { label: "Science/Any", xp: 15 }],
      });
      expect(scientist?.layer.choices[1].candidates).toEqual(subskills.Science.map((value) => `Science/${value}`).sort().map((value) => ({ kind: "skill", value })));
      expect(merchant?.layer.choices[0]).toMatchObject({ id: "subAffElem3", label: "Protocol/Any", xp: 10 });
    });

    it("keeps optional overlay base and branch grants separate when extracting ComStar and WoB", () => {
      const overlays = extract().overlays;
      expect(overlays.map(({ name }) => name)).toEqual(["ComStar", "Word of Blake"]);
      expect(overlays[0]).toMatchObject({ xpCost: 50, base: {
        source: { file: "text_resurce.cpp", line: 424 },
        choices: [{ id: "comElem", xp: 10 }],
      }, layer: { attrDeltas: { INT: 25, WIL: -15 }, source: { file: "text_resurce.cpp", line: 456 } } });
      expect(overlays[1].layer.attrDeltas).toEqual({ WIL: 50, CHA: -50 });
      expect(overlays[0].base.traitGrants[0]).toEqual({ name: "Enemy", xp: -100 });
    });
  });
}
