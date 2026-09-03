// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ConflictDialog } from "./conflict-dialog";

afterEach(cleanup);

describe("ConflictDialog", () => {
  it("is an accessible dialog named by its title", () => {
    render(<ConflictDialog onReload={vi.fn()} onKeepEditing={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Remote changes" })).toBeTruthy();
  });

  it("wires Keep editing to onKeepEditing only", () => {
    const onKeepEditing = vi.fn();
    const onReload = vi.fn();
    render(<ConflictDialog onReload={onReload} onKeepEditing={onKeepEditing} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });

  it("wires Reload to onReload only", () => {
    const onKeepEditing = vi.fn();
    const onReload = vi.fn();
    render(<ConflictDialog onReload={onReload} onKeepEditing={onKeepEditing} />);
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onKeepEditing).not.toHaveBeenCalled();
  });

  it("maps Escape to keep editing so a stray keypress never discards edits", () => {
    const onKeepEditing = vi.fn();
    const onReload = vi.fn();
    render(<ConflictDialog onReload={onReload} onKeepEditing={onKeepEditing} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });

  it("focuses the non-destructive action on open", () => {
    render(<ConflictDialog onReload={vi.fn()} onKeepEditing={vi.fn()} />);
    expect(document.activeElement?.textContent).toBe("Keep editing");
  });

  it("never submits the surrounding editor form", () => {
    const onKeepEditing = vi.fn();
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <ConflictDialog onReload={vi.fn()} onKeepEditing={onKeepEditing} />
      </form>,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
  });
});
