// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Stage0Catalog, Stage0Choice, Stage0Layer } from "@/lib/rules/stage0-contract";
import type { Stage0Selection } from "./wizard-stage0";
import { Stage0Panel, type Stage0PanelProps } from "./stage0-panel";

afterEach(cleanup);
const source = { file: "fixture", line: 1 } as const;
const english = { kind: "skill", value: "Language/English" } as const;
const french = { kind: "skill", value: "Language/French" } as const;
const trait = { kind: "trait", value: "Language/English" } as const;
const choice: Stage0Choice = { id: "languages", label: "Languages", candidates: [english, french, trait], xp: 15, selectionCount: 2, unique: true, candidateSelection: { mode: "all" }, source };
const layer: Stage0Layer = { attrDeltas: {}, skillGrants: [], traitGrants: [], prerequisites: { attrs: {}, skills: [], traits: [] }, choices: [], source };
const catalog: Stage0Catalog = {
  affiliations: [7, 9, 10].map((id) => ({
    id, name: id === 7 ? "Major Periphery" : `Clan ${id}`, xpCost: 75, source,
    startingLanguages: { mode: "base", candidates: [english.value], source },
    casteRequired: id !== 7, castes: ["Warrior", "Scientist"], base: layer,
    subAffiliations: [
      { id: 0, affiliationId: id, name: "None", layer, startingLanguages: null, castes: null, source },
      { id: 3, affiliationId: id, name: "Special", layer: { ...layer, choices: [choice] }, startingLanguages: { mode: "base", candidates: [french.value], source }, castes: ["Scientist"], source },
    ],
  })),
  castes: [{ name: "Warrior", layer }, { name: "Scientist", layer: { ...layer, choices: [{ ...choice, id: "research", label: "Research", selectionCount: 1 }] } }],
  overlays: [],
};
const selection: Stage0Selection = { affiliationId: 7, subAffiliationId: 0, casteId: null, startingLanguage: english.value, choices: [] };
function props(overrides: Partial<Stage0PanelProps> = {}): Stage0PanelProps {
  return { catalog, selection, complete: true, moduleCost: 75, wizardXpRemaining: 4925, draftXpRemaining: 4220,
    onAffiliationChange: vi.fn(), onSubAffiliationChange: vi.fn(), onStartingLanguageChange: vi.fn(), onCasteChange: vi.fn(), onChoiceChange: vi.fn(), ...overrides };
}
function select(name: string): HTMLSelectElement {
  const control = screen.getByRole("combobox", { name });
  if (!(control instanceof HTMLSelectElement)) throw new TypeError("Expected native select");
  return control;
}
function pick(name: string, option: string) {
  const control = select(name);
  const entry = within(control).getByRole("option", { name: option });
  fireEvent.change(control, { target: { value: entry.getAttribute("value") } });
}

