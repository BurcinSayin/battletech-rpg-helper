// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { readFixture } from "@/lib/btcc/test-fixtures";

// The import client imports the server action; stub it so the jsdom test never
// pulls server-only modules and we can assert what it's called with.
const { importCharacter } = vi.hoisted(() => ({ importCharacter: vi.fn() }));
vi.mock("@/app/(app)/characters/actions", () => ({ importCharacter }));

import { ImportClient } from "./import-client";

afterEach(() => {
  cleanup();
  importCharacter.mockReset();
});

/** Build a File whose `.text()` deterministically resolves to `content`. */
function makeFile(content: string, name = "lisa.btcc"): File {
  const file = new File([content], name, { type: "application/octet-stream" });
  Object.defineProperty(file, "text", { value: async () => content });
  return file;
}

function selectFile(file: File) {
  fireEvent.change(screen.getByLabelText("Upload .btcc file"), {
    target: { files: [file] },
  });
}

describe("ImportClient", () => {
  it("previews a parsed .btcc file with an Import button", async () => {
    render(<ImportClient />);
    selectFile(makeFile(readFixture("lisa.btcc")));

    expect(
      await screen.findByRole("button", { name: "Import character" }),
    ).toBeTruthy();
    expect(screen.getByText("Lisa")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("rejects a file that doesn't look like a character", async () => {
    render(<ImportClient />);
    selectFile(makeFile("just some notes", "notes.txt"));

    expect(
      await screen.findByText(/doesn't look like a BattleTech character/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Import character" })).toBeNull();
  });

  it("lists skill/trait names not in the catalog", async () => {
    render(<ImportClient />);
    // Fabricate a minimal .btcc with a clearly non-catalog skill and trait.
    const text = "name:Test\nskill:Totally Made Up Skill=10\ntrait:Totally Made Up Trait=5\n";
    selectFile(makeFile(text, "made-up.btcc"));

    // Scope to the warning block (the names also appear in the sheet's lists).
    const heading = await screen.findByText(/not in the rules catalog/);
    const banner = heading.closest("div") as HTMLElement;
    expect(within(banner).getByText(/Totally Made Up Skill/)).toBeTruthy();
    expect(within(banner).getByText(/Totally Made Up Trait/)).toBeTruthy();
  });

  it("previews derived trait TP and imports the unchanged raw file text", async () => {
    importCharacter.mockResolvedValue({ ok: false, kind: "error", message: "" });
    const content =
      "name:Trait Preview\ntrait:Rank=270\ntrait:Compulsion=-125\ntrait:Toughness=299\ntrait:Custom Trait=270\n";
    render(<ImportClient />);
    selectFile(makeFile(content, "trait-preview.btcc"));

    const importButton = await screen.findByRole("button", {
      name: "Import character",
    });
    expect(screen.getByRole("heading", { name: "Trait Preview" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    const panel = within(
      screen.getByRole("heading", { name: "// Traits" }).closest("section")!,
    );
    expect(panel.getByText("4 total")).toBeTruthy();
    expect(panel.getAllByRole("listitem")).toHaveLength(4);
    for (const [name, level] of [
      ["Rank", "+2 TP"],
      ["Compulsion", "-1 TP"],
      ["Toughness", "0 TP · Inactive"],
      ["Custom Trait", "+2 TP"],
    ]) {
      const row = within(panel.getByText(name, { exact: true }).closest("li")!);
      expect(row.getByText(level, { exact: true })).toBeTruthy();
    }
    expect(panel.queryByText(/270|-125|299/)).toBeNull();

    fireEvent.click(importButton);
    await waitFor(() => expect(importCharacter).toHaveBeenCalledWith(content));
  });

  it("returns to the dropzone on Cancel", async () => {
    render(<ImportClient />);
    selectFile(makeFile(readFixture("lisa.btcc")));

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Import character" })).toBeNull();
    expect(screen.getByLabelText("Upload .btcc file")).toBeTruthy();
  });
});
