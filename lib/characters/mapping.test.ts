import { describe, expect, it, vi } from "vitest";
import { emptyDraft, parseBtcc } from "@/lib/btcc";
import type { BtccDraft } from "@/lib/btcc/types";
import { FIXTURE_NAMES, readFixture } from "@/lib/btcc/test-fixtures";
import { emptyMech } from "@/lib/mech/schema";
import {
  draftToColumns,
  draftToPayload,
  rowToDraft,
  rowToMech,
  withMechPayload,
} from "./mapping";
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
    prerequisites: cols.prerequisites as unknown as CharacterRow["prerequisites"],
    notes: cols.notes,
    mech: null,
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
      prerequisites: {} as unknown as CharacterRow["prerequisites"],
      notes: "",
      mech: null,
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

describe("draftToPayload — campaign presence contract (AC 16, R15)", () => {
  const draft = emptyDraft();

  it("omits campaign_id entirely when no campaign argument is given", () => {
    expect("campaign_id" in (draftToPayload(draft) as object)).toBe(false);
  });

  it("omits campaign_id when the argument is explicitly undefined", () => {
    // The serialization-safety case: React preserves `undefined` object properties
    // across the action boundary, so an options-object + `in` test would wrongly
    // see a present key here and silently detach the character.
    expect("campaign_id" in (draftToPayload(draft, undefined) as object)).toBe(false);
  });

  it("sets campaign_id to null when detaching", () => {
    const payload = draftToPayload(draft, { id: null }) as Record<string, unknown>;
    expect("campaign_id" in payload).toBe(true);
    expect(payload.campaign_id).toBeNull();
  });

  it("sets campaign_id to the uuid when attaching", () => {
    const id = "a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3";
    const payload = draftToPayload(draft, { id }) as Record<string, unknown>;
    expect(payload.campaign_id).toBe(id);
  });
});

describe("mech column — presence contract", () => {
  const draft = emptyDraft();
  const payload = draftToPayload(draft);

  it("omits the mech key when the argument is undefined (unchanged)", () => {
    expect("mech" in (withMechPayload(payload, undefined) as object)).toBe(
      false,
    );
  });

  it("sends JSON null to clear the stored mech", () => {
    const out = withMechPayload(payload, null) as Record<string, unknown>;
    expect("mech" in out).toBe(true);
    expect(out.mech).toBeNull();
  });

  it("sends the object to set the stored mech without mutating the input", () => {
    const mech = emptyMech();
    const out = withMechPayload(payload, mech) as Record<string, unknown>;
    expect(out.mech).toEqual(mech);
    expect("mech" in (payload as object)).toBe(false);
  });
});

describe("rowToMech", () => {
  function rowWith(mech: unknown): CharacterRow {
    return { ...columnsToRow(emptyDraft()), mech } as unknown as CharacterRow;
  }

  it("returns null for a character without a mech", () => {
    expect(rowToMech(rowWith(null))).toBeNull();
  });

  it("returns the parsed mech for a valid stored record", () => {
    expect(rowToMech(rowWith(emptyMech()))).toEqual(emptyMech());
  });

  it("treats an invalid stored record as no mech and logs without the payload", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(rowToMech(rowWith({ chassis: 42 }))).toBeNull();
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls[0])).not.toContain("42");
    } finally {
      log.mockRestore();
    }
  });
});
