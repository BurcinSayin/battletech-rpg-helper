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

  it("sends the raw file text to importCharacter on confirm", async () => {
    importCharacter.mockResolvedValue({ ok: false, kind: "error", message: "" });
    const content = readFixture("lisa.btcc");
    render(<ImportClient />);
    selectFile(makeFile(content));

    fireEvent.click(await screen.findByRole("button", { name: "Import character" }));
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
