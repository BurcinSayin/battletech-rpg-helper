import { describe, it, expect } from "vitest";
import { emptyDraft } from "@/lib/btcc/types";
import { parseBtcc } from "@/lib/btcc";
import { readFixture } from "@/lib/btcc/test-fixtures";
import {
  IMPORT_FALLBACK_NAME,
  NAME_MAX_LENGTH,
  looksLikeCharacter,
  normalizeImportName,
  prepareImport,
} from "./import";

describe("looksLikeCharacter", () => {
  it("is false for a blank draft", () => {
    expect(looksLikeCharacter(emptyDraft())).toBe(false);
  });

  it("is true when any of name / attrs / skills / traits is present", () => {
    const named = { ...emptyDraft(), scalars: { ...emptyDraft().scalars, name: "Lisa" } };
    expect(looksLikeCharacter(named)).toBe(true);
    expect(looksLikeCharacter({ ...emptyDraft(), attrs: { STR: 300 } })).toBe(true);
    expect(
      looksLikeCharacter({ ...emptyDraft(), skills: [{ name: "Piloting", xp: 40 }] }),
    ).toBe(true);
    expect(
      looksLikeCharacter({ ...emptyDraft(), traits: [{ name: "Unlucky", xp: -50 }] }),
    ).toBe(true);
  });

  it("treats a whitespace-only name as empty", () => {
    const draft = { ...emptyDraft(), scalars: { ...emptyDraft().scalars, name: "   " } };
    expect(looksLikeCharacter(draft)).toBe(false);
  });

  it("accepts every real fixture", () => {
    for (const name of ["lisa.btcc", "newchar.btcc", "test.btcc"]) {
      expect(looksLikeCharacter(parseBtcc(readFixture(name)))).toBe(true);
    }
  });
});

describe("normalizeImportName", () => {
  it("falls back when blank", () => {
    expect(normalizeImportName("")).toBe(IMPORT_FALLBACK_NAME);
    expect(normalizeImportName("   ")).toBe(IMPORT_FALLBACK_NAME);
  });

  it("trims and preserves a normal name", () => {
    expect(normalizeImportName("  Natasha Kerensky  ")).toBe("Natasha Kerensky");
  });

  it("truncates to the DB max length", () => {
    const long = "x".repeat(NAME_MAX_LENGTH + 25);
    expect(normalizeImportName(long)).toHaveLength(NAME_MAX_LENGTH);
  });
});

describe("prepareImport", () => {
  it("rejects an empty draft", () => {
    const result = prepareImport(emptyDraft());
    expect(result).toEqual({ ok: false, reason: "empty" });
  });

  it("returns a DB-safe name and does not mutate the input", () => {
    const draft = { ...emptyDraft(), scalars: { ...emptyDraft().scalars, name: "  Lisa  " } };
    const result = prepareImport(draft);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.scalars.name).toBe("Lisa");
    expect(draft.scalars.name).toBe("  Lisa  ");
  });

  it("keeps a nameless-but-attributed draft with a fallback name", () => {
    const result = prepareImport({ ...emptyDraft(), attrs: { STR: 300 } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.scalars.name).toBe(IMPORT_FALLBACK_NAME);
  });
});
