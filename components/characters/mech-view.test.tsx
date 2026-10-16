// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { emptyMechDamage, type MechDamage } from "@/lib/mech/damage";
import { emptyMech } from "@/lib/mech/schema";
import type { MechData } from "@/lib/mech/types";
import { MechView } from "./mech-view";

afterEach(cleanup);

function mech(): MechData {
  return {
    ...emptyMech(),
    chassis: "Firestarter",
    model: "FS9-H",
    mass: 35,
    heatSinks: "10 Single",
    armor: [
      { location: "LA", value: 2 },
      { location: "LA", value: 5 }, // duplicate name: identity is the index
      { location: "RTC", value: 3 },
      { location: "HD", value: 0 },
    ],
    criticalSlots: [
      { location: "Left Arm", slots: ["Shoulder", "-Empty-", "Shoulder", ""] },
      { location: "Right Arm", slots: ["Hand Actuator"] },
    ],
  };
}

function Harness({
  initial = emptyMechDamage(),
  onChange = () => {},
  value = mech(),
  controlsDisabled,
}: {
  initial?: MechDamage;
  onChange?: (next: MechDamage) => void;
  value?: MechData | null;
  controlsDisabled?: boolean;
}) {
  const [damage, setDamage] = useState(initial);
  return (
    <MechView
      mech={value}
      damage={damage}
      controlsDisabled={controlsDisabled}
      onDamageChange={(next) => {
        onChange(next);
        setDamage(next);
      }}
    />
  );
}

const btn = (name: string) => screen.getByRole("button", { name });
const isDisabled = (el: HTMLElement) => el.matches(":disabled");

describe("MechView without a mech", () => {
  it("shows only the empty state, even with stored pilot hits and a change handler", () => {
    const onChange = vi.fn();
    render(
      <MechView
        mech={null}
        damage={{ ...emptyMechDamage(), pilotHits: 3 }}
        onDamageChange={onChange}
      />,
    );
    expect(screen.getByText("No mech")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(screen.queryByText(/pilot/i)).toBeNull();
    expect(screen.queryByText(/heat/i)).toBeNull();
  });
});

describe("MechView read-only", () => {
  it("renders damage state without any controls when no handler is given", () => {
    render(
      <MechView
        mech={mech()}
        damage={{
          ...emptyMechDamage(),
          armor: [{ index: 1, lost: 2 }],
          criticals: [{ section: 0, slot: 2 }],
          heat: 4,
        }}
      />,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(screen.getByText("Damaged")).toBeTruthy();
    const section = screen.getByLabelText("Left Arm critical slots");
    const items = within(section).getAllByRole("listitem");
    expect(items[2].textContent).toContain("(critical hit)");
    expect(items[0].textContent).toBe("1Shoulder");
  });
});

describe("armor damage", () => {
  it("damages and repairs by index with remaining/max and state", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    // Duplicate locations get distinct labels.
    expect(btn("Damage armor LA #1")).toBeTruthy();
    expect(isDisabled(btn("Repair armor LA #2"))).toBe(true);

    fireEvent.click(btn("Damage armor LA #2"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ armor: [{ index: 1, lost: 1 }] }),
    );
    expect(screen.getByText("Damaged")).toBeTruthy();

    fireEvent.click(btn("Damage armor LA #1"));
    fireEvent.click(btn("Damage armor LA #1"));
    expect(onChange.mock.lastCall![0].armor).toEqual([
      { index: 0, lost: 2 },
      { index: 1, lost: 1 },
    ]);
    // Depleted location can't take more armor damage.
    expect(isDisabled(btn("Damage armor LA #1"))).toBe(true);
    expect(screen.getByText("Depleted")).toBeTruthy();

    fireEvent.click(btn("Repair armor LA #1"));
    expect(onChange.mock.lastCall![0].armor).toEqual([
      { index: 0, lost: 1 },
      { index: 1, lost: 1 },
    ]);
  });

  it("tracks rear armor like any other location", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByText("Rear")).toBeTruthy();
    fireEvent.click(btn("Damage armor RTC"));
    fireEvent.click(btn("Damage armor RTC"));
    fireEvent.click(btn("Damage armor RTC"));
    expect(onChange.mock.lastCall![0].armor).toEqual([{ index: 2, lost: 3 }]);
    expect(isDisabled(btn("Damage armor RTC"))).toBe(true);
  });

  it("does not allow damage on a location with no armor", () => {
    render(<Harness />);
    expect(isDisabled(btn("Damage armor HD"))).toBe(true);
    expect(isDisabled(btn("Repair armor HD"))).toBe(true);
  });
});

