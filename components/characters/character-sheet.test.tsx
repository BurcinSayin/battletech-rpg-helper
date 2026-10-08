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

function skillMetrics(name: string) {
  const row = within(screen.getByText(name).closest("li")!);
  const level = Number(row.getByText(/^Lvl \d+$/).textContent!.slice(4));
  const [complexity, targetNumber] = row
    .getByText(/^(SB|CB|SA|CA|unknown)\//)
    .textContent!.split("/");
  return {
    level,
    complexity,
    targetNumber: targetNumber ? Number(targetNumber) : undefined,
  };
}

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
    "preserves XP while sorting and expanding derived skill rows with %s actions",
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
          expect(skillMetrics(skills[index].name)).toEqual({
            level: levels[position],
            complexity: "SB",
            targetNumber: 7,
          });
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
    const assertMetrics = (level: number) => {
      expect(skillMetrics("Career/Soldier")).toEqual({
        level,
        complexity: "SB",
        targetNumber: 7,
      });
    };
    assertMetrics(1);
    rerender(sheet(30, [{ name: "Slow Learner", xp: -300 }]));
    assertMetrics(0);
    rerender(
      sheet(30, [
        { name: "Slow Learner", xp: -300 },
        { name: "Fast Learner", xp: 300 },
      ]),
    );
    assertMetrics(1);
    rerender(sheet(80, []));
    assertMetrics(3);
  });

  it.each([
    ["Acting", 30, 1, "CB", 8],
    ["Career/Soldier", 80, 3, "SB", 7],
    ["Technician/Weapons", 120, 4, "CA", 9],
    ["Art", 80, 3, "CB", 8],
    ["Art", 120, 4, "CA", 9],
    ["Martial Arts", 80, 3, "SB", 7],
    ["Martial Arts", 120, 4, "SA", 8],
    ["Custom skill", 30, 1, "unknown", undefined],
    ["constructor", 30, 1, "unknown", undefined],
  ])(
    "derives level and rulebook metadata for %s at %i XP",
    (name, rawXp, level, complexity, targetNumber) => {
      render(
        <CharacterSheet
          draft={draftWith({ skills: [{ name, xp: rawXp }] })}
          xp={xp}
          warnings={noWarnings}
        />,
      );
      expect(skillMetrics(name)).toEqual({ level, complexity, targetNumber });
    },
  );

  it("updates both complexity and target number across the learner-adjusted tier boundary", () => {
    const draft = draftWith({ skills: [{ name: "Art", xp: 100 }] });
    const { rerender } = render(
      <CharacterSheet draft={draft} xp={xp} warnings={noWarnings} />,
    );
    expect(skillMetrics("Art")).toEqual({
      level: 3,
      complexity: "CB",
      targetNumber: 8,
    });
    rerender(
      <CharacterSheet
        draft={{ ...draft, traits: [{ name: "Fast Learner", xp: 300 }] }}
        xp={xp}
        warnings={noWarnings}
      />,
    );
    expect(skillMetrics("Art")).toEqual({
      level: 4,
      complexity: "CA",
      targetNumber: 9,
    });
    rerender(<CharacterSheet draft={draft} xp={xp} warnings={noWarnings} />);
    expect(skillMetrics("Art")).toEqual({
      level: 3,
      complexity: "CB",
      targetNumber: 8,
    });
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

  it("renders bare skills with default_sub as assumed composite subskills", () => {
    const draft = draftWith({
      skills: [
        { name: "MedTech", xp: 45 },
        { name: "Surgery", xp: 30 },
      ],
    });
    render(
      <CharacterSheet
        draft={draft}
        xp={xp}
        warnings={noWarnings}
      />,
    );

    expect(screen.getByText("MedTech/General")).toBeTruthy();
    expect(screen.getByText("Surgery/General")).toBeTruthy();
  });
});
