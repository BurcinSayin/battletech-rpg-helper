// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { Inventory } from "@/lib/characters/inventory";
import { findWeapon } from "@/lib/rules/load";
import { EquipmentTab } from "./equipment-tab";

afterEach(cleanup);

const pistol =
  "Small Arms;Custom pistol;3B/4;5/20/45/105;100;1;10;2;0.1; original note ;2";
const jacket = "Custom jacket;100;3.5;TA;1/5/1/3; original jacket note ;1";
const empty: Inventory = {
  equip: [],
  weapons: [],
  equipLoc: {},
  chrWeapons: [],
};

function Harness({
  initial,
  disabled = false,
}: {
  initial: Inventory;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <EquipmentTab value={value} onChange={setValue} disabled={disabled} />
      <output data-testid="inventory">{JSON.stringify(value)}</output>
    </>
  );
}
function current(): Inventory {
  return JSON.parse(screen.getByTestId("inventory").textContent!);
}
function table(group: string) {
  const section = screen
    .getByRole("heading", { name: `// ${group}` })
    .closest("section")!;
  return within(within(section).getByRole("table"));
}
function expand(group: string, name: string) {
  const controls = table(group);
  fireEvent.click(
    controls.getByRole("button", { name: `Details for ${name}` }),
  );
  return controls;
}

