// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
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

function expectBalances(draftXp: number, wizardXp: number) {
  const balances = within(screen.getByRole("region", { name: "XP balances" }));
  expect(balances.getByText(`Draft XP remaining: ${draftXp} XP`)).toBeTruthy();
  expect(
    balances.getByText(`Wizard XP remaining: ${wizardXp} XP`),
  ).toBeTruthy();
}

function completeStreet() {
  pick("Stage 1 module", "Street");
  for (let position = 1; position <= 4; position++)
    pick(`Module choice ${position}`, "STR (attribute)");
}

function enterStage2() {
  enterStage0();
  completeMajor();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  completeStreet();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  pick("Stage 2 module", "Back Woods");
}

function expectFlexRemaining(xp: number) {
  const flex = within(screen.getByRole("region", { name: "Stage 2 flex XP" }));
  expect(flex.getByText("Flex remaining").parentElement?.textContent).toContain(
    `${xp} XP`,
  );
}

function expectMajorDraft() {
  const draft = within(screen.getByRole("region", { name: "Current draft" }));
  expectBalances(4220, 4925);
  expect(draft.getAllByText("Language/English: 20 XP")).toHaveLength(1);
  expect(draft.getByText("Perception: 10 XP")).toBeTruthy();
  expect(draft.getAllByText("Equipped: -50 XP")).toHaveLength(1);
}

describe("WizardClient School and Real Life", () => {
  function enterSchool() {
    enterStage2();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }

  it("renders school field charges, gates unfinished picks, and credits the rebate on Next", () => {
    enterSchool();
    pick("School", "Technical College");
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Next" }).disabled,
    ).toBe(true);
    pick("Interests/Any — choice 1", "Interests/Aerospace (skill)");
    pick("Basic field", "Pilot - Aerospace (Civilian)");
    expect(
      screen.getByText(
        "School charges applied: 780 XP. Rebate on entering Stage 4: 36 XP.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Next" }).disabled,
    ).toBe(false);
    const balance = screen.getByRole("region", {
      name: "XP balances",
    }).textContent;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("combobox", { name: "Real Life module" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Go back",
      }),
    );
    expect(
      screen.getByRole("region", { name: "XP balances" }).textContent,
    ).toBe(balance);
  });

  it("skips both stages and clears school selection effects", () => {
    enterSchool();
    const balance = screen.getByRole("region", {
      name: "XP balances",
    }).textContent;
    pick("School", "Police Academy");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip School" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen.getByRole("region", { name: "XP balances" }).textContent,
    ).toBe(balance);
    fireEvent.click(screen.getByRole("button", { name: "Skip Real Life" }));
    expect(screen.getByRole("status").textContent).toBe(
      "Stage 4 skipped. Your lifepath ends after Late Childhood.",
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Finish" })
        .disabled,
    ).toBe(true);
  });

  it("adds multiple Real Life modules, excludes committed modules, and refunds removed modules", () => {
    enterSchool();
    fireEvent.click(screen.getByRole("button", { name: "Skip School" }));
    const balance = screen.getByRole("region", {
      name: "XP balances",
    }).textContent;
    pick("Real Life module", "Travel");
    expect(
      screen.getByRole("region", { name: "XP balances" }).textContent,
    ).toBe(balance);
    fireEvent.click(
      screen.getByRole("button", { name: "Add Real Life module" }),
    );
    expect(
      within(
        screen.getByRole("combobox", { name: "Real Life module" }),
      ).queryByRole("option", { name: "Travel" }),
    ).toBeNull();
    pick("Real Life module", "Civilian Job");
    fireEvent.click(
      screen.getByRole("button", { name: "Add Real Life module" }),
    );
    const completed = screen.getByRole("region", {
      name: "Completed Real Life modules",
    });
    expect(within(completed).getAllByRole("listitem")).toHaveLength(2);
    expect(
      within(screen.getByRole("region", { name: "Current draft" })).getByText(
        "Age: 28",
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Travel and later modules" }),
    );
    expect(
      screen.queryByRole("region", { name: "Completed Real Life modules" }),
    ).toBeNull();
    expect(
      screen.getByRole("region", { name: "XP balances" }).textContent,
    ).toBe(balance);
  });
});

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
      if (p.id === 2) completeStreet();
      if (p.id === 3) pick("Stage 2 module", "Back Woods");
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

    const dialog = screen.getByRole("alertdialog");

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
    expectBalances(4190, 5000);
    // When
    completeMajor();
    // Then: handwritten 800 attributes + 30 skills - 50 traits = 780 spent.
    expectMajorDraft();
    expect(
      screen.getByText("Module cost").parentElement?.textContent,
    ).toContain("75 XP");
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("cannot advance when Stage 0 is incomplete", () => {
    // Given
    enterStage0();
    const next = screen.getByRole("button", { name: "Next" });
    // When
    fireEvent.click(next);
    // Then
    expect(next.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("heading", { name: "// Stage 0 — Affiliation" }),
    ).toBeTruthy();
  });

  it("requires a caste and its choices when the affiliation is Clan", () => {
    // Given
    enterStage0();
    expect(screen.queryByRole("combobox", { name: "Caste" })).toBeNull();
    pick("Affiliation", "Invading Clan");
    pick("Sub-affiliation", "None");
    pick("Starting language", "English");
    expect(
      screen.getByRole("combobox", { name: "Caste" }).hasAttribute("required"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
    // When
    completeClan();
    // Then
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false);
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
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByText("Language/French: 15 XP")).toBeNull();
    // When
    pick("+15 XP to any two other Language — 2 of 2", "German (skill)");
    // Then
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.getByText("Language/French: 15 XP")).toBeTruthy();
    expect(screen.getByText("Language/German: 15 XP")).toBeTruthy();
    expect(screen.getByText("Language/English: 45 XP")).toBeTruthy();
    expectBalances(4040, 4760);
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
      expect(
        within(screen.getByRole("combobox", { name }))
          .getByRole("option", { selected: true })
          .getAttribute("value"),
      ).toBe("");
    }
    expect(screen.queryByText("Protocol/Clan: 25 XP")).toBeNull();
    expect(screen.queryByText("Interests/Aerospace: 10 XP")).toBeNull();
    expect(screen.queryByText("Reputation: -125 XP")).toBeNull();
    expectBalances(4190, 5000);
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("preserves the complete selection and draft when Stay is chosen", () => {
    // Given
    enterStage0();
    completeClan();
    const values = screen
      .getAllByRole<HTMLSelectElement>("combobox")
      .map((control) => control.value);
    const draft = screen.getByRole("region", {
      name: "Current draft",
    }).textContent;
    // When
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Stay",
      }),
    );
    // Then
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen
        .getAllByRole<HTMLSelectElement>("combobox")
        .map((control) => control.value),
    ).toEqual(values);
    expect(
      screen.getByRole("region", { name: "Current draft" }).textContent,
    ).toBe(draft);
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("unwinds to the named baseline and avoids duplicate grants when re-entering", () => {
    // Given
    enterStage0();
    completeMajor();
    // When
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    // Then
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Character name" })
        .value,
    ).toBe("Lisa");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expectBalances(4190, 5000);
    expect(screen.queryByText("Equipped: -50 XP")).toBeNull();
    expect(screen.queryByText("Language/English: 20 XP")).toBeNull();
    for (const control of screen.getAllByRole("combobox")) {
      expect(
        within(control)
          .getByRole("option", { selected: true })
          .getAttribute("value"),
      ).toBe("");
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
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false);
  });
});

