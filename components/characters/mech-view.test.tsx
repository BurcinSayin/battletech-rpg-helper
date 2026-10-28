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
import { MechView, type MechViewProps } from "./mech-view";

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
  pilot,
}: {
  initial?: MechDamage;
  onChange?: (next: MechDamage) => void;
  value?: MechData | null;
  controlsDisabled?: boolean;
  pilot?: MechViewProps["pilot"];
}) {
  const [damage, setDamage] = useState(initial);
  return (
    <MechView
      mech={value}
      pilot={pilot}
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
        pilot={{ skills: [{ name: "Piloting/'Mech", xp: 30 }], traits: [] }}
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
        pilot={{ skills: [{ name: "Piloting/'Mech", xp: 30 }], traits: [] }}
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
    expect(skillValue("Mech piloting")).toBe("Lvl 1 · SA/8");
    expect(skillValue("Mech gunnery")).toBe("N/A");
    expect(screen.getByText("Damaged")).toBeTruthy();
    const section = screen.getByLabelText("Left Arm critical slots");
    const items = within(section).getAllByRole("listitem");
    expect(items[2].textContent).toContain("(critical hit)");
    expect(items[0].textContent).toBe("1Shoulder");
  });
});

function skillValue(label: string): string | null {
  return screen
    .getByText(label, { selector: "dt" })
    .parentElement!.querySelector("dd")!.textContent;
}