describe("EquipmentTab inventory management", () => {
  it("selects the bundled catalog by keyboard and appends a staged stack without readying it", () => {
    const legacy =
      "None;Legacy ammunition;0;0;45;1.08;10;2;0.14;keep original;9";
    render(<Harness initial={{ ...empty, weapons: [legacy] }} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Catalog filter" }), {
      target: { value: "weapons" },
    });
    const search = screen.getByRole("combobox", {
      name: "Search equipment catalog",
    });
    fireEvent.change(search, { target: { value: "Auto-Pistol" } });
    fireEvent.keyDown(search, { key: "Home" });
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity to add" }), {
      target: { value: "2" },
    });
    expect(current().weapons).toEqual([legacy]);
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(current().weapons).toHaveLength(2);
    expect(current().weapons[0]).toBe(legacy);
    expect(current().weapons[1].split(";").slice(1, 6)).toEqual([
      findWeapon("Auto-Pistol")!.name,
      "3B/4",
      "5/20/45/105",
      "100",
      "1",
    ]);
    expect(current().weapons[1].split(";").at(-1)).toBe("2");
    expect(current().chrWeapons).toEqual([]);
    expect(current().equipLoc).toEqual({});
  });

  it("stages quantity, rejects invalid input, and preserves untouched raw fields", () => {
    const raw = "Custom kit;20;2;N;0/0/0/0; note : keep ;2";
    render(<Harness initial={{ ...empty, equip: [raw] }} />);
    const gear = expand("Other Gear", "Custom kit");
    const quantity = gear.getByRole("textbox", { name: "Quantity" });
    expect(fireEvent.keyDown(quantity, { key: "Enter" })).toBe(false);
    fireEvent.change(quantity, { target: { value: "" } });
    fireEvent.click(gear.getByRole("button", { name: "Apply quantity" }));
    expect(gear.getByRole("alert").textContent).toMatch(/positive integer/i);
    expect(current().equip).toEqual([raw]);
    fireEvent.change(quantity, { target: { value: "3" } });
    expect(current().equip).toEqual([raw]);
    fireEvent.click(gear.getByRole("button", { name: "Apply quantity" }));
    expect(current().equip).toEqual([
      "Custom kit;30;3;N;0/0/0/0; note : keep ;3",
    ]);
    expect(gear.queryByRole("alert")).toBeNull();
  });

  it("shows partial totals and preserves unsupported rows until confirmed removal", () => {
    const raw = "unsupported;<script>raw text</script>;more";
    render(
      <Harness
        initial={{
          ...empty,
          equip: [raw, "Unknown mass;25;?;N;0/0/0/0;notes;1"],
        }}
      />,
    );
    expect(
      screen.getByText(/Known carried mass: 0 kg \(\+ 2 unknown rows\)/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Known inventory value: 25 C-Bills \(\+ 1 unknown rows\)/,
      ),
    ).toBeTruthy();
    const gear = expand("Other Gear", "unrecognized imported row");
    expect(gear.getByText(raw).tagName).toBe("PRE");
    expect(gear.queryByRole("textbox", { name: "Quantity" })).toBeNull();
    fireEvent.click(gear.getByRole("button", { name: "Remove" }));
    expect(current().equip[0]).toBe(raw);
    fireEvent.click(gear.getByRole("button", { name: "Cancel" }));
    expect(current().equip[0]).toBe(raw);
    fireEvent.click(gear.getByRole("button", { name: "Remove" }));
    fireEvent.click(gear.getByRole("button", { name: "Remove item" }));
    expect(current().equip).toEqual(["Unknown mass;25;?;N;0/0/0/0;notes;1"]);
    fireEvent.click(
      gear.getByRole("button", { name: "Details for Unknown mass" }),
    );
    expect(
      (gear.getByRole("textbox", { name: "Quantity" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(gear.getByText(/Stored cost or mass is unknown/)).toBeTruthy();
  });

  it("retains duplicate-name references until the last row is removed", () => {
    render(
      <Harness
        initial={{
          ...empty,
          weapons: [pistol, pistol.replace("original note", "variant")],
          chrWeapons: ["Custom pistol"],
        }}
      />,
    );
    const weapons = table("Weapons");
    expect(weapons.getAllByText(/Ambiguous name/)).toHaveLength(2);
    fireEvent.click(
      weapons.getAllByRole("button", { name: "Details for Custom pistol" })[0],
    );
    fireEvent.click(weapons.getByRole("button", { name: "Remove" }));
    fireEvent.click(weapons.getByRole("button", { name: "Remove item" }));
    expect(current().weapons).toHaveLength(1);
    expect(current().chrWeapons).toEqual(["Custom pistol"]);
    fireEvent.click(
      weapons.getByRole("button", { name: "Details for Custom pistol" }),
    );
    fireEvent.click(weapons.getByRole("button", { name: "Remove" }));
    fireEvent.click(weapons.getByRole("button", { name: "Remove item" }));
    expect(current().chrWeapons).toEqual([]);
  });

  it("readies individual copies and retains overallocated entries after a quantity reduction", () => {
    render(<Harness initial={{ ...empty, weapons: [pistol] }} />);
    const weapons = expand("Weapons", "Custom pistol");
    fireEvent.click(weapons.getByRole("button", { name: "Ready weapon" }));
    fireEvent.click(weapons.getByRole("button", { name: "Ready weapon" }));
    expect(current().chrWeapons).toEqual(["Custom pistol", "Custom pistol"]);
    expect(
      (
        weapons.getByRole("button", {
          name: "Ready weapon",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(weapons.getByRole("textbox", { name: "Quantity" }), {
      target: { value: "1" },
    });
    fireEvent.click(weapons.getByRole("button", { name: "Apply quantity" }));
    expect(current().chrWeapons).toHaveLength(2);
    expect(screen.getAllByText(/Readied quantity exceeds/)).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Unready" })[1]);
    expect(current().chrWeapons).toEqual(["Custom pistol"]);
    expect(screen.queryByText(/Readied quantity exceeds/)).toBeNull();
  });

  it("previews displacement and takes off the whole displaced garment", () => {
    render(
      <Harness
        initial={{
          ...empty,
          equip: [jacket, "Old suit;200;4;FUL;2/2/2/2;old;1"],
          equipLoc: {
            Torso: "Old suit",
            Legs: "Old suit",
            Mystery: "Unresolved",
          },
        }}
      />,
    );
    const armor = expand("Armor", "Custom jacket");
    fireEvent.click(
      armor.getByRole("button", { name: "Apply armor placement" }),
    );
    expect(armor.getByRole("alert")).toBeTruthy();
    fireEvent.click(armor.getByRole("checkbox", { name: "Torso" }));
    fireEvent.click(armor.getByRole("checkbox", { name: "Arms" }));
    expect(
      armor.getByText(/Will take off: Old suit \(Torso\), Old suit \(Legs\)/),
    ).toBeTruthy();
    expect(current().equipLoc).toEqual({
      Torso: "Old suit",
      Legs: "Old suit",
      Mystery: "Unresolved",
    });
    fireEvent.click(
      armor.getByRole("button", { name: "Apply armor placement" }),
    );
    expect(current().equipLoc).toEqual({
      Mystery: "Unresolved",
      Torso: "Custom jacket",
      Arms: "Custom jacket",
    });
    expect(armor.queryByRole("alert")).toBeNull();
    const placement = screen.getByText("Torso: Custom jacket").closest("li")!;
    fireEvent.click(
      within(placement).getByRole("button", { name: "Take off" }),
    );
    expect(current().equipLoc).toEqual({ Mystery: "Unresolved" });
  });

  it("uses exclusive TOR coverage and preserves unknown and Full placements until changed", () => {
    render(
      <Harness
        initial={{
          ...empty,
          equip: ["Plate;50;1;TOR;1/1/1/1;notes;1"],
          equipLoc: {
            Full: "Missing suit",
            Arms: "Missing sleeves",
            Alien: "Unknown",
          },
        }}
      />,
    );
    expect(screen.getByText(/Overlapping imported Full/)).toBeTruthy();
    const armor = expand("Armor", "Plate");
    fireEvent.click(armor.getByRole("checkbox", { name: "Torso" }));
    fireEvent.click(armor.getByRole("checkbox", { name: "Legs" }));
    expect(
      (armor.getByRole("checkbox", { name: "Torso" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    fireEvent.click(
      armor.getByRole("button", { name: "Apply armor placement" }),
    );
    expect(current().equipLoc).toEqual({
      Arms: "Missing sleeves",
      Alien: "Unknown",
      Legs: "Plate",
    });
  });

  it("shows details but no mutation controls in read-only mode", () => {
    render(
      <EquipmentTab
        value={{
          ...empty,
          equip: [jacket],
          weapons: [pistol],
          chrWeapons: ["Missing weapon"],
          equipLoc: { Full: "Missing suit" },
        }}
      />,
    );
    const weapons = expand("Weapons", "Custom pistol");
    expect(weapons.getByText("3B/4")).toBeTruthy();
    expect(weapons.getByText("original note", { exact: false })).toBeTruthy();
    expect(screen.getAllByText(/Missing inventory item/)).toHaveLength(2);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Quantity" })).toBeNull();
    for (const name of [
      "Remove",
      "Ready weapon",
      "Unready",
      "Take off",
      "Apply armor placement",
      "Add item",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("disables every mutation while pending without hiding stored details", () => {
    const onChange = vi.fn();
    render(
      <EquipmentTab
        disabled
        value={{
          ...empty,
          equip: [jacket],
          weapons: [pistol],
          chrWeapons: ["Custom pistol"],
          equipLoc: { Torso: "Custom jacket" },
        }}
        onChange={onChange}
      />,
    );
    const weapons = expand("Weapons", "Custom pistol");
    const armor = expand("Armor", "Custom jacket");
    expect(weapons.getByText("3B/4")).toBeTruthy();
    for (const scope of [weapons, armor])
      for (const button of scope
        .getAllByRole("button")
        .filter((button) => button.textContent !== "Details")) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(button);
      }
    fireEvent.click(screen.getByRole("button", { name: "Unready" }));
    fireEvent.click(screen.getByRole("button", { name: "Take off" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shares staged quantity and expansion between responsive presentations", () => {
    render(<Harness initial={{ ...empty, weapons: [pistol] }} />);
    const weapons = expand("Weapons", "Custom pistol");
    fireEvent.change(weapons.getByRole("textbox", { name: "Quantity" }), {
      target: { value: "7" },
    });
    const quantityInputs = screen.getAllByRole("textbox", {
      name: "Quantity",
    }) as HTMLInputElement[];
    expect(quantityInputs).toHaveLength(2);
    expect(quantityInputs.map((input) => input.value)).toEqual(["7", "7"]);
    expect(current().weapons).toEqual([pistol]);
    expect(
      screen
        .getAllByRole("button", { name: "Details for Custom pistol" })
        .every((button) => button.getAttribute("aria-expanded") === "true"),
    ).toBe(true);
  });
});
