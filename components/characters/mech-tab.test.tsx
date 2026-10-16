// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import type { CatalogEntry } from "@/lib/mech/catalog";
import { emptyMech } from "@/lib/mech/schema";
import type { MechData } from "@/lib/mech/types";

const searchMechCatalog = vi.fn();
const loadCatalogMech = vi.fn();
vi.mock("@/app/(app)/characters/[id]/mech-actions", () => ({
  searchMechCatalog: (q: string) => searchMechCatalog(q),
  loadCatalogMech: (f: string) => loadCatalogMech(f),
}));

import { MechTab, MechView } from "./mech-tab";

const FS9H: CatalogEntry = {
  fileName: "Firestarter FS9-H.mtf",
  definitionName: "Firestarter FS9-H",
  era: "3050",
  mass: "35",
  techBase: "is",
};
const FS9S: CatalogEntry = {
  fileName: "Firestarter FS9-S.mtf",
  definitionName: "Firestarter FS9-S",
  era: "3060",
  mass: "35",
  techBase: "c",
};

function sampleMech(): MechData {
  const m = emptyMech();
  return {
    ...m,
    chassis: "Firestarter",
    model: "FS9-H",
    mass: 35,
    weapons: [
      { name: "ISMediumLaser", location: "Right Arm" },
      { name: "ISMediumLaser", location: "Right Arm", detail: "Ammo:20" },
    ],
    criticalSlots: [
      { location: "Left Arm", slots: ["Shoulder", "-Empty-", "Shoulder", ""] },
      { location: "Right Arm", slots: ["Hand Actuator"] },
    ],
    unsupported: ["quirk:easy_pilot"],
    catalogFile: "Firestarter FS9-H.mtf",
  };
}

beforeEach(() => {
  searchMechCatalog.mockReset();
  loadCatalogMech.mockReset();
});
afterEach(cleanup);

