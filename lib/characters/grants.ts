import type { BtccRow } from "@/lib/btcc";

/** Retain first insertion order, including zero rows until the package is finalized. */
export function mergeRows(
  rows: readonly BtccRow[],
  grants: readonly BtccRow[],
  combine: (a: number, b: number) => number,
): BtccRow[] {
  const totals = new Map(rows.map((row) => [row.name, row.xp]));
  for (const grant of grants) {
    const previous = totals.get(grant.name);
    totals.set(
      grant.name,
      previous === undefined ? grant.xp : combine(previous, grant.xp),
    );
  }
  return Array.from(totals, ([name, xp]) => ({ name, xp }));
}
