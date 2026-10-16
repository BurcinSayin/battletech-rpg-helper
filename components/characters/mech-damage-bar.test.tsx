// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MechDamageBar, MechDamageResetWarning } from "./mech-damage-bar";

afterEach(cleanup);

type Props = Parameters<typeof MechDamageBar>[0];

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    pending: false,
    applying: false,
    stale: false,
    error: null,
    canReset: false,
    onApply: vi.fn(),
    onDiscard: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
  render(<MechDamageBar {...props} />);
  return props;
}

const btn = (name: string) => screen.getByRole("button", { name });
const isDisabled = (el: HTMLElement) => el.matches(":disabled");

describe("MechDamageBar", () => {
  it("is quiet when nothing is pending", () => {
    setup();
    expect(screen.getByRole("status").textContent).toContain("up to date");
    expect(isDisabled(btn("Apply damage"))).toBe(true);
    expect(isDisabled(btn("Discard damage changes"))).toBe(true);
    expect(isDisabled(btn("Reset all damage"))).toBe(true);
  });

  it("offers reset when there is damage to clear", () => {
    const props = setup({ canReset: true });
    fireEvent.click(btn("Reset all damage"));
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it("asks to apply or discard before editing when pending", () => {
    const props = setup({ pending: true, canReset: true });
    const status = screen.getByRole("status").textContent ?? "";
    expect(status).toMatch(/Apply or discard/);
    expect(status).toMatch(/Edit/);
    fireEvent.click(btn("Apply damage"));
    fireEvent.click(btn("Discard damage changes"));
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onDiscard).toHaveBeenCalledTimes(1);
  });

  it("locks every action while applying", () => {
    setup({ pending: true, applying: true, canReset: true });
    expect(btn("Apply damage").textContent).toBe("Applying…");
    for (const name of [
      "Apply damage",
      "Discard damage changes",
      "Reset all damage",
    ]) {
      expect(isDisabled(btn(name))).toBe(true);
    }
  });

  it("only allows discarding a stale draft", () => {
    const props = setup({ pending: true, stale: true, canReset: true });
    expect(screen.getByRole("status").textContent).toMatch(/changed/);
    expect(isDisabled(btn("Apply damage"))).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Reset all damage" }),
    ).toBeNull();
    const discard = btn("Discard damage changes");
    expect(discard.textContent).toMatch(/load latest/i);
    fireEvent.click(discard);
    expect(props.onDiscard).toHaveBeenCalledTimes(1);
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it("shows apply errors as an alert", () => {
    setup({
      pending: true,
      error: "Could not apply damage. Please try again.",
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "Could not apply damage. Please try again.",
    );
    expect(isDisabled(btn("Apply damage"))).toBe(false);
  });

  it("uses touch-sized, non-submitting buttons", () => {
    setup({ pending: true, canReset: true });
    for (const b of screen.getAllByRole("button")) {
      expect(b.className).toMatch(/\bmin-h-11\b/);
      expect(b.getAttribute("type")).toBe("button");
    }
  });
});

describe("MechDamageResetWarning", () => {
  it("explains what a mech change resets and what it keeps", () => {
    render(<MechDamageResetWarning />);
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toMatch(/armor and structure damage/);
    expect(text).toMatch(/structure maxima/);
    expect(text).toMatch(/critical hits/);
    expect(text).toMatch(/heat/);
    expect(text).toMatch(/Pilot hits are kept/);
  });
});
