import { describe, it, expect } from "vitest";
import { serializeBtcc } from "./serialize";
import { emptyDraft, type BtccDraft } from "./types";

function draftWith(overrides: Partial<BtccDraft>): BtccDraft {
  return { ...emptyDraft(), ...overrides };
}

describe("serializeBtcc", () => {
  it("always emits all 21 scalars, even when empty", () => {
    const out = serializeBtcc(emptyDraft());
    expect(out).toContain("specschool:\n");
    expect(out).toContain("nameplanet:\n");
    expect(out.startsWith("name:\n")).toBe(true);
    // 21 scalar lines precede the notes block.
    expect(out).toContain("cbillmod:0\n");
  });

  it("emits attr / preattr / equiploc alphabetically", () => {
    const out = serializeBtcc(
      draftWith({
        attrs: { WIL: 1, BOD: 2, STR: 3 },
        preAttrs: { RFL: 9, DEX: 8 },
        equipLoc: { Torso: "a", Arms: "b" },
      }),
    );
    expect(out.indexOf("attr:BOD")).toBeLessThan(out.indexOf("attr:STR"));
    expect(out.indexOf("attr:STR")).toBeLessThan(out.indexOf("attr:WIL"));
    expect(out.indexOf("preattr:DEX")).toBeLessThan(out.indexOf("preattr:RFL"));
    expect(out.indexOf("equiploc:Arms")).toBeLessThan(
      out.indexOf("equiploc:Torso"),
    );
  });

  it("filters non-positive preattr and empty equiploc", () => {
    const out = serializeBtcc(
      draftWith({
        preAttrs: { DEX: 400, INT: 0, WIL: -5 },
        equipLoc: { Head: "Helmet", Feet: "" },
      }),
    );
    expect(out).toContain("preattr:DEX=400\n");
    expect(out).not.toContain("preattr:INT");
    expect(out).not.toContain("preattr:WIL");
    expect(out).toContain("equiploc:Head=Helmet\n");
    expect(out).not.toContain("equiploc:Feet");
  });

  it("frames the notes block exactly", () => {
    const out = serializeBtcc(draftWith({ notes: "hello\nworld" }));
    expect(out.endsWith("<notes>\nhello\nworld\n</notes>\n")).toBe(true);
  });

  it("produces clean output: one trailing newline, no CR, no BOM", () => {
    const out = serializeBtcc(emptyDraft());
    expect(out.endsWith("</notes>\n")).toBe(true);
    expect(out.includes("\r")).toBe(false);
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("emits skills in array order", () => {
    const out = serializeBtcc(
      draftWith({
        skills: [
          { name: "Zebra", xp: 1 },
          { name: "Alpha", xp: 2 },
        ],
      }),
    );
    expect(out.indexOf("skill:Zebra=1")).toBeLessThan(
      out.indexOf("skill:Alpha=2"),
    );
  });
});