describe("structure", () => {
  it("needs a manual max before damage, and blank stops tracking", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(isDisabled(btn("Damage structure Left Arm"))).toBe(true);
    expect(screen.getAllByText("Not tracked")).toHaveLength(2);

    const max = screen.getByLabelText("Structure max Left Arm");
    fireEvent.change(max, { target: { value: "2" } });
    expect(onChange.mock.lastCall![0].structure).toEqual([
      { index: 0, max: 2, lost: 0 },
    ]);

    fireEvent.click(btn("Damage structure Left Arm"));
    fireEvent.click(btn("Damage structure Left Arm"));
    expect(onChange.mock.lastCall![0].structure).toEqual([
      { index: 0, max: 2, lost: 2 },
    ]);
    expect(screen.getByText("Destroyed")).toBeTruthy();
    expect(isDisabled(btn("Damage structure Left Arm"))).toBe(true);

    fireEvent.click(btn("Repair structure Left Arm"));
    expect(onChange.mock.lastCall![0].structure[0].lost).toBe(1);

    fireEvent.change(max, { target: { value: "" } });
    expect(onChange.mock.lastCall![0].structure).toEqual([]);
    expect(isDisabled(btn("Damage structure Left Arm"))).toBe(true);
  });

  it("clamps typed maxima and keeps other sections untouched", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Structure max Right Arm"), {
      target: { value: "5000" },
    });
    expect(onChange.mock.lastCall![0].structure).toEqual([
      { index: 1, max: 999, lost: 0 },
    ]);
  });

  it("explains how to enable structure when there are no sections", () => {
    render(<Harness value={{ ...mech(), criticalSlots: [] }} />);
    expect(screen.getByText(/Add locations in Edit/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Structure max/)).toBeNull();
  });
});

describe("structure max typing session", () => {
  const tracked: MechDamage = {
    ...emptyMechDamage(),
    structure: [
      { index: 0, max: 12, lost: 5 },
      { index: 1, max: 8, lost: 2 },
    ],
  };
  const maxInput = () => screen.getByLabelText("Structure max Left Arm");
  const type = (value: string) =>
    fireEvent.change(maxInput(), { target: { value } });
  const leftArm = (onChange: ReturnType<typeof vi.fn>) =>
    (onChange.mock.lastCall![0] as MechDamage).structure.find(
      (s) => s.index === 0,
    );

  it("keeps the original loss through intermediate values", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.focus(maxInput());
    type("1");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 1, lost: 1 });
    type("15");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 15, lost: 5 });
  });

  it("survives clearing the field before typing a new max", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.focus(maxInput());
    type("");
    expect(leftArm(onChange)).toBeUndefined();
    type("15");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 15, lost: 5 });
  });

  it("clamps only the final value against the original loss", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.focus(maxInput());
    type("");
    type("3");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 3, lost: 3 });
  });

  it("removes the track when left blank", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.focus(maxInput());
    type("");
    fireEvent.blur(maxInput());
    expect(leftArm(onChange)).toBeUndefined();
    expect(isDisabled(btn("Damage structure Left Arm"))).toBe(true);
  });

  it("starts a new baseline after blur", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.focus(maxInput());
    type("3");
    fireEvent.blur(maxInput());
    fireEvent.focus(maxInput());
    type("15");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 15, lost: 3 });
  });

  it("keeps changes made elsewhere while the field is focused", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.focus(maxInput());
    type("1");
    // Other locations and counters change mid-session.
    fireEvent.click(btn("Increase heat"));
    fireEvent.click(btn("Damage structure Right Arm"));
    fireEvent.click(btn("Damage armor LA #1"));
    fireEvent.click(btn("Critical hit Right Arm slot 1"));
    type("15");
    const last = onChange.mock.lastCall![0] as MechDamage;
    expect(last.structure).toEqual([
      { index: 0, max: 15, lost: 5 },
      { index: 1, max: 8, lost: 3 },
    ]);
    expect(last.heat).toBe(1);
    expect(last.armor).toEqual([{ index: 0, lost: 1 }]);
    expect(last.criticals).toEqual([{ section: 1, slot: 0 }]);
  });

  it("treats a -/+ tap on the same location as the new baseline", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.focus(maxInput());
    type("10"); // lost stays 5
    // jsdom keeps focus on the input during clicks, like a touch browser might.
    fireEvent.click(btn("Repair structure Left Arm")); // lost 4
    type("1");
    type("12");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 12, lost: 4 });
  });
});

