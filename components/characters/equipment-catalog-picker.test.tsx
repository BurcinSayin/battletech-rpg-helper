// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseEquipmentRow, parseWeaponRow } from "@/lib/btcc/inventory";

vi.mock("@/lib/rules/load", () => {
  const amount = (
    value: number | null,
    text = value === null ? "Variable" : String(value),
  ) => ({ value, text, multiplier: null });
  const base = {
    category: "FIELD EQUIPMENT",
    section: "Survival",
    aliases: [],
    sources: [
      {
        file: "manual.pdf",
        table: "Equipment",
        printedPage: 10,
        pdfPage: 12,
        part: 0,
        row: 0,
        role: "item",
      },
    ],
    raw: {},
    notes: [{ text: "Original catalog note", scope: "item", section: null }],
    equipmentRatings: null,
    affiliation: null,
    cost: amount(20),
    mass: amount(2),
  };
  const kit = {
    ...base,
    id: "kit",
    name: "Field kit",
    aliases: ["Scout supplies"],
    kind: "gear",
    armor: null,
    purchaseUnit: "item",
  };
  const armor = {
    ...kit,
    id: "armor",
    name: "Field jacket",
    kind: "armor",
    category: "PERSONAL ARMOR",
    section: "Protective wear",
    armor: {
      coverage: "T+A",
      locations: ["T", "A"],
      bar: "1/5/1/3",
      ratings: [1, 5, 1, 3],
      patchCost: amount(10),
    },
  };
  const unresolvedArmor = {
    ...armor,
    id: "custom-armor",
    name: "Variable suit",
    cost: { value: null, text: "×2", multiplier: 2 },
    mass: amount(null),
    armor: {
      ...armor.armor,
      coverage: "Choose coverage",
      locations: null,
      bar: "Varies",
      ratings: null,
    },
  };
  const weapon = {
    ...base,
    id: "pistol",
    name: "Field pistol",
    category: "RANGED WEAPONS",
    section: "Pistols",
    kind: "weapon",
    skill: "Small Arms",
    specialty: null,
    family: null,
    damage: "3B/4",
    range: "5/20/45/105",
    rangeMeters: [5, 20, 45, 105],
    shots: "10",
    capacity: 10,
    capacityUnit: "rounds",
    powerPerShot: null,
    ammoCost: amount(5),
    ammoMass: amount(0.1),
  };
  return {
    equipment: [
      kit,
      armor,
      unresolvedArmor,
      { ...kit, id: "modifier", name: "Field modifier", kind: "modifier" },
      { ...kit, id: "unsafe", name: "Unsafe: kit" },
    ],
    weapons: [
      weapon,
      {
        ...weapon,
        id: "ammo",
        name: "Field ammunition",
        kind: "ammunition",
        skill: "None",
      },
      {
        ...weapon,
        id: "pack",
        name: "Field power pack",
        kind: "powerPack",
        capacity: 20,
        capacityUnit: "powerPoints",
      },
      {
        ...weapon,
        id: "variable-weapon",
        name: "Variable pistol",
        cost: amount(null),
        mass: amount(null),
        ammoCost: amount(null),
        ammoMass: amount(null),
        damage: "Damage: choose",
        range: "Range: choose",
        shots: "Shots: choose",
      },
    ],
  };
});

import { equipment, weapons } from "@/lib/rules/load";
import { EquipmentCatalogPicker } from "./equipment-catalog-picker";
import { EquipmentAddPanel } from "./equipment-add-panel";

afterEach(cleanup);

function search(value: string) {
  const input = screen.getByRole("combobox", {
    name: "Search equipment catalog",
  });
  fireEvent.change(input, { target: { value } });
  return input;
}
function select(name: string) {
  search(name);
  fireEvent.click(screen.getByRole("option", { name: new RegExp(`^${name}`) }));
}
function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function addButton() {
  return screen.getByRole("button", { name: "Add item" }) as HTMLButtonElement;
}

