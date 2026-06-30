import { describe, expect, it } from "vitest";
import { parseBtcc } from "@/lib/btcc";
import type { BtccDraft } from "@/lib/btcc/types";
import { FIXTURE_NAMES, readFixture } from "@/lib/btcc/test-fixtures";
import { draftToColumns, rowToDraft } from "./mapping";
import type { CharacterRow } from "./types";

/** Wrap the writable columns in a full row, as the DB would store them. */
function columnsToRow(draft: BtccDraft): CharacterRow {
  const cols = draftToColumns(draft);
  return {
    id: "00000000-0000-0000-0000-000000000000",
    owner_id: "00000000-0000-0000-0000-000000000001",
    campaign_id: null,
    name: cols.name,
    info: cols.info as unknown as CharacterRow["info"],
    attributes: cols.attributes as unknown as CharacterRow["attributes"],
    skills: cols.skills as unknown as CharacterRow["skills"],
    traits: cols.traits as unknown as CharacterRow["traits"],
    pre_snapshot: cols.pre_snapshot as unknown as CharacterRow["pre_snapshot"],
    notes: cols.notes,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("row <-> draft mapping", () => {
  for (const name of FIXTURE_NAMES) {
    it(`round-trips ${name} losslessly`, () => {
      const draft = parseBtcc(readFixture(name));
      expect(rowToDraft(columnsToRow(draft))).toEqual(draft);
    });
  }

  it("treats the name column as authoritative over info.scalars.name", () => {
    const draft = parseBtcc(readFixture("lisa.btcc"));
    const row = columnsToRow(draft);
    row.name = "Renamed In Column";
    expect(rowToDraft(row).scalars.name).toBe("Renamed In Column");
  });

  it("tolerates empty/malformed JSONB", () => {
    const row: CharacterRow = {
      id: "x",
      owner_id: "y",
      campaign_id: null,
      name: "Blank",
      info: {} as unknown as CharacterRow["info"],
      attributes: {} as unknown as CharacterRow["attributes"],
      skills: [] as unknown as CharacterRow["skills"],
      traits: [] as unknown as CharacterRow["traits"],
      pre_snapshot: {} as unknown as CharacterRow["pre_snapshot"],
      notes: "",
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const draft = rowToDraft(row);
    expect(draft.scalars.name).toBe("Blank");
    expect(draft.skills).toEqual([]);
    expect(draft.attrs).toEqual({});
  });
});
