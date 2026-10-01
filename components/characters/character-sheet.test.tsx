// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
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

  it.each(["Edit", "Import/Cancel"] as const)(
    "shows derived levels and raw XP in sorted, expandable rows with %s actions",
    (actionMode) => {
      const skills = [24, 80, 30, 570, -10, 120, 50].map((value, i) => ({
        name: `Career/Skill${i}`,
        xp: value,
      }));
      const draft = draftWith({
        skills,
        traits: [{ name: "Fast Learner", xp: 300 }],
      });
      const originalSkills = draft.skills.map((row) => ({ ...row }));
      const originalTraits = draft.traits.map((row) => ({ ...row }));
      render(
        <CharacterSheet
          draft={draft}
          xp={xp}
          warnings={noWarnings}
          actions={
            actionMode === "Import/Cancel" ? (
              <>
                <button>Import character</button>
                <button>Cancel</button>
              </>
            ) : undefined
          }
        />,
      );

      const assertRows = (indices: number[], levels: number[]) => {
        const list = screen.getByText(skills[3].name).closest("ul")!;
        const names = within(list)
          .getAllByRole("listitem")
          .filter((row) => !within(row).queryByRole("button"))
          .map((row) => row.firstElementChild?.textContent);
        expect(names).toEqual(indices.map((i) => skills[i].name));
        indices.forEach((index, position) => {
          const row = within(
            screen.getByText(skills[index].name).closest("li")!,
          );
          expect(row.getByText(`Level ${levels[position]}`)).toBeTruthy();
          expect(row.getByText(`${skills[index].xp} XP`)).toBeTruthy();
        });
      };
      assertRows([3, 5, 1, 6, 2], [10, 4, 3, 2, 1]);
      expect(screen.queryByText(skills[0].name)).toBeNull();
      expect(screen.queryByText(skills[4].name)).toBeNull();
      if (actionMode === "Import/Cancel") {
        expect(
          screen.getByRole("button", { name: "Import character" }),
        ).toBeTruthy();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
      } else {
        expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
      }

      const toggle = screen.getByRole("button", { name: /2 more skills/ });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      assertRows([3, 5, 1, 6, 2, 0, 4], [10, 4, 3, 2, 1, 1, 0]);
      fireEvent.click(screen.getByRole("button", { name: /show less/i }));
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByText(skills[0].name)).toBeNull();
      expect(screen.queryByText(skills[4].name)).toBeNull();
      expect(draft.skills).toEqual(originalSkills);
      expect(draft.traits).toEqual(originalTraits);
    },
  );

  it("recalculates levels from current traits and skill XP on rerender", () => {
    const sheet = (skillXp: number, traits: BtccRow[]) => (
      <CharacterSheet
        draft={draftWith({
          skills: [{ name: "Career/Soldier", xp: skillXp }],
          traits,
        })}
        xp={xp}
        warnings={noWarnings}
      />
    );
    const { rerender } = render(sheet(30, []));
    const assertMetrics = (level: number, rawXp: number) => {
      const row = within(screen.getByText("Career/Soldier").closest("li")!);
      expect(row.getByText(`Level ${level}`)).toBeTruthy();
      expect(row.getByText(`${rawXp} XP`)).toBeTruthy();
    };
    assertMetrics(1, 30);
    rerender(sheet(30, [{ name: "Slow Learner", xp: -300 }]));
    assertMetrics(0, 30);
    rerender(
      sheet(30, [
        { name: "Slow Learner", xp: -300 },
        { name: "Fast Learner", xp: 300 },
      ]),
    );
    assertMetrics(1, 30);
    rerender(sheet(80, []));
    assertMetrics(3, 80);
  });

  it.each([
    ["Acting", 30, "CB"],
    ["Career/Soldier", 80, "SB"],
    ["Technician/BattleMech", 120, "CA"],
    ["Art", 80, "CB"],
    ["Art", 120, "CA"],
    ["Martial Arts", 120, "SA"],
    ["Custom skill", 30, "unknown"],
    ["constructor", 30, "unknown"],
  ])(
    "shows rule-book complexity for %s at %i XP",
    (name, rawXp, complexity) => {
      render(
        <CharacterSheet
          draft={draftWith({ skills: [{ name, xp: rawXp }] })}
          xp={xp}
          warnings={noWarnings}
        />,
      );
      const row = within(screen.getByText(name).closest("li")!);
      expect(row.getByText(`Complexity ${complexity}`)).toBeTruthy();
      expect(row.getByText(`${rawXp} XP`)).toBeTruthy();
    },
  );

  it("updates tiered complexity when traits change the derived level", () => {
    const draft = draftWith({ skills: [{ name: "Art", xp: 100 }] });
    const { rerender } = render(
      <CharacterSheet draft={draft} xp={xp} warnings={noWarnings} />,
    );
    expect(screen.getByText("Level 3")).toBeTruthy();
    expect(screen.getByText("Complexity CB")).toBeTruthy();
    rerender(
      <CharacterSheet
        draft={{ ...draft, traits: [{ name: "Fast Learner", xp: 300 }] }}
        xp={xp}
        warnings={noWarnings}
      />,
    );
    expect(screen.getByText("Level 4")).toBeTruthy();
    expect(screen.getByText("Complexity CA")).toBeTruthy();
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