describe("pilot skill information", () => {
  it("shows character levels and sheet metadata even when damage is locked", () => {
    render(
      <Harness
        controlsDisabled
        pilot={{
          skills: [
            { name: "Gunnery/'Mech", xp: 80 },
            { name: "Piloting/'Mech", xp: 30 },
          ],
          traits: [],
        }}
      />,
    );
    expect(skillValue("Mech piloting")).toBe("Lvl 1 · SA/8");
    expect(skillValue("Mech gunnery")).toBe("Lvl 3 · SA/8");
    expect(isDisabled(btn("Increase heat"))).toBe(true);
  });

  it("recalculates when learner traits change", () => {
    const skills = [{ name: "Piloting/'Mech", xp: 24 }];
    const { rerender } = render(
      <Harness
        pilot={{ skills, traits: [{ name: "Fast Learner", xp: 300 }] }}
      />,
    );
    expect(skillValue("Mech piloting")).toBe("Lvl 1 · SA/8");
    rerender(<Harness pilot={{ skills, traits: [] }} />);
    expect(skillValue("Mech piloting")).toBe("Lvl 0 · SA/8");
  });

  it.each([
    ["Piloting/`Mech", "Gunnery/Mech"],
    ["Piloting/Mech", "Gunnery/`Mech"],
  ])("resolves legacy aliases %s and %s", (piloting, gunnery) => {
    render(
      <Harness
        pilot={{
          skills: [
            { name: piloting, xp: 30 },
            { name: gunnery, xp: 80 },
          ],
          traits: [],
        }}
      />,
    );
    expect(skillValue("Mech piloting")).toBe("Lvl 1 · SA/8");
    expect(skillValue("Mech gunnery")).toBe("Lvl 3 · SA/8");
  });

  it("ignores other specialties and parent names but displays zero XP", () => {
    render(
      <Harness
        pilot={{
          skills: [
            { name: "Piloting/Aerospace", xp: 80 },
            { name: "Piloting", xp: 80 },
            { name: "Gunnery", xp: 80 },
            { name: "Gunnery/Aerospace", xp: 80 },
            { name: "Gunnery/'Mech", xp: 0 },
          ],
          traits: [],
        }}
      />,
    );
    expect(skillValue("Mech piloting")).toBe("N/A");
    expect(skillValue("Mech gunnery")).toBe("Lvl 0 · SA/8");
  });

  it("shows every colliding canonical and alias row in input order", () => {
    render(
      <Harness
        pilot={{
          skills: [
            { name: "Gunnery/Mech", xp: 80 },
            { name: "Gunnery/'Mech", xp: 30 },
            { name: "Gunnery/`Mech", xp: 120 },
          ],
          traits: [],
        }}
      />,
    );
    const card = screen.getByText("Mech gunnery").parentElement!;
    expect(
      Array.from(card.querySelector("dd")!.children, (row) => row.textContent),
    ).toEqual(["Lvl 3 · SA/8", "Lvl 1 · SA/8", "Lvl 4 · SA/8"]);
  });

  it("shows unavailable information without a character", () => {
    render(<Harness />);
    expect(skillValue("Mech piloting")).toBe("N/A");
    expect(skillValue("Mech gunnery")).toBe("N/A");
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
    fireEvent.click(btn("Track structure"));
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
    fireEvent.click(btn("Track structure"));
    fireEvent.change(screen.getByLabelText("Structure max Right Arm"), {
      target: { value: "5000" },
    });
    expect(onChange.mock.lastCall![0].structure).toEqual([
      { index: 1, max: 999, lost: 0 },
    ]);
  });

  it.each([false, true])(
    "omits setup with no locations (interactive: %s)",
    (interactive) => {
      render(
        <MechView
          mech={{ ...mech(), criticalSlots: [] }}
          damage={{
            ...emptyMechDamage(),
            structure: [{ index: 0, max: 12, lost: 5 }],
          }}
          onDamageChange={interactive ? vi.fn() : undefined}
        />,
      );
      expect(screen.queryByText("// STRUCTURE", { exact: true })).toBeNull();
      expect(screen.queryByRole("button", { name: /structure/i })).toBeNull();
      expect(screen.queryByLabelText(/^Structure max/)).toBeNull();
    },
  );

  it.each([
    undefined,
    emptyMechDamage(),
    {
      ...emptyMechDamage(),
      structure: [{ index: 0, max: 0, lost: 0 }],
    },
    {
      ...emptyMechDamage(),
      structure: [{ index: 2, max: 12, lost: 0 }],
    },
  ])("hides normalized empty structure by default: %j", (damage) => {
    const { rerender } = render(<MechView mech={mech()} damage={damage} />);
    expect(screen.queryByText("// STRUCTURE", { exact: true })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Track structure" }),
    ).toBeNull();
    rerender(
      <MechView mech={mech()} damage={damage} onDamageChange={vi.fn()} />,
    );
    expect(screen.queryByText("// STRUCTURE", { exact: true })).toBeNull();
    expect(btn("Track structure").getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps tracked location identity, meters and damage controls outside setup", () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={{
          ...emptyMechDamage(),
          structure: [{ index: 1, max: 8, lost: 3 }],
        }}
        onChange={onChange}
      />,
    );
    const panel = screen
      .getByText("// STRUCTURE", { exact: true })
      .closest("section")!;
    expect(within(panel).queryByText("Left Arm")).toBeNull();
    const card = within(panel).getByText("Right Arm").closest("li")!;
    expect(card.textContent).toContain("5/8");
    expect(card.querySelector('[style="width: 63%;"]')).toBeTruthy();
    expect(screen.queryByLabelText(/^Structure max/)).toBeNull();
    fireEvent.click(btn("Damage structure Right Arm"));
    expect(onChange.mock.lastCall![0].structure).toEqual([
      { index: 1, max: 8, lost: 4 },
    ]);
    for (let i = 0; i < 4; i++)
      fireEvent.click(btn("Damage structure Right Arm"));
    expect(within(panel).getByText("Destroyed")).toBeTruthy();
    expect(card.textContent).toContain("0/8");
  });

  it("opens and closes setup without damage changes, then retains configured tracks", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const toggle = btn("Track structure");
    toggle.focus();
    fireEvent.click(toggle);
    expect(btn("Done configuring structure")).toBe(toggle);
    expect(document.activeElement).toBe(toggle);
    expect(screen.getAllByText("Not tracked")).toHaveLength(2);
    fireEvent.click(toggle);
    expect(screen.queryByText("// STRUCTURE", { exact: true })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Structure max Left Arm"), {
      target: { value: "12" },
    });
    fireEvent.click(toggle);
    expect(screen.queryByLabelText(/^Structure max/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Damage structure Right Arm" }),
    ).toBeNull();
    expect(btn("Damage structure Left Arm")).toBeTruthy();
    fireEvent.click(btn("Configure structure"));
    fireEvent.change(screen.getByLabelText("Structure max Right Arm"), {
      target: { value: "8" },
    });
    expect(onChange.mock.lastCall![0].structure).toEqual([
      { index: 0, max: 12, lost: 0 },
      { index: 1, max: 8, lost: 0 },
    ]);
  });

  it("keeps the final track input mounted and focused through clearing and retyping", () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={{
          ...emptyMechDamage(),
          structure: [{ index: 0, max: 12, lost: 5 }],
        }}
        onChange={onChange}
      />,
    );
    fireEvent.click(btn("Configure structure"));
    const input = screen.getByLabelText("Structure max Left Arm");
    input.focus();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByLabelText("Structure max Left Arm")).toBe(input);
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "15" } });
    expect(document.activeElement).toBe(input);
    expect(onChange.mock.lastCall![0].structure).toEqual([
      { index: 0, max: 15, lost: 5 },
    ]);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(btn("Done configuring structure"));
    expect(screen.queryByText("// STRUCTURE", { exact: true })).toBeNull();
  });

  it("follows current read-only props through empty, tracked and null mechs", () => {
    const { rerender } = render(<MechView mech={mech()} />);
    const tracked = {
      ...emptyMechDamage(),
      structure: [{ index: 1, max: 8, lost: 3 }],
    };
    rerender(<MechView mech={mech()} damage={tracked} />);
    expect(screen.getByText("// STRUCTURE", { exact: true })).toBeTruthy();
    rerender(<MechView mech={mech()} damage={emptyMechDamage()} />);
    expect(screen.queryByText("// STRUCTURE", { exact: true })).toBeNull();
    rerender(<MechView mech={null} damage={tracked} />);
    expect(screen.getByText("No mech")).toBeTruthy();
    rerender(<MechView mech={mech()} damage={tracked} />);
    expect(screen.getByText("// STRUCTURE", { exact: true })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /structure/i })).toBeNull();
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
    fireEvent.click(btn("Configure structure"));
    fireEvent.focus(maxInput());
    type("1");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 1, lost: 1 });
    type("15");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 15, lost: 5 });
  });

  it("survives clearing the field before typing a new max", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.click(btn("Configure structure"));
    fireEvent.focus(maxInput());
    type("");
    expect(leftArm(onChange)).toBeUndefined();
    type("15");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 15, lost: 5 });
  });

  it("clamps only the final value against the original loss", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.click(btn("Configure structure"));
    fireEvent.focus(maxInput());
    type("");
    type("3");
    expect(leftArm(onChange)).toEqual({ index: 0, max: 3, lost: 3 });
  });

  it("removes the track when left blank", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.click(btn("Configure structure"));
    fireEvent.focus(maxInput());
    type("");
    fireEvent.blur(maxInput());
    expect(leftArm(onChange)).toBeUndefined();
    expect(isDisabled(btn("Damage structure Left Arm"))).toBe(true);
  });

  it("starts a new baseline after blur", () => {
    const onChange = vi.fn();
    render(<Harness initial={tracked} onChange={onChange} />);
    fireEvent.click(btn("Configure structure"));
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
    fireEvent.click(btn("Configure structure"));
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
    fireEvent.click(btn("Configure structure"));
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
    fireEvent.click(btn("Track structure"));
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
  it("cools repeatedly to zero without changing other damage", () => {
    const onChange = vi.fn();
    const initial: MechDamage = {
      heat: 25,
      pilotHits: 2,
      armor: [{ index: 1, lost: 2 }],
      structure: [{ index: 0, max: 12, lost: 3 }],
      criticals: [{ section: 0, slot: 2 }],
    };
    render(<Harness initial={initial} onChange={onChange} />);
    for (const heat of [15, 5, 0]) {
      fireEvent.click(btn("Cool heat"));
      expect(onChange).toHaveBeenLastCalledWith({ ...initial, heat });
      const counter = screen.getByText("Heat").parentElement!;
      expect(within(counter).getByText(String(heat))).toBeTruthy();
    }
    expect(isDisabled(btn("Cool heat"))).toBe(true);
    fireEvent.click(btn("Cool heat"));
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["11 IS Double", 14],
    ["10", 15],
    [" 11 IS Double ", 14],
  ])("uses the raw sink count from %j", (heatSinks, heat) => {
    const onChange = vi.fn();
    render(
      <Harness
        value={{ ...mech(), heatSinks }}
        initial={{ ...emptyMechDamage(), heat: 25 }}
        onChange={onChange}
      />,
    );
    fireEvent.click(btn("Cool heat"));
    expect(onChange.mock.lastCall![0].heat).toBe(heat);
  });

  it.each([
    "",
    "Single",
    "0 Single",
    "-1 Single",
    "10.5 Single",
    "1e2 Single",
    "10Single",
    "9007199254740992 Single",
  ])("disables cooling for invalid sinks %j", (heatSinks) => {
    const onChange = vi.fn();
    render(
      <Harness
        value={{ ...mech(), heatSinks }}
        initial={{ ...emptyMechDamage(), heat: 25 }}
        onChange={onChange}
      />,
    );
    expect(isDisabled(btn("Cool heat"))).toBe(true);
    fireEvent.click(btn("Cool heat"));
    expect(onChange).not.toHaveBeenCalled();
    expect(isDisabled(btn("Decrease heat"))).toBe(false);
  });

  it("cannot cool at zero heat", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(isDisabled(btn("Cool heat"))).toBe(true);
    fireEvent.click(btn("Cool heat"));
    expect(onChange).not.toHaveBeenCalled();
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
    expect(screen.queryByText("// STRUCTURE", { exact: true })).toBeNull();
    expect(isDisabled(btn("Track structure"))).toBe(true);
    fireEvent.click(btn("Track structure"));
    expect(screen.queryByLabelText(/^Structure max/)).toBeNull();
    fireEvent.click(btn("Increase heat"));
    fireEvent.click(btn("Cool heat"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("locks open setup and damage controls without closing or mutating damage", () => {
    const onChange = vi.fn();
    const initial = {
      ...emptyMechDamage(),
      structure: [{ index: 0, max: 12, lost: 5 }],
    };
    const { rerender } = render(
      <Harness initial={initial} onChange={onChange} />,
    );
    fireEvent.click(btn("Configure structure"));
    rerender(
      <Harness initial={initial} onChange={onChange} controlsDisabled />,
    );
    const input = screen.getByLabelText("Structure max Left Arm");
    expect(isDisabled(input)).toBe(true);
    for (const name of [
      "Done configuring structure",
      "Damage structure Left Arm",
      "Repair structure Left Arm",
    ]) {
      expect(isDisabled(btn(name))).toBe(true);
      fireEvent.click(btn(name));
    }
    expect(
      btn("Done configuring structure").getAttribute("aria-expanded"),
    ).toBe("true");
    expect((input as HTMLInputElement).value).toBe("12");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("never submits an enclosing form from setup or damage controls", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness
          initial={{ ...emptyMechDamage(), heat: 25 }}
          onChange={onChange}
        />
      </form>,
    );
    fireEvent.click(btn("Track structure"));
    fireEvent.change(screen.getByLabelText("Structure max Left Arm"), {
      target: { value: "12" },
    });
    fireEvent.click(btn("Damage structure Left Arm"));
    fireEvent.click(btn("Done configuring structure"));
    fireEvent.click(btn("Configure structure"));
    for (const b of screen.getAllByRole("button")) {
      expect(b.getAttribute("type")).toBe("button");
    }
    fireEvent.click(btn("Cool heat"));
    expect(onChange.mock.lastCall![0].heat).toBe(15);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("weapon reference values", () => {
  it("shows band order, valid zeroes, unavailable matches, and repeated source mounts", () => {
    const value = {
      ...mech(),
      techBase: "Inner Sphere",
      weapons: [
        {
          name: "(IS) Heavy Gauss Rifle",
          location: "Right Arm",
          detail: "Ammo:4",
        },
        { name: "(IS) Machine Gun", location: "Left Arm", detail: "" },
        {
          name: "ISMediumLaser",
          location: "Right Torso",
          detail: "Original ambiguity",
        },
        { name: "Custom weapon", location: "Center Torso", detail: "Keep me" },
        {
          name: "(IS) Machine Gun",
          location: "Left Torso",
          detail: "Second mount",
        },
      ],
    };
    render(<MechView mech={value} />);
    const table = screen.getByRole("table", { name: /S\/M\/L = short/ });
    const rows = within(table).getAllByRole("row").slice(1);
    const cells = rows.map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    );
    expect(cells).toEqual([
      [
        "(IS) Heavy Gauss Rifle",
        "Right Arm",
        "2",
        "25 / 20 / 10",
        "4 / 6 / 13 / 20",
        "Ammo:4",
      ],
      ["(IS) Machine Gun", "Left Arm", "0", "2 / 2 / 2", "0 / 1 / 2 / 3", ""],
      [
        "ISMediumLaserAmbiguous catalog match",
        "Right Torso",
        "—",
        "—",
        "—",
        "Original ambiguity",
      ],
      [
        "Custom weaponNo catalog match",
        "Center Torso",
        "—",
        "—",
        "—",
        "Keep me",
      ],
      [
        "(IS) Machine Gun",
        "Left Torso",
        "0",
        "2 / 2 / 2",
        "0 / 1 / 2 / 3",
        "Second mount",
      ],
    ]);
  });

  it("updates references with declared technology while damage controls are disabled", () => {
    const value = {
      ...mech(),
      techBase: "Inner Sphere",
      weapons: [
        { name: "ER Large Laser", location: "Left Arm", detail: "" },
        { name: "2 LRM 20 (R)", location: "Left Torso", detail: "Ammo:20" },
      ],
    };
    const onChange = vi.fn();
    const { rerender } = render(
      <MechView mech={value} controlsDisabled onDamageChange={onChange} />,
    );
    const table = screen.getByRole("table", { name: /S\/M\/L = short/ });
    expect(within(table).getByText("8 / 8 / 8")).toBeTruthy();
    expect(within(table).getByText("0 / 7 / 14 / 19")).toBeTruthy();
    expect(within(table).getByText("1 / 1 / 1")).toBeTruthy();
    expect(within(table).getByText("6 / 7 / 14 / 21")).toBeTruthy();
    expect(
      within(table).getByText("Cluster weapon; not calculated salvo damage."),
    ).toBeTruthy();
    expect(isDisabled(btn("Increase heat"))).toBe(true);
    rerender(
      <MechView
        mech={{ ...value, techBase: "Clan" }}
        controlsDisabled
        onDamageChange={onChange}
      />,
    );
    expect(within(table).getByText("10 / 10 / 10")).toBeTruthy();
    expect(within(table).getByText("0 / 8 / 15 / 25")).toBeTruthy();
    expect(within(table).getByText("ER Large Laser")).toBeTruthy();
    expect(within(table).getByText("Ammo:20")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    rerender(<MechView mech={{ ...value, techBase: "Mixed (IS Chassis)" }} />);
    expect(within(table).getAllByText("Ambiguous catalog match")).toHaveLength(
      2,
    );
    expect(within(table).queryByText("10 / 10 / 10")).toBeNull();
  });
});