describe("WizardClient childhood flow", () => {
  it("blocks both childhood pages until their required selections are complete", () => {
    enterStage0();
    completeMajor();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
    pick("Stage 1 module", "Street");
    expect(
      screen.queryByRole("region", { name: "Stage 2 flex XP" }),
    ).toBeNull();
    expectBalances(4220, 4925);
    for (let position = 1; position <= 4; position++) {
      expect(
        screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
      ).toBe(true);
      pick(`Module choice ${position}`, "STR (attribute)");
      if (position < 4) expectBalances(4220, 4925);
    }
    expectBalances(4020, 4675);
    expect(
      within(screen.getByRole("region", { name: "Current draft" })).getByText(
        "Perception: 20 XP",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
    const modules = within(
      screen.getByRole("combobox", { name: "Stage 2 module" }),
    );
    for (const name of [
      "High School",
      "Preparatory School",
      "Clan Apprenticeship",
      "Freeborn Sibko",
      "Trueborn Sibko",
    ]) {
      expect(modules.queryByRole("option", { name })).toBeNull();
    }
    pick("Stage 2 module", "Back Woods");
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(false);
    expectBalances(3615, 4175);
    expectFlexRemaining(125);
  });

  it("validates replacement flex edits and refunds without erasing static XP", () => {
    enterStage2();
    pick("Flex skill target", "Perception");
    const input = screen.getByRole<HTMLInputElement>("spinbutton", {
      name: "Perception flex XP",
    });
    fireEvent.change(input, { target: { value: "35" } });
    fireEvent.blur(input);
    expectBalances(3580, 4175);
    expectFlexRemaining(90);
    expect(
      within(screen.getByRole("region", { name: "Current draft" })).getByText(
        "Perception: 100 XP",
      ),
    ).toBeTruthy();
    fireEvent.change(input, { target: { value: "3" } });
    expectBalances(3580, 4175);
    fireEvent.change(input, { target: { value: "36" } });
    fireEvent.blur(input);
    expect(input.value).toBe("35");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert")).toBeTruthy();
    expectBalances(3580, 4175);
    expectFlexRemaining(90);
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.blur(input);
    expect(input.value).toBe("20");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expectBalances(3595, 4175);
    expectFlexRemaining(105);
    expect(
      within(screen.getByRole("region", { name: "Current draft" })).getByText(
        "Perception: 85 XP",
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Perception flex allocation" }),
    );
    expectBalances(3615, 4175);
    expectFlexRemaining(125);
    expect(
      within(screen.getByRole("region", { name: "Current draft" })).getByText(
        "Perception: 65 XP",
      ),
    ).toBeTruthy();
  });

  it("keeps Stay intact and unwinds Stage 2 exactly once on confirmed Back", () => {
    enterStage2();
    pick("Flex skill target", "Perception");
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Perception flex XP" }),
      { target: { value: "35" } },
    );
    fireEvent.blur(
      screen.getByRole("spinbutton", { name: "Perception flex XP" }),
    );
    const draft = screen.getByRole("region", {
      name: "Current draft",
    }).textContent;
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Stay",
      }),
    );
    expect(
      screen.getByRole("region", { name: "Current draft" }).textContent,
    ).toBe(draft);
    expectBalances(3580, 4175);
    expectFlexRemaining(90);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Go back",
      }),
    );
    expect(
      screen.getByRole("combobox", { name: "Stage 1 module" }),
    ).toBeTruthy();
    expectBalances(4020, 4675);
    expect(
      within(screen.getByRole("region", { name: "Current draft" })).getByText(
        "Perception: 20 XP",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Stage 2 flex XP" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    pick("Stage 2 module", "Back Woods");
    expectBalances(3615, 4175);
    expectFlexRemaining(125);
    pick("Flex skill target", "Perception");
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Perception flex XP" }),
      { target: { value: "35" } },
    );
    fireEvent.blur(
      screen.getByRole("spinbutton", { name: "Perception flex XP" }),
    );
    expectBalances(3580, 4175);
    expectFlexRemaining(90);
  });

  it("clears old flex on module replacement and disables restricted categories", () => {
    enterStage2();
    fireEvent.change(screen.getByRole("spinbutton", { name: "STR flex XP" }), {
      target: { value: "100" },
    });
    fireEvent.blur(screen.getByRole("spinbutton", { name: "STR flex XP" }));
    pick("Stage 2 module", "Military School");
    expectBalances(4020, 4675);
    expect(
      screen
        .getByRole("spinbutton", { name: "STR flex XP" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("combobox", { name: "Flex trait target" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("combobox", { name: "Flex skill target" })
        .hasAttribute("disabled"),
    ).toBe(true);
    pick("Interests/Any", "Interests/Aerospace (skill)");
    expect(
      screen
        .getByRole("combobox", { name: "Flex skill target" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen
        .getByRole("spinbutton", { name: "STR flex XP" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>("spinbutton", { name: "STR flex XP" })
        .value,
    ).toBe("0");
    pick("Stage 2 module", "Back Woods");
    expectBalances(3615, 4175);
    expectFlexRemaining(125);
  });

  it("shows the Clan rebate only after entering Stage 3 and reverses it on Back", () => {
    enterStage0();
    completeClan();
    pick("Sub-affiliation", "Ghost Bear");
    pick("Art/Any", "Art/Dance (skill)");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    pick("Stage 1 module", "Trueborn Creche");
    pick("Stage 1 phenotype", "Phenotype/Elemental");
    pick("Module choice main:4", "STR (attribute)");
    for (let position = 1; position <= 4; position++)
      pick(`Module choice ${position}`, "STR (attribute)");
    expect(
      screen.queryByRole("region", { name: "Stage 2 flex XP" }),
    ).toBeNull();
    const balances =
      screen.getByRole("region", { name: "XP balances" }).textContent ?? "";
    const draftXp = Number(
      balances.match(/Draft XP remaining: (-?\d+) XP/)?.[1],
    );
    const wizardXp = Number(
      balances.match(/Wizard XP remaining: (-?\d+) XP/)?.[1],
    );
    expect(Number.isFinite(draftXp) && Number.isFinite(wizardXp)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    pick("Stage 2 module", "Freeborn Sibko");
    expect(
      screen.getByRole("button", { name: "Next" }).hasAttribute("disabled"),
    ).toBe(true);
    pick("Sibko branch", "Aerospace");
    const basic = screen.getAllByRole<HTMLSelectElement>("combobox", {
      name: /^Basic field — /,
    });
    const advanced = screen.getAllByRole<HTMLSelectElement>("combobox", {
      name: /^Advanced field — /,
    });
    expect(basic).toHaveLength(6);
    expect(advanced).toHaveLength(5);
    for (const control of [...basic, ...advanced]) {
      const option = within(control)
        .getAllByRole<HTMLOptionElement>("option")
        .find((entry) => entry.value !== "");
      if (!option) throw new TypeError("Missing field option");
      fireEvent.change(control, { target: { value: option.value } });
    }
    fireEvent.change(screen.getByRole("spinbutton", { name: "STR flex XP" }), {
      target: { value: "100" },
    });
    fireEvent.blur(screen.getByRole("spinbutton", { name: "STR flex XP" }));
    pick("Flex trait target", "Vehicle");
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Vehicle flex XP" }),
      { target: { value: "100" } },
    );
    fireEvent.blur(screen.getByRole("spinbutton", { name: "Vehicle flex XP" }));
    expectBalances(draftXp - 1030, wizardXp - 950);
    expectFlexRemaining(0);
    expect(
      screen
        .getByRole("combobox", { name: "Flex skill target" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("spinbutton", { name: "STR flex XP" })
        .hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("heading", { name: "// Stage 3 — School" }),
    ).toBeTruthy();
    expectBalances(draftXp - 1030, wizardXp - 864);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Go back",
      }),
    );
    expectBalances(draftXp - 1030, wizardXp - 950);
    expectFlexRemaining(0);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expectBalances(draftXp - 1030, wizardXp - 864);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Go back",
      }),
    );
    pick("Sibko branch", "Cavalry");
    expect(
      screen.getByRole<HTMLInputElement>("spinbutton", { name: "STR flex XP" })
        .value,
    ).toBe("0");
    expectFlexRemaining(200);
    pick("Advanced field — cavalry-2", "Driving/Sea Vehicles");
    const driving = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "Advanced field — cavalry-2",
    });
    expect(
      within(driving)
        .getAllByRole("option", { selected: true })
        .map((option) => option.textContent),
    ).toEqual(["Driving/Sea Vehicles"]);
    fireEvent.change(driving, { target: { value: "" } });
    pick("Advanced field — cavalry-2", "Driving/Rail Vehicles");
    pick("Stage 2 module", "Trueborn Sibko");
    const branches = within(
      screen.getByRole("combobox", { name: "Sibko branch" }),
    );
    expect(
      branches.getByRole("option", { name: "Elemental (Advanced)" }),
    ).toBeTruthy();
    expect(
      branches.queryByRole("option", { name: "ProtoMech (Advanced)" }),
    ).toBeNull();
  });
});

