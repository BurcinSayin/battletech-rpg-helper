// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { emptyDraft } from "@/lib/btcc";
import { CombatLoadout } from "./combat-loadout";

afterEach(cleanup);

describe("CombatLoadout in On Foot Play", () => {
  it("shows original skill labels and learner-adjusted levels in sheet order, including zero", () => {
    const draft = emptyDraft();
    draft.weapons = [
      "Gunnery/Mech;Training weapon;3B/4;5/20;50;0.5;10;0;0;notes;1",
    ];
    draft.chrWeapons = ["Training weapon"];
    draft.skills = [
      { name: "Gunnery/'Mech", xp: 24 },
      { name: "Gunnery/Mech", xp: 0 },
      { name: "Small Arms", xp: 50 },
    ];
    draft.traits = [{ name: "Fast Learner", xp: 300 }];
    render(<CombatLoadout value={draft} pilot={draft} />);

    const skill = screen.getByText("Skill").nextElementSibling as HTMLElement;
    expect(within(skill).getByText("Gunnery/Mech").textContent).toBe(
      "Needs: Gunnery/Mech",
    );
    expect(
      within(skill).getAllByRole("listitem").map((entry) => entry.textContent),
    ).toEqual(["Gunnery/'Mech: Lvl 1 · SA/8", "Gunnery/Mech: Lvl 0 · SA/8"]);
  });

  it("shows specializations for a generic requirement without matching sibling specializations on a specific weapon", () => {
    const draft = emptyDraft();
    draft.weapons = [
      "Thrown Weapons;Grenade;(C);STR X 1/2/3/4;100;1;1;0;0;notes;1",
      "Thrown Weapons/Blade;Throwing knife;2B;5/10;50;0.5;1;0;0;notes;1",
    ];
    draft.chrWeapons = ["Grenade", "Throwing knife"];
    draft.skills = [
      { name: "Thrown Weapons/Blunt", xp: 50 },
      { name: "Thrown Weapons Training/Blunt", xp: 30 },
      { name: "Thrown Weapons", xp: 80 },
      { name: "Thrown Weapons/Blade", xp: 30 },
    ];
    render(<CombatLoadout value={draft} pilot={draft} />);

    const grenade = within(
      screen.getByRole("heading", { name: "1. Grenade" }).closest("li")!,
    );
    expect(grenade.getByText("Thrown Weapons").textContent).toBe(
      "Needs: Thrown Weapons",
    );
    expect(grenade.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "Thrown Weapons/Blunt: Lvl 2 · SB/7",
      "Thrown Weapons: Lvl 3 · SB/7",
      "Thrown Weapons/Blade: Lvl 1 · SB/7",
    ]);

    const knife = within(
      screen.getByRole("heading", { name: "2. Throwing knife" }).closest("li")!,
    );
    expect(knife.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "Thrown Weapons/Blade: Lvl 1 · SB/7",
    ]);
  });

  it.each(["MedTech", "Medtech"])(
    "matches a non-default specialization when the saved requirement is %s",
    (requirement) => {
      const draft = emptyDraft();
      draft.weapons = [
        `${requirement};Parent requirement;1B;Melee;1;1;0;0;0;notes;1`,
        "MedTech/General;Explicit requirement;1B;Melee;1;1;0;0;0;notes;1",
      ];
      draft.chrWeapons = ["Parent requirement", "Explicit requirement"];
      draft.skills = [{ name: "MedTech/Veterinary", xp: 50 }];
      render(<CombatLoadout value={draft} pilot={draft} />);

      const parent = within(
        screen.getByRole("heading", { name: "1. Parent requirement" }).closest("li")!,
      );
      expect(parent.getByText(requirement).textContent).toBe(`Needs: ${requirement}`);
      expect(parent.getByText("MedTech/Veterinary: Lvl 2 · SB/7")).toBeTruthy();

      const explicit = within(
        screen.getByRole("heading", { name: "2. Explicit requirement" }).closest("li")!,
      );
      expect(explicit.getByText("Not on sheet")).toBeTruthy();
    },
  );

  it("shows the stats for each skill's level without guessing stats for custom skills", () => {
    const draft = emptyDraft();
    draft.weapons = [
      "Martial Arts;Fists;1B;Melee;0;0;0;0;0;notes;1",
      "Custom stance;Training staff;2B;Melee;5;1;0;0;0;notes;1",
    ];
    draft.chrWeapons = ["Fists", "Training staff"];
    draft.skills = [
      { name: "Martial Arts", xp: 80 },
      { name: "Martial Arts", xp: 120 },
      { name: "Custom stance", xp: 30 },
    ];
    render(<CombatLoadout value={draft} pilot={draft} />);

    expect(screen.getByText("Martial Arts: Lvl 3 · SB/7")).toBeTruthy();
    expect(screen.getByText("Martial Arts: Lvl 4 · SA/8")).toBeTruthy();
    expect(screen.getByText("Custom stance: Lvl 1 · unknown/N/A")).toBeTruthy();
  });

  it("keeps stats and skills specific to each ambiguous variant and does not guess missing skills or items", () => {
    const draft = emptyDraft();
    draft.weapons = [
      "Small Arms;Duplicate;3B/4;5/20;50;0.5;10;0;0;first;1",
      "Support Weapons;Duplicate;6B/4;10/40;75;1;5;0;0;second;1",
      "   ;No skill;2B;5/10;75;1;5;0;0;third;1",
    ];
    draft.chrWeapons = ["Duplicate", "No skill", "Missing weapon"];
    draft.skills = [{ name: "Small Arms", xp: 30 }];
    render(<CombatLoadout value={draft} pilot={draft} />);

    const summary = screen.getByText("Available variants for Duplicate");
    const variants = summary.closest("details")!;
    expect(variants.open).toBe(false);
    fireEvent.click(summary);
    expect(variants.open).toBe(true);
    const first = within(variants).getByText("Inventory row 1").closest("li")!;
    const second = within(variants).getByText("Inventory row 2").closest("li")!;
    expect(within(first).getByText("3B/4")).toBeTruthy();
    expect(within(first).getByText("Small Arms: Lvl 1 · SB/7")).toBeTruthy();
    expect(within(second).getByText("6B/4")).toBeTruthy();
    expect(within(second).getByText("Support Weapons").textContent).toBe(
      "Needs: Support Weapons",
    );
    expect(within(second).getByText("Not on sheet")).toBeTruthy();

    const noSkill = within(
      screen.getByRole("heading", { name: "2. No skill" }).closest("li")!,
    );
    expect(noSkill.getByText("Unknown").textContent).toBe("Needs: Unknown");
    expect(noSkill.queryByText("Not on sheet")).toBeNull();
    const missing = within(
      screen.getByRole("heading", { name: "3. Missing weapon" }).closest("li")!,
    );
    expect(missing.getByText(/Missing inventory item/)).toBeTruthy();
    expect(missing.queryByText("Damage")).toBeNull();
    expect(missing.queryByText("Skill")).toBeNull();
  });

  it("shows separate empty states for weapons and armor", () => {
    const draft = emptyDraft();
    render(<CombatLoadout value={draft} pilot={draft} />);

    expect(screen.getByText("No readied weapons.")).toBeTruthy();
    expect(screen.getByText("No worn armor.")).toBeTruthy();
  });
});