describe("EquipmentCatalogPicker", () => {
  it("selects in source order using arrows, Home, End and Enter without submitting", () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <EquipmentCatalogPicker onSelect={onSelect} />
      </form>,
    );
    const input = search("FIELD");
    const options = Array.from(
      screen
        .getByRole("listbox")
        .querySelectorAll<HTMLElement>('[role="option"]'),
    );
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    fireEvent.keyDown(input, { key: "End" });
    expect(input.getAttribute("aria-activedescendant")).toBe(
      options.at(-1)!.id,
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith({
      kind: "weapon",
      item: weapons[2],
    });
    search("FIELD");
    fireEvent.keyDown(input, { key: "Home" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith({
      kind: "equipment",
      item: equipment[0],
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("searches aliases, categories and sections and filters physical item kinds", () => {
    render(<EquipmentCatalogPicker onSelect={vi.fn()} />);
    search("scout supplies");
    expect(screen.getByRole("option", { name: /Field kit/ })).toBeTruthy();
    search("protective wear");
    expect(screen.getByRole("option", { name: /Variable suit/ })).toBeTruthy();
    search("personal armor");
    expect(screen.getByRole("option", { name: /Field jacket/ })).toBeTruthy();
    search("field");
    fireEvent.change(screen.getByLabelText("Catalog filter"), {
      target: { value: "weapons" },
    });
    expect(screen.getByRole("option", { name: /Field pistol/ })).toBeTruthy();
    expect(
      screen.queryByRole("option", { name: /Field ammunition/ }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Catalog filter"), {
      target: { value: "armor" },
    });
    expect(screen.getByRole("option", { name: /Field jacket/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Field kit/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Catalog filter"), {
      target: { value: "other" },
    });
    expect(screen.getByRole("option", { name: /Field kit/ })).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /Field ammunition/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /Field power pack/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Field modifier/ })).toBeNull();
    search("absent result");
    expect(screen.getByRole("status").textContent).toContain(
      "No matching equipment",
    );
  });

  it("dismisses with Escape and prevents selection while disabled", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<EquipmentCatalogPicker onSelect={onSelect} />);
    const input = search("field pistol");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<EquipmentCatalogPicker disabled onSelect={onSelect} />);
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByLabelText("Catalog filter") as HTMLSelectElement).disabled,
    ).toBe(true);
  });
});