describe("WizardClient Stage 4 advanced dialog", () => {
  // jsdom has no native dialog lifecycle; the browser check covers modal focus.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
  });
  afterAll(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  });
  function enterLife() {
    enterStage2();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip School" }));
    pick("Real Life module", "Travel");
  }
  it("applies defaults once, unwinds on reopen/cancel, and edits a committed module", () => {
    enterLife();
    const balances = screen.getByRole("region", {
      name: "XP balances",
    }).textContent;
    fireEvent.click(screen.getByRole("button", { name: "Advanced choices" }));
    expect(
      screen.getByRole("dialog", { name: "Travel — Advanced choices" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Apply advanced choices" }),
    );
    const draft = within(screen.getByRole("region", { name: "Current draft" }));
    expect(draft.getByText("Art/Dance: 35 XP")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Advanced choices" }));
    expect(draft.queryByText("Art/Dance: 35 XP")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel advanced choices" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("region", { name: "XP balances" }).textContent,
    ).toBe(balances);
    fireEvent.click(screen.getByRole("button", { name: "Advanced choices" }));
    pick("Art/Any — choice 1", "Art/Music (skill)");
    fireEvent.click(
      screen.getByRole("button", { name: "Apply advanced choices" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add Real Life module" }),
    );
    expect(draft.getAllByText("Art/Music: 35 XP")).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit Travel advanced choices" }),
    );
    expect(draft.queryByText("Art/Music: 35 XP")).toBeNull();
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Completed Real Life modules" }),
    ).toBeTruthy();
  });
});
