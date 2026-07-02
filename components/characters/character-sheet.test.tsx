// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { emptyDraft } from "@/lib/btcc/types";
import type { BtccDraft, BtccRow, BtccScalars } from "@/lib/btcc/types";
import type { CatalogWarnings, XpSummary } from "@/lib/characters";
import { CharacterSheet } from "./character-sheet";

afterEach(cleanup);

function draftWith(
  overrides: {
    scalars?: Partial<BtccScalars>;
    attrs?: Record<string, number>;
    skills?: BtccRow[];
    traits?: BtccRow[];
  } = {},
): BtccDraft {
  const base = emptyDraft();
  return {
    ...base,
    skills: overrides.skills ?? base.skills,
    traits: overrides.traits ?? base.traits,
    scalars: { ...base.scalars, ...overrides.scalars },
    attrs: { ...base.attrs, ...overrides.attrs },
  };
}

const xp: XpSummary = {
  spent: 1200,
  byCategory: { attributes: 200, skills: 700, traits: 300 },
  budget: 5000,
  remaining: 3800,
};

const noWarnings: CatalogWarnings = { skills: [], traits: [] };

describe("CharacterSheet", () => {
  it("renders name, affiliation and vitals from scalars", () => {
    const draft = draftWith({
      scalars: {
        name: "Natasha Kerensky",
        aff: "Clan Wolf",
        subaff: "Alpha Galaxy",
        age: 40,
        sex: "F",
        height: 170,
        weight: 65,
        haircolor: "Black",
        eyecolor: "Green",
      },
      attrs: { STR: 150, INT: 200 },
    });

    render(
      <CharacterSheet
        draft={draft}
        xp={xp}
        warnings={noWarnings}
        onEdit={() => {}}
      />,
    );

    expect(screen.getByText("Natasha Kerensky")).toBeTruthy();
    expect(screen.getByText("Clan Wolf · Alpha Galaxy")).toBeTruthy();
    expect(screen.getByText(/Age 40/)).toBeTruthy();
    expect(screen.getByText("1,200 spent")).toBeTruthy();
    expect(screen.getByText("3,800 left")).toBeTruthy();
  });

  it("falls back to placeholders when name, affiliation and vitals are empty", () => {
    render(
      <CharacterSheet
        draft={draftWith()}
        xp={{ ...xp, budget: 0 }}
        warnings={noWarnings}
        onEdit={() => {}}
      />,
    );

    expect(screen.getByText("Unnamed")).toBeTruthy();
    expect(screen.getByText("No affiliation")).toBeTruthy();
    expect(screen.getByText("No vitals recorded.")).toBeTruthy();
    expect(screen.getByText("No skills yet.")).toBeTruthy();
    expect(screen.getByText("No traits yet.")).toBeTruthy();
  });

  it("shows only the top skills and expands/collapses the rest", () => {
    const skills = Array.from({ length: 7 }, (_, i) => ({
      name: `Skill${i}`,
      xp: (i + 1) * 10,
    }));
    render(
      <CharacterSheet
        draft={draftWith({ skills })}
        xp={xp}
        warnings={noWarnings}
        onEdit={() => {}}
      />,
    );

    // Highest-xp skill visible, lowest hidden behind the toggle.
    expect(screen.getByText("Skill6")).toBeTruthy();
    expect(screen.queryByText("Skill0")).toBeNull();

    const toggle = screen.getByRole("button", { name: /2 more skills/ });
    fireEvent.click(toggle);
    expect(screen.getByText("Skill0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /show less/i }));
    expect(screen.queryByText("Skill0")).toBeNull();
  });

  it("renders traits with signed xp coloring and a warning banner", () => {
    const draft = draftWith({
      traits: [
        { name: "Good Reputation", xp: 100 },
        { name: "Unlucky", xp: -50 },
      ],
    });
    const warnings: CatalogWarnings = {
      skills: ["MedTech"],
      traits: ["Custom Trait"],
    };
    render(
      <CharacterSheet
        draft={draft}
        xp={xp}
        warnings={warnings}
        onEdit={() => {}}
      />,
    );

    expect(screen.getByText("+100")).toBeTruthy();
    expect(screen.getByText("-50")).toBeTruthy();
    expect(screen.getByText(/2 names not in catalog/)).toBeTruthy();
    expect(screen.getByText(/MedTech, Custom Trait/)).toBeTruthy();
  });

  it("invokes onEdit when the Edit button is clicked", () => {
    const onEdit = vi.fn();
    render(
      <CharacterSheet
        draft={draftWith()}
        xp={xp}
        warnings={noWarnings}
        onEdit={onEdit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
