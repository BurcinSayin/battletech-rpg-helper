// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { WizardClient } from "./wizard-client";
import { WIZARD_PAGES } from "./wizard-state";

afterEach(cleanup);

function pick(name: string, option: string) {
  const control = screen.getByRole("combobox", { name });
  const entry = within(control).getByRole("option", { name: option });
  fireEvent.change(control, { target: { value: entry.getAttribute("value") } });
}

function enterStage0() {
  render(<WizardClient />);
  fireEvent.change(screen.getByRole("textbox", { name: "Character name" }), {
    target: { value: "Lisa" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

function completeMajor() {
  pick("Affiliation", "Major Periphery State");
  pick("Sub-affiliation", "None");
  pick("Starting language", "English");
}

function completeClan() {
  pick("Affiliation", "Invading Clan");
  pick("Sub-affiliation", "None");
  pick("Starting language", "English");
  pick("Caste", "Laborer Caste");
  pick("Interests/Any", "Interests/Aerospace (skill)");
  pick("Career/Any", "Career/Accountant (skill)");
}

function expectMajorDraft() {
  const draft = within(screen.getByRole("region", { name: "Current draft" }));
  expect(draft.getByText("Draft XP remaining: 4220")).toBeTruthy();
  expect(draft.getByText("Wizard XP remaining: 4925")).toBeTruthy();
  expect(draft.getAllByText("Language/English: 20 XP")).toHaveLength(1);
  expect(draft.getByText("Perception: 10 XP")).toBeTruthy();
  expect(draft.getAllByText("Equipped: -50 XP")).toHaveLength(1);
}

describe("WizardClient shell", () => {
  it("renders the six §7.1 pages in declaration order, starting on Intro", () => {
    render(<WizardClient />);

    const nav = screen.getByRole("navigation", { name: "Wizard stages" });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items.map((li) => li.textContent)).toEqual(
      WIZARD_PAGES.map((p) => `${p.id}. ${p.title}`),
    );
    // Page 0 is the Intro page, marked as the current step.
    expect(items[0].getAttribute("aria-current")).toBe("step");
    expect(screen.getByLabelText("Character name")).toBeTruthy();
  });

  it("walks forward through all six pages; Finish is disabled on the last", () => {
    render(<WizardClient />);

    for (const p of WIZARD_PAGES.slice(1)) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      // Panel headers render as `// TITLE`.
      expect(
        screen.getByText(`// ${p.title}`, { selector: "h2" }),
      ).toBeTruthy();
      if (p.id === 1) completeMajor();
    }
    expect(
      screen.getByRole("button", { name: "Finish" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("disables Back on the Intro page (`wizard.cpp:30-33`)", () => {
    render(<WizardClient />);
    expect(
      screen.getByRole("button", { name: "Back" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("asks before going back and stays put when declined", () => {
    render(<WizardClient />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    // §7.3's confirmation box, text from `wizard.cpp:196`.
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toMatch(/later stages are lost/);

    fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen.getByText("// Stage 0 — Affiliation", { selector: "h2" }),
    ).toBeTruthy();
  });

  it("returns to the previous page when the back-warning is confirmed", () => {
    render(<WizardClient />);
    fireEvent.change(screen.getByLabelText("Character name"), {
      target: { value: "Lisa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    const nameInput = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Character name",
    });
    expect(nameInput.value).toBe("Lisa");
  });
});

describe("WizardClient Stage 0", () => {
  it("applies the issue XP oracle and actual grants when Major Periphery is completed", () => {
    // Given
    enterStage0();
    expect(screen.getByText("Draft XP remaining: 4190")).toBeTruthy();
    // When
    completeMajor();
    // Then: handwritten 800 attributes + 30 skills - 50 traits = 780 spent.
    expectMajorDraft();
    expect(screen.getByText("Module cost").parentElement?.textContent).toContain("75 XP");
    expect(screen.getByRole("status").textContent).toMatch(/^Stage 0 complete/);
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
  });

  it("cannot advance when Stage 0 is incomplete", () => {
    // Given
    enterStage0();
    const next = screen.getByRole("button", { name: "Next" });
    // When
    fireEvent.click(next);
    // Then
    expect(next.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("heading", { name: "// Stage 0 — Affiliation" })).toBeTruthy();
  });

  it("requires a caste and its choices when the affiliation is Clan", () => {
    // Given
    enterStage0();
    expect(screen.queryByRole("combobox", { name: "Caste" })).toBeNull();
    pick("Affiliation", "Invading Clan");
    pick("Sub-affiliation", "None");
    pick("Starting language", "English");
    expect(screen.getByRole("combobox", { name: "Caste" }).hasAttribute("required")).toBe(true);
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    // When
    completeClan();
    // Then
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Protocol/Clan: 25 XP")).toBeTruthy();
    expect(screen.getByText("Interests/Aerospace: 10 XP")).toBeTruthy();
    expect(screen.getByText("Reputation: -125 XP")).toBeTruthy();
  });

  it("requires both language positions when the Terran path has extra picks", () => {
    // Given: all but the second language position are filled.
    enterStage0();
    pick("Affiliation", "Terran");
    pick("Sub-affiliation", "None");
    pick("Starting language", "English");
    pick("+15 XP to any two other Language — 1 of 2", "French (skill)");
    pick("+50 XP each to any two Attributes — 1 of 2", "STR (attribute)");
    pick("+50 XP each to any two Attributes — 2 of 2", "RFL (attribute)");
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("Language/French: 15 XP")).toBeNull();
    // When
    pick("+15 XP to any two other Language — 2 of 2", "German (skill)");
    // Then
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Language/French: 15 XP")).toBeTruthy();
    expect(screen.getByText("Language/German: 15 XP")).toBeTruthy();
    expect(screen.getByText("Language/English: 45 XP")).toBeTruthy();
    expect(screen.getByText("Draft XP remaining: 4040")).toBeTruthy();
    expect(screen.getByText("Wizard XP remaining: 4760")).toBeTruthy();
  });

  it("removes obsolete caste, choices and effects when an ancestor is replaced", () => {
    // Given
    enterStage0();
    completeClan();
    // When
    pick("Affiliation", "Major Periphery State");
    // Then
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    for (const name of ["Sub-affiliation", "Starting language"]) {
      expect(within(screen.getByRole("combobox", { name })).getByRole("option", { selected: true }).getAttribute("value")).toBe("");
    }
    expect(screen.queryByText("Protocol/Clan: 25 XP")).toBeNull();
    expect(screen.queryByText("Interests/Aerospace: 10 XP")).toBeNull();
    expect(screen.queryByText("Reputation: -125 XP")).toBeNull();
    expect(screen.getByText("Draft XP remaining: 4190")).toBeTruthy();
    expect(screen.getByText("Wizard XP remaining: 5000")).toBeTruthy();
    expect(screen.getByText("Module cost").parentElement?.textContent).toContain("0 XP");
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  });

  it("preserves the complete selection and draft when Stay is chosen", () => {
    // Given
    enterStage0();
    completeClan();
    const values = screen.getAllByRole<HTMLSelectElement>("combobox").map((control) => control.value);
    const draft = screen.getByRole("region", { name: "Current draft" }).textContent;
    // When
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Stay" }));
    // Then
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getAllByRole<HTMLSelectElement>("combobox").map((control) => control.value)).toEqual(values);
    expect(screen.getByRole("region", { name: "Current draft" }).textContent).toBe(draft);
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
  });

  it("unwinds to the named baseline and avoids duplicate grants when re-entering", () => {
    // Given
    enterStage0();
    completeMajor();
    // When
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    // Then
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Character name" }).value).toBe("Lisa");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Draft XP remaining: 4190")).toBeTruthy();
    expect(screen.getByText("Wizard XP remaining: 5000")).toBeTruthy();
    expect(screen.queryByText("Equipped: -50 XP")).toBeNull();
    expect(screen.queryByText("Language/English: 20 XP")).toBeNull();
    for (const control of screen.getAllByRole("combobox")) {
      expect(within(control).getByRole("option", { selected: true }).getAttribute("value")).toBe("");
    }
    completeMajor();
    expectMajorDraft();
  });

  it("retains Stage 0 when returning from Early Childhood", () => {
    // Given
    enterStage0();
    completeMajor();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    // When
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    // Then
    expectMajorDraft();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
  });
});