describe("EquipmentAddPanel", () => {
  it("stages a stack, validates quantity, appends only on Add and clears the stage", () => {
    const onAdd = vi.fn();
    render(<EquipmentAddPanel onAdd={onAdd} />);
    select("Field kit");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText(/not yet added\. Adding/)).toBeTruthy();
    fill("Quantity to add", "");
    expect(addButton().disabled).toBe(true);
    fill("Quantity to add", "1.5");
    expect(addButton().disabled).toBe(true);
    fill("Quantity to add", "2147483648");
    expect(addButton().disabled).toBe(true);
    fill("Quantity to add", "3");
    expect(addButton().disabled).toBe(false);
    fireEvent.click(addButton());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toBe("equipment");
    expect(parseEquipmentRow(onAdd.mock.calls[0][1])).toMatchObject({
      name: "Field kit",
      countText: "3",
      costText: "60",
      massText: "6",
    });
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
  });

  it("requires explicit unresolved cost, mass, coverage and all BAR components", () => {
    const onAdd = vi.fn();
    render(<EquipmentAddPanel onAdd={onAdd} />);
    select("Variable suit");
    expect(screen.getByText(/Catalog unit cost: ×2/)).toBeTruthy();
    expect(addButton().disabled).toBe(true);
    fill("Unit cost (C-Bills)", "");
    fill("Unit mass (kg)", "2.5");
    expect(addButton().disabled).toBe(true);
    fill("Unit cost (C-Bills)", "0x10");
    expect(addButton().disabled).toBe(true);
    fill("Unit cost (C-Bills)", "12.5");
    expect(addButton().disabled).toBe(true);
    fill("Unit cost (C-Bills)", "100");
    fireEvent.click(screen.getByLabelText("Hands"));
    fill("BAR M", "1");
    fill("BAR B", "5");
    fill("BAR E", "1");
    expect(addButton().disabled).toBe(true);
    fill("BAR X", "3");
    expect(addButton().disabled).toBe(false);
    fill("Unit mass (kg)", "");
    expect(addButton().disabled).toBe(true);
    expect(
      (screen.getByLabelText("Unit mass (kg)") as HTMLInputElement).value,
    ).toBe("");
    fill("Unit mass (kg)", "2.5");
    fireEvent.click(addButton());
    expect(parseEquipmentRow(onAdd.mock.calls[0][1])).toMatchObject({
      costText: "100",
      massText: "2.5",
      armorLocation: "HAN",
      bar: "1/5/1/3",
    });
  });

  it("serializes all selected coverage as FUL in the builder", () => {
    const onAdd = vi.fn();
    render(<EquipmentAddPanel onAdd={onAdd} />);
    select("Variable suit");
    fill("Unit cost (C-Bills)", "0");
    fill("Unit mass (kg)", "0");
    for (const name of ["Head", "Torso", "Arms", "Legs", "Hands", "Feet"])
      fireEvent.click(screen.getByLabelText(name));
    for (const part of ["M", "B", "E", "X"]) fill(`BAR ${part}`, "0");
    fireEvent.click(addButton());
    expect(parseEquipmentRow(onAdd.mock.calls[0][1])?.armorLocation).toBe(
      "FUL",
    );
  });

  it("exposes flagged weapon stats and unresolved reload amounts without accepting unsafe strings", () => {
    const onAdd = vi.fn();
    render(<EquipmentAddPanel onAdd={onAdd} />);
    select("Variable pistol");
    fill("Damage", "3B/4");
    fill("Range", "5/20/45/105");
    fill("Shots / power", "10");
    fill("Unit cost (C-Bills)", "50");
    fill("Unit mass (kg)", "0.5");
    fill("Reload cost (C-Bills)", "5");
    expect(addButton().disabled).toBe(true);
    fill("Reload mass (kg)", "0.1");
    fill("Damage", "unsafe;damage");
    expect(addButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("unsafe-field");
    fill("Damage", "3B/4");
    fill("Quantity to add", "2");
    fireEvent.click(addButton());
    expect(onAdd.mock.calls[0][0]).toBe("weapon");
    expect(parseWeaponRow(onAdd.mock.calls[0][1])).toMatchObject({
      skill: "Small Arms",
      damage: "3B/4",
      range: "5/20/45/105",
      shots: "10",
      costText: "100",
      massText: "1",
      ammoCostText: "5",
      ammoMassText: "0.1",
      countText: "2",
    });
  });

  it("keeps unsafe catalog names blocked and cancel dismisses only the staged item", () => {
    const onAdd = vi.fn();
    render(<EquipmentAddPanel onAdd={onAdd} />);
    select("Unsafe: kit");
    expect(addButton().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Catalog name");
    expect(screen.queryByLabelText("Catalog name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel addition" }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    select("Field pistol");
    fireEvent.click(addButton());
    expect(parseWeaponRow(onAdd.mock.calls[0][1])?.name).toBe(weapons[0].name);
  });

  it("disables a staged addition while saving without losing the input", () => {
    const onAdd = vi.fn();
    const { rerender } = render(<EquipmentAddPanel onAdd={onAdd} />);
    select("Field kit");
    fill("Quantity to add", "4");
    rerender(<EquipmentAddPanel disabled onAdd={onAdd} />);
    expect(addButton().disabled).toBe(true);
    fireEvent.click(addButton());
    expect(onAdd).not.toHaveBeenCalled();
    rerender(<EquipmentAddPanel onAdd={onAdd} />);
    expect(
      (screen.getByLabelText("Quantity to add") as HTMLInputElement).value,
    ).toBe("4");
    fireEvent.click(addButton());
    expect(parseEquipmentRow(onAdd.mock.calls[0][1])?.name).toBe(
      equipment[0].name,
    );
  });
});
