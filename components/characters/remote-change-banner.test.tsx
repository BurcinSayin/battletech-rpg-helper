// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RemoteChangeBanner } from "./remote-change-banner";

afterEach(cleanup);

describe("RemoteChangeBanner", () => {
  it("is a status in normal flow, not a modal dialog (AC 21)", () => {
    render(<RemoteChangeBanner onReload={vi.fn()} onDismiss={vi.fn()} />);
    const banner = screen.getByRole("status");
    expect(banner).toBeTruthy();
    // The thing that makes it non-destructive: no dialog semantics, no scrim.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(banner.getAttribute("aria-modal")).toBeNull();
    expect(banner.className).not.toContain("fixed");
  });

  it("offers Reload and Dismiss, and calls exactly the one clicked (AC 22)", () => {
    const onReload = vi.fn();
    const onDismiss = vi.fn();
    render(<RemoteChangeBanner onReload={onReload} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