describe("Stage0Panel", () => {
  it("renders the non-Clan path and separate controlled ledgers when complete", () => {
    // Given / When
    render(<Stage0Panel {...props()} />);
    // Then
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    expect(select("Affiliation").value).toBe("7");
    expect(select("Sub-affiliation").value).toBe("0");
    expect(select("Starting language").value).toBe(english.value);
    expect(screen.queryByRole("combobox", { name: "Caste" })).toBeNull();
    for (const [label, value] of [["Module cost", "75"], ["Wizard XP remaining", "4,925"], ["Draft XP remaining", "4,220"]]) {
      expect(screen.getByText(label).parentElement?.textContent).toContain(value);
    }
    expect(screen.getByRole("status").textContent).toContain("complete");
  });
  it("leaves required fields blank and explains missing values when unselected", () => {
    // Given / When
    render(<Stage0Panel {...props({ complete: false, selection: { ...selection, affiliationId: null, subAffiliationId: null, startingLanguage: null } })} />);
    // Then
    for (const control of screen.getAllByRole("combobox")) {
      expect(control.getAttribute("required")).not.toBeNull();
      expect(within(control).getByRole("option", { selected: true }).getAttribute("value")).toBe("");
    }
    expect(screen.getByRole("status").textContent).toMatch(/incomplete.*required/i);
  });
  it.each([9, 10])("shows caste for Clan %s with inherited options", (affiliationId) => {
    // Given / When
    render(<Stage0Panel {...props({ selection: { ...selection, affiliationId } })} />);
    // Then
    expect(within(select("Caste")).getByRole("option", { name: "Warrior" })).toBeTruthy();
    expect(select("Caste").value).toBe("");
  });
  it("uses child-specific language and caste lists when overridden", () => {
    // Given / When
    render(<Stage0Panel {...props({ selection: { ...selection, affiliationId: 9, subAffiliationId: 3, startingLanguage: null } })} />);
    // Then
    expect(within(select("Caste")).queryByRole("option", { name: "Warrior" })).toBeNull();
    expect(within(select("Caste")).getByRole("option", { name: "Scientist" })).toBeTruthy();
    expect(within(select("Starting language")).queryByRole("option", { name: "English" })).toBeNull();
    expect(within(select("Starting language")).getByRole("option", { name: "French" })).toBeTruthy();
  });
  it("exposes every repeated child choice and caste choice in layer order", () => {
    // Given / When
    render(<Stage0Panel {...props({ complete: false, selection: { ...selection, affiliationId: 9, subAffiliationId: 3, casteId: "Scientist" } })} />);
    // Then
    expect(screen.getAllByRole<HTMLSelectElement>("combobox").slice(4).map((control) => control.labels?.[0]?.textContent)).toEqual(["Languages — 1 of 2", "Languages — 2 of 2", "Research"]);
    expect(select("Languages — 1 of 2").value).toBe("");
    expect(select("Languages — 2 of 2").value).toBe("");
    expect(select("Languages — 2 of 2").disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toMatch(/incomplete.*choice/i);
  });
  it("disables only sibling identities when a unique position is selected", () => {
    // Given / When
    render(<Stage0Panel {...props({ selection: { ...selection, subAffiliationId: 3, choices: [{ layer: "subAffiliation", choiceId: choice.id, candidates: [english] }] } })} />);
    // Then
    expect(within(select("Languages — 1 of 2")).getByRole("option", { name: "English (skill)" }).hasAttribute("disabled")).toBe(false);
    expect(within(select("Languages — 2 of 2")).getByRole("option", { name: "English (skill)" }).hasAttribute("disabled")).toBe(true);
    expect(within(select("Languages — 2 of 2")).getByRole("option", { name: "English (trait)" }).hasAttribute("disabled")).toBe(false);
  });
  it.each([
    ["Affiliation", "Clan 9", "onAffiliationChange", 9],
    ["Sub-affiliation", "Special", "onSubAffiliationChange", 3],
    ["Starting language", "English", "onStartingLanguageChange", english.value],
    ["Caste", "Warrior", "onCasteChange", "Warrior"],
  ] as const)("emits exact %s identity without owning state", (name, option, callback, expected) => {
    // Given
    const input = props({ selection: { ...selection, affiliationId: 9, startingLanguage: null } });
    render(<Stage0Panel {...input} />);
    const previous = select(name).value;
    // When
    pick(name, option);
    // Then
    expect(input[callback]).toHaveBeenCalledWith(expected);
    expect(select(name).value).toBe(previous);
  });
  it("emits the full ordered exact candidate array when filling a second position", () => {
    // Given
    const input = props({ selection: { ...selection, subAffiliationId: 3, choices: [{ layer: "subAffiliation", choiceId: choice.id, candidates: [english] }] } });
    render(<Stage0Panel {...input} />);
    // When
    pick("Languages — 2 of 2", "English (trait)");
    // Then
    expect(input.onChoiceChange).toHaveBeenCalledWith({ layer: "subAffiliation", choiceId: "languages", candidates: [english, trait] });
  });
  it("preserves later picks when replacing an earlier position", () => {
    // Given
    const input = props({ selection: { ...selection, subAffiliationId: 3, choices: [{ layer: "subAffiliation", choiceId: choice.id, candidates: [english, trait] }] } });
    render(<Stage0Panel {...input} />);
    // When
    pick("Languages — 1 of 2", "French (skill)");
    // Then
    expect(input.onChoiceChange).toHaveBeenCalledWith({ layer: "subAffiliation", choiceId: "languages", candidates: [french, trait] });
  });
  it("clears the ordered suffix when a choice position is cleared", () => {
    // Given
    const input = props({ selection: { ...selection, subAffiliationId: 3, choices: [{ layer: "subAffiliation", choiceId: choice.id, candidates: [english, french] }] } });
    render(<Stage0Panel {...input} />);
    // When
    fireEvent.change(select("Languages — 1 of 2"), { target: { value: "" } });
    // Then
    expect(input.onChoiceChange).toHaveBeenCalledWith({ layer: "subAffiliation", choiceId: "languages", candidates: [] });
  });
  it.each(["includeSelected", "excludeSelected"] as const)("uses resolved %s dependencies for base choices", (mode) => {
    // Given
    const dependent = { ...choice, selectionCount: 1, candidateSelection: { mode, references: [{ scope: "startingLanguage" }] } } satisfies Stage0Choice;
    const input = props({ catalog: { ...catalog, affiliations: catalog.affiliations.map((entry) => ({ ...entry, base: { ...layer, choices: [dependent] } })) } });
    // When
    render(<Stage0Panel {...input} />);
    // Then
    const values = Array.from(select("Languages").options).map((option) => option.textContent);
    expect(values).toEqual(mode === "includeSelected" ? ["Choose…", "English (skill)"] : ["Choose…", "French (skill)", "English (trait)"]);
  });
  it("keeps unresolved language overrides incomplete without sentinel options", () => {
    // Given
    const input = props({ complete: false, catalog: { ...catalog, affiliations: catalog.affiliations.map((entry) => ({ ...entry, startingLanguages: { mode: "subAffiliationOverride", candidates: ["Use sub-Affilation"], source } })) } });
    // When
    render(<Stage0Panel {...input} />);
    // Then
    expect(select("Starting language").options).toHaveLength(1);
    expect(screen.getByText(/no starting languages/i)).toBeTruthy();
  });
  it("keeps ids unique across instances and stable across controlled renders", () => {
    // Given
    const input = props();
    const view = render(<><Stage0Panel {...input} /><Stage0Panel {...input} /></>);
    const ids = screen.getAllByRole("combobox").map((control) => control.id);
    // When
    view.rerender(<><Stage0Panel {...input} complete={false} /><Stage0Panel {...input} /></>);
    // Then
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getAllByRole("combobox").map((control) => control.id)).toEqual(ids);
  });
  it.each(["base", "caste"] as const)("emits the exact %s slot identity when selected", (targetLayer) => {
    // Given
    const input = props({ selection: { ...selection, affiliationId: 9, casteId: "Scientist" }, catalog: { ...catalog, affiliations: catalog.affiliations.map((entry) => ({ ...entry, base: { ...layer, choices: [{ ...choice, label: "Base language", selectionCount: 1 }] } })) } });
    render(<Stage0Panel {...input} />);
    // When
    pick(targetLayer === "base" ? "Base language" : "Research", "French (skill)");
    // Then
    expect(input.onChoiceChange).toHaveBeenCalledWith({ layer: targetLayer, choiceId: targetLayer === "base" ? "languages" : "research", candidates: [french] });
  });
  it.each([
    ["Affiliation", "onAffiliationChange"], ["Sub-affiliation", "onSubAffiliationChange"],
    ["Starting language", "onStartingLanguageChange"], ["Caste", "onCasteChange"],
  ] as const)("emits null when %s is cleared", (name, callback) => {
    // Given
    const input = props({ selection: { ...selection, affiliationId: 9, casteId: "Warrior" } });
    render(<Stage0Panel {...input} />);
    // When
    fireEvent.change(select(name), { target: { value: "" } });
    // Then
    expect(input[callback]).toHaveBeenCalledWith(null);
  });
  it("allows repeated candidates when the catalog slot is not unique", () => {
    // Given
    const input = props({ selection: { ...selection, choices: [{ layer: "base", choiceId: choice.id, candidates: [english] }] }, catalog: { ...catalog, affiliations: catalog.affiliations.map((entry) => ({ ...entry, base: { ...layer, choices: [{ ...choice, unique: false }] } })) } });
    render(<Stage0Panel {...input} />);
    // When
    pick("Languages — 2 of 2", "English (skill)");
    // Then
    expect(within(select("Languages — 2 of 2")).getByRole("option", { name: "English (skill)" }).hasAttribute("disabled")).toBe(false);
    expect(input.onChoiceChange).toHaveBeenCalledWith({ layer: "base", choiceId: choice.id, candidates: [english, english] });
  });
  it("renders base, child and caste slots in order without calling selection callbacks", () => {
    // Given
    const input = props({ selection: { ...selection, affiliationId: 9, subAffiliationId: 3, casteId: "Scientist" }, catalog: { ...catalog, affiliations: catalog.affiliations.map((entry) => ({ ...entry, base: { ...layer, choices: [{ ...choice, label: "Base language", selectionCount: 1 }] } })) } });
    // When
    render(<Stage0Panel {...input} />);
    // Then
    expect(screen.getAllByRole<HTMLSelectElement>("combobox").slice(4).map((control) => control.labels?.[0]?.textContent)).toEqual(["Base language", "Languages — 1 of 2", "Languages — 2 of 2", "Research"]);
    for (const callback of [input.onAffiliationChange, input.onSubAffiliationChange, input.onStartingLanguageChange, input.onCasteChange, input.onChoiceChange]) expect(callback).not.toHaveBeenCalled();
    select("Base language").focus();
    expect(document.activeElement).toBe(select("Base language"));
  });
});
