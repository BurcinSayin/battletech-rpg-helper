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
    const nameInput = screen.getByLabelText(
      "Character name",
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Lisa");
  });
});
