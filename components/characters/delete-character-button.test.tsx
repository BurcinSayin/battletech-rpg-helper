// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteCharacterButton } from "./delete-character-button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DeleteCharacterButton", () => {
  it("does not delete when confirmation is dismissed", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const deleteAction = vi.fn().mockResolvedValue(undefined);
    render(<DeleteCharacterButton name="Pilot" deleteAction={deleteAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Pilot" }));

    expect(confirm).toHaveBeenCalledWith("Delete “Pilot”? This cannot be undone.");
    expect(deleteAction).not.toHaveBeenCalled();
  });

  it("deletes once when confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const deleteAction = vi.fn().mockResolvedValue(undefined);
    render(<DeleteCharacterButton name="Pilot" deleteAction={deleteAction} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Pilot" }));

    await waitFor(() => expect(deleteAction).toHaveBeenCalledTimes(1));
  });

  it("guards form submission independently of a mouse click", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const deleteAction = vi.fn().mockResolvedValue(undefined);
    render(<DeleteCharacterButton name="Pilot" deleteAction={deleteAction} />);

    const button = screen.getByRole("button", { name: "Delete Pilot" });
    fireEvent.submit(button.closest("form")!);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deleteAction).not.toHaveBeenCalled();
  });
});