describe("critical hits", () => {
  it("toggles by slot index, including repeats and empty slots", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const third = btn("Critical hit Left Arm slot 3");
    expect(third.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(third);
    expect(onChange.mock.lastCall![0].criticals).toEqual([
      { section: 0, slot: 2 },
    ]);
    expect(third.getAttribute("aria-pressed")).toBe("true");
    // The other "Shoulder" stays unmarked.
    expect(
      btn("Critical hit Left Arm slot 1").getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(btn("Critical hit Left Arm slot 2")); // "-Empty-"
    fireEvent.click(btn("Critical hit Left Arm slot 4")); // ""
    expect(onChange.mock.lastCall![0].criticals).toEqual([
      { section: 0, slot: 1 },
      { section: 0, slot: 2 },
      { section: 0, slot: 3 },
    ]);

    fireEvent.click(third);
    expect(onChange.mock.lastCall![0].criticals).toEqual([
      { section: 0, slot: 1 },
      { section: 0, slot: 3 },
    ]);
  });

  it("labels duplicate sections distinctly", () => {
    const onChange = vi.fn();
    const value = {
      ...mech(),
      criticalSlots: [
        { location: "Left Arm", slots: ["A"] },
        { location: "Left Arm", slots: ["B"] },
      ],
    };
    render(<Harness value={value} onChange={onChange} />);
    fireEvent.click(btn("Critical hit Left Arm #2 slot 1"));
    expect(onChange.mock.lastCall![0].criticals).toEqual([
      { section: 1, slot: 0 },
    ]);
    expect(screen.getByLabelText("Structure max Left Arm #1")).toBeTruthy();
  });

  it("collapses sections for small screens and opens on demand", () => {
    render(<Harness />);
    const section = screen.getByLabelText("Left Arm critical slots");
    const toggle = within(section).getByRole("button", { expanded: false });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("heat and pilot hits", () => {
  it("counts within 0..999 without other rules", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(isDisabled(btn("Decrease heat"))).toBe(true);
    expect(isDisabled(btn("Remove pilot hit"))).toBe(true);
    fireEvent.click(btn("Increase heat"));
    fireEvent.click(btn("Increase heat"));
    fireEvent.click(btn("Decrease heat"));
    fireEvent.click(btn("Add pilot hit"));
    expect(onChange.mock.lastCall![0]).toMatchObject({ heat: 1, pilotHits: 1 });
  });

  it("stops at the upper bound", () => {
    render(
      <Harness initial={{ ...emptyMechDamage(), heat: 999, pilotHits: 999 }} />,
    );
    expect(isDisabled(btn("Increase heat"))).toBe(true);
    expect(isDisabled(btn("Add pilot hit"))).toBe(true);
    expect(isDisabled(btn("Decrease heat"))).toBe(false);
  });
});

describe("controls", () => {
  it("disables every damage control when controlsDisabled", () => {
    const onChange = vi.fn();
    render(
      <Harness
        controlsDisabled
        onChange={onChange}
        initial={{
          ...emptyMechDamage(),
          heat: 2,
          armor: [{ index: 0, lost: 1 }],
        }}
      />,
    );
    const damageControls = screen
      .getAllByRole("button")
      .filter((b) => !b.hasAttribute("aria-expanded"));
    expect(damageControls.length).toBeGreaterThan(0);
    for (const b of damageControls) expect(isDisabled(b)).toBe(true);
    for (const input of screen.getAllByRole("spinbutton")) {
      expect(isDisabled(input)).toBe(true);
    }
    fireEvent.click(btn("Increase heat"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses touch-sized targets and never submits an enclosing form", () => {
    render(
      <form>
        <Harness />
      </form>,
    );
    for (const name of [
      "Damage armor LA #1",
      "Repair armor LA #1",
      "Damage structure Left Arm",
      "Increase heat",
      "Add pilot hit",
    ]) {
      expect(btn(name).className).toMatch(/\bh-11\b/);
    }
    expect(btn("Critical hit Left Arm slot 1").className).toMatch(
      /\bmin-h-11\b/,
    );
    expect(screen.getByLabelText("Structure max Left Arm").className).toMatch(
      /\bh-11\b/,
    );
    for (const b of screen.getAllByRole("button")) {
      expect(b.getAttribute("type")).toBe("button");
    }
  });
});