function Harness({
  initial,
  onChange,
}: {
  initial: MechData | null;
  onChange: (next: MechData | null) => void;
}) {
  const [value, setValue] = useState<MechData | null>(initial);
  return (
    <MechTab
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

function searchBox() {
  return screen.getByRole("combobox", { name: "Search predefined mechs" });
}

async function search(text: string) {
  fireEvent.change(searchBox(), { target: { value: text } });
}

describe("MechTab empty state", () => {
  it("offers manual entry without needing the catalog", () => {
    const onChange = vi.fn();
    render(<MechTab value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add mech manually" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(emptyMech());
    expect(searchMechCatalog).not.toHaveBeenCalled();
    expect(loadCatalogMech).not.toHaveBeenCalled();
  });
});

describe("catalog search", () => {
  it("renders distinguishable results and loads a selection without confirmation when empty", async () => {
    searchMechCatalog.mockResolvedValue({ ok: true, results: [FS9H, FS9S] });
    const loaded = { ...sampleMech(), model: "FS9-S" };
    loadCatalogMech.mockResolvedValue({ ok: true, mech: loaded });
    const onChange = vi.fn();
    render(<MechTab value={null} onChange={onChange} />);

    await search("firestarter");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain("Firestarter FS9-H");
    expect(options[0].textContent).toContain("3050");
    expect(options[0].textContent).toContain("35 t");
    expect(options[0].textContent).toContain("Inner Sphere");
    expect(options[1].textContent).toContain("Clan");
    expect(searchMechCatalog).toHaveBeenCalledWith("firestarter");

    fireEvent.click(options[1]);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(loadCatalogMech).toHaveBeenCalledWith("Firestarter FS9-S.mtf");
    expect(onChange).toHaveBeenCalledWith(loaded);
  });

  it("supports keyboard selection", async () => {
    searchMechCatalog.mockResolvedValue({ ok: true, results: [FS9H, FS9S] });
    loadCatalogMech.mockResolvedValue({ ok: true, mech: sampleMech() });
    const onChange = vi.fn();
    render(<MechTab value={null} onChange={onChange} />);
    await search("fire");
    await screen.findAllByRole("option");
    const box = searchBox();
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[1].id,
    );
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(loadCatalogMech).toHaveBeenCalledWith("Firestarter FS9-S.mtf");
  });

  it("shows empty and error states", async () => {
    searchMechCatalog.mockResolvedValueOnce({ ok: true, results: [] });
    render(<MechTab value={null} onChange={vi.fn()} />);
    await search("zzz");
    expect(await screen.findByText("No matching mechs.")).toBeTruthy();

    searchMechCatalog.mockResolvedValueOnce({
      ok: false,
      kind: "unauthenticated",
      message: "Sign in to search predefined mechs.",
    });
    await search("zzzz");
    expect(
      await screen.findByText("Sign in to search predefined mechs."),
    ).toBeTruthy();
    // Manual entry stays available.
    expect(
      screen.getByRole("button", { name: "Add mech manually" }),
    ).toBeTruthy();
  });

  it("ignores stale search responses", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    searchMechCatalog
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce({ ok: true, results: [FS9S] });
    render(<MechTab value={null} onChange={vi.fn()} />);
    await search("fire");
    await waitFor(() => expect(searchMechCatalog).toHaveBeenCalledTimes(1));
    await search("firestarter fs9-s");
    expect(await screen.findByText("Firestarter FS9-S")).toBeTruthy();
    resolveFirst({ ok: true, results: [FS9H] });
    await Promise.resolve();
    expect(screen.queryByText("Firestarter FS9-H")).toBeNull();
  });
});

describe("replacing an existing mech", () => {
  async function pick(entry = FS9S) {
    searchMechCatalog.mockResolvedValue({ ok: true, results: [entry] });
    await search("fire");
    const list = await screen.findByRole("listbox", {
      name: "Predefined mechs",
    });
    fireEvent.click(within(list).getByRole("option"));
  }

  it("asks before replacing and cancel leaves the draft untouched", async () => {
    const onChange = vi.fn();
    render(<MechTab value={sampleMech()} onChange={onChange} />);
    await pick();
    const dialog = screen.getByRole("dialog", {
      name: "Replace current mech draft?",
    });
    expect(dialog.textContent).toContain("unsaved edits");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadCatalogMech).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("replaces the draft once confirmed and loaded", async () => {
    const loaded = { ...sampleMech(), model: "FS9-S" };
    loadCatalogMech.mockResolvedValue({ ok: true, mech: loaded });
    const onChange = vi.fn();
    render(<MechTab value={sampleMech()} onChange={onChange} />);
    await pick();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith(loaded);
  });

  it("keeps the draft and shows an error when the load fails", async () => {
    loadCatalogMech.mockResolvedValue({
      ok: false,
      kind: "unavailable",
      message: "The predefined mech file could not be downloaded.",
    });
    const onChange = vi.fn();
    render(<MechTab value={sampleMech()} onChange={onChange} />);
    await pick();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be downloaded");
    expect(onChange).not.toHaveBeenCalled();
    // Controls are usable again.
    expect(screen.getByLabelText("Chassis").matches(":disabled")).toBe(false);
  });

  it("treats a thrown load as a failure", async () => {
    loadCatalogMech.mockRejectedValue(new Error("network"));
    const onChange = vi.fn();
    render(<MechTab value={sampleMech()} onChange={onChange} />);
    await pick();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await screen.findByRole("alert");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables editing while a load is running", async () => {
    let finish: (v: unknown) => void = () => {};
    loadCatalogMech.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const onChange = vi.fn();
    render(<MechTab value={sampleMech()} onChange={onChange} />);
    await pick();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Chassis").matches(":disabled")).toBe(true),
    );
    finish({ ok: true, mech: sampleMech() });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });
});

describe("removing the mech", () => {
  it("confirms before clearing", () => {
    const onChange = vi.fn();
    render(<MechTab value={sampleMech()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove mech" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove mech" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove",
      }),
    );
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("editing", () => {
  function last(onChange: ReturnType<typeof vi.fn>): MechData {
    return onChange.mock.calls.at(-1)![0] as MechData;
  }
  function typeInto(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }

  it("edits identity and core stat fields, coercing numbers", () => {
    const onChange = vi.fn();
    render(<Harness initial={sampleMech()} onChange={onChange} />);
    typeInto("Chassis", "Firebee");
    expect(last(onChange).chassis).toBe("Firebee");
    typeInto("Model", "X");
    typeInto("MUL ID", "123");
    typeInto("Config", "Biped");
    typeInto("Tech base", "Clan");
    typeInto("Era", "3050");
    typeInto("Source", "TRO");
    typeInto("Rules level", "2");
    typeInto("Engine", "200 Fusion");
    typeInto("Structure", "IS Standard");
    typeInto("Myomer", "Standard");
    typeInto("Heat sinks", "10 Single");
    typeInto("Mass", "55");
    typeInto("Walk MP", "5");
    typeInto("Jump MP", "250");
    expect(last(onChange)).toMatchObject({
      chassis: "Firebee",
      model: "X",
      mulId: "123",
      config: "Biped",
      techBase: "Clan",
      era: "3050",
      source: "TRO",
      rulesLevel: "2",
      engine: "200 Fusion",
      structure: "IS Standard",
      myomer: "Standard",
      heatSinks: "10 Single",
      mass: 55,
      walkMP: 5,
      jumpMP: 99, // clamped to the schema bound
    });
    // Blank / junk numbers become 0 instead of NaN.
    typeInto("Mass", "");
    expect(last(onChange).mass).toBe(0);
    typeInto("Mass", "-4");
    expect(last(onChange).mass).toBe(0);
    expect(Number.isNaN(last(onChange).walkMP)).toBe(false);
  });

  it("edits armor type and per-location values", () => {
    const onChange = vi.fn();
    render(<Harness initial={sampleMech()} onChange={onChange} />);
    typeInto("Armor type", "Ferro-Fibrous");
    typeInto("Armor LA", "12");
    typeInto("Armor RTC", "5000");
    const out = last(onChange);
    expect(out.armorType).toBe("Ferro-Fibrous");
    expect(out.armor.find((a) => a.location === "LA")?.value).toBe(12);
    expect(out.armor.find((a) => a.location === "RTC")?.value).toBe(999);
    expect(out.armor.map((a) => a.location)).toEqual(
      emptyMech().armor.map((a) => a.location),
    );
  });

  it("adds, edits, reorders and removes weapons while allowing repeats", () => {
    const onChange = vi.fn();
    render(<Harness initial={sampleMech()} onChange={onChange} />);
    expect(
      (screen.getByLabelText("Weapon 2 detail") as HTMLInputElement).value,
    ).toBe("Ammo:20");
    fireEvent.click(screen.getByRole("button", { name: "Add weapon" }));
    typeInto("Weapon 3 name", "ISMediumLaser");
    typeInto("Weapon 3 location", "Left Arm");
    expect(last(onChange).weapons.map((w) => w.name)).toEqual([
      "ISMediumLaser",
      "ISMediumLaser",
      "ISMediumLaser",
    ]);
    typeInto("Weapon 1 detail", "x");
    expect(last(onChange).weapons[0].detail).toBe("x");
    typeInto("Weapon 1 detail", "");
    expect(last(onChange).weapons[0].detail).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Move weapon 3 up" }));
    expect(last(onChange).weapons.map((w) => w.location)).toEqual([
      "Right Arm",
      "Left Arm",
      "Right Arm",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Remove weapon 1" }));
    expect(last(onChange).weapons).toHaveLength(2);
    expect(last(onChange).weapons[0].location).toBe("Left Arm");
  });

  it("edits critical slots, keeping order, repeats and empty slots", () => {
    const onChange = vi.fn();
    render(<Harness initial={sampleMech()} onChange={onChange} />);
    expect((screen.getByLabelText("LA slot 2") as HTMLInputElement).value).toBe(
      "-Empty-",
    );
    typeInto("LA slot 2", "Upper Arm Actuator");
    expect(last(onChange).criticalSlots[0].slots).toEqual([
      "Shoulder",
      "Upper Arm Actuator",
      "Shoulder",
      "",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Add LA slot" }));
    expect(last(onChange).criticalSlots[0].slots.at(-1)).toBe("-Empty-");
    expect(last(onChange).criticalSlots[0].slots).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Remove LA slot 1" }));
    expect(last(onChange).criticalSlots[0].slots).toEqual([
      "Upper Arm Actuator",
      "Shoulder",
      "",
      "-Empty-",
    ]);
    typeInto("RA slot 1", "Hand");
    expect(last(onChange).criticalSlots[1].slots).toEqual(["Hand"]);
  });

  it("keeps unsupported lines editable", () => {
    const onChange = vi.fn();
    render(<Harness initial={sampleMech()} onChange={onChange} />);
    const area = screen.getByLabelText("Unsupported source lines");
    expect((area as HTMLTextAreaElement).value).toBe("quirk:easy_pilot");
    fireEvent.change(area, { target: { value: "quirk:easy_pilot\nfoo:bar" } });
    expect(last(onChange).unsupported).toEqual(["quirk:easy_pilot", "foo:bar"]);
    fireEvent.change(area, { target: { value: "" } });
    expect(last(onChange).unsupported).toEqual([]);
  });

  it("does not submit an enclosing form on Enter", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) =>
      e.preventDefault(),
    );
    render(
      <form onSubmit={onSubmit}>
        <MechTab value={sampleMech()} onChange={vi.fn()} />
      </form>,
    );
    const chassis = screen.getByLabelText("Chassis");
    // fireEvent returns false when the default action was prevented.
    expect(fireEvent.keyDown(chassis, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(searchBox(), { key: "Enter" })).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    // Every button inside is non-submitting.
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
  });

  it("locks everything when disabled", () => {
    render(<MechTab value={sampleMech()} onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText("Chassis").matches(":disabled")).toBe(true);
    expect(searchBox().matches(":disabled")).toBe(true);
  });
});

describe("MechView", () => {
  it("shows a muted empty state", () => {
    render(<MechView mech={null} />);
    expect(screen.getByText("No mech")).toBeTruthy();
  });

  it("summarises the mech in order", () => {
    render(<MechView mech={sampleMech()} />);
    expect(screen.getByText("Firestarter FS9-H")).toBeTruthy();
    expect(screen.getAllByText("ISMediumLaser")).toHaveLength(2);
    const section = screen.getByLabelText("Left Arm critical slots");
    const items = within(section).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "1Shoulder",
      "2-Empty-",
      "3Shoulder",
      "4",
    ]);
    expect(screen.getByText("quirk:easy_pilot")).toBeTruthy();
  });
});
