import { describe, it, expect } from "vitest";
import { parseBtcc } from "./parse";
import { serializeBtcc } from "./serialize";
import { readFixture, FIXTURE_NAMES } from "./test-fixtures";

/** First line where two strings differ — for a readable failure message. */
function firstDiff(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}:\n  expected: ${JSON.stringify(la[i])}\n  actual:   ${JSON.stringify(lb[i])}`;
    }
  }
  return "(no line-level diff; lengths differ)";
}

describe("btcc round-trip", () => {
  for (const name of FIXTURE_NAMES) {
    describe(name, () => {
      const original = readFixture(name);

      it("golden: serialize(parse(text)) === text (byte-equal)", () => {
        const out = serializeBtcc(parseBtcc(original));
        if (out !== original) {
          // Hard gate: surface the exact deviation rather than relaxing.
          throw new Error(
            `byte round-trip diverged for ${name} — ${firstDiff(original, out)}`,
          );
        }
        expect(out).toBe(original);
      });

      it("idempotent: serialize∘parse reaches a byte-stable fixpoint", () => {
        const s1 = serializeBtcc(parseBtcc(original));
        const s2 = serializeBtcc(parseBtcc(s1));
        expect(s2).toBe(s1);
      });

      it("structurally stable: parse∘serialize∘parse equals parse", () => {
        const d1 = parseBtcc(original);
        const d2 = parseBtcc(serializeBtcc(d1));
        expect(d2).toEqual(d1);
      });
    });
  }
});
