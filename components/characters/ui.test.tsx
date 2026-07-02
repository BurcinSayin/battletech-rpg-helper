// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Panel, HudButton, Stepper } from "./ui";

afterEach(cleanup);

describe("Panel", () => {
  it("renders the // title, an optional count and action, and children", () => {
    render(
      <Panel title="Skills" count="3 total" action={<button>Add</button>}>
        <p>body</p>
      </Panel>,
    );
    expect(screen.getByText("// Skills")).toBeTruthy();
    expect(screen.getByText("3 total")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("omits the count when not provided", () => {
    render(
      <Panel title="Vitals">
        <p>body</p>
      </Panel>,
    );
    expect(screen.getByText("// Vitals")).toBeTruthy();
  });
});

describe("HudButton", () => {
  it("defaults to the ghost variant and forwards props", () => {
    const onClick = vi.fn();
    render(<HudButton onClick={onClick}>Save</HudButton>);
    const btn = screen.getByRole("button", { name: "Save" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies each variant style without error", () => {
    render(
      <>
        <HudButton variant="primary">P</HudButton>
        <HudButton variant="danger">D</HudButton>
        <HudButton variant="ghost">G</HudButton>
      </>,
    );
    expect(screen.getByText("P").className).toContain("bg-hud-amber");
    expect(screen.getByText("D").className).toContain("text-hud-red");
    expect(screen.getByText("G").className).toContain("border-hud-line");
  });
});

describe("Stepper", () => {
  it("increments by the step and decrements without going below min", () => {
    const onChange = vi.fn();
    render(
      <Stepper label="STR" value={100} onChange={onChange} step={5} min={100} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase STR" }));
    expect(onChange).toHaveBeenLastCalledWith(105);

    // At the min already: decrement is clamped to min.
    fireEvent.click(screen.getByRole("button", { name: "Decrease STR" }));
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("emits the parsed number on direct input and defaults non-finite values to 0", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Stepper label="BOD" value={120} onChange={onChange} />,
    );

    const input = screen.getByLabelText("BOD") as HTMLInputElement;
    expect(input.value).toBe("120");
    fireEvent.change(input, { target: { value: "130" } });
    expect(onChange).toHaveBeenLastCalledWith(130);

    rerender(<Stepper label="BOD" value={NaN} onChange={onChange} />);
    expect((screen.getByLabelText("BOD") as HTMLInputElement).value).toBe("0");
  });

  it("uses the default step of 5 when none is given", () => {
    const onChange = vi.fn();
    render(<Stepper label="DEX" value={100} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase DEX" }));
    expect(onChange).toHaveBeenLastCalledWith(105);
  });
});
