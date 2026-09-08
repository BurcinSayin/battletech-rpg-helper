import type { Stage0Candidate, Stage0Source } from "../lib/rules/stage0-contract";
import { extractFunction, stripTrailingComment } from "./extract-rules-lib";
import { Stage0SourceError } from "./stage0-source";

type Range = {
  readonly minimum: number;
  readonly maximum: number;
  readonly kind: Stage0Candidate["kind"];
  readonly source: Stage0Source;
};
export type Stage0Dispatch = ReadonlyMap<string, readonly Range[]>;

export function readStage0Dispatch(text: string): Stage0Dispatch {
  const result = new Map<string, Range[]>();
  const selectors = [
    [3, "FREE WORLDS LEAGUE (HOUSE MARIK)"], [6, "MINOR PERIPHERY"],
    [7, "MAJOR PERIPHERY STATE"], [8, "DEEP PERIPHERY"],
  ] as const;
  for (const slot of [1, 2, 3, 4]) {
    const fn = extractFunction(text, new RegExp(`S0MoreDialog::on_S0AdvDialComBox${slot}_activated\\(`));
    const lines = fn.lines.map(stripTrailingComment);
    for (const [affiliation, selector] of selectors) {
      if (affiliation === 3 ? slot !== 4 : slot === 4) continue;
      const start = lines.findIndex((line) => line.includes(`s0affName == "${selector}"`));
      if (start === -1) throw new Stage0SourceError({ file: "s0moredialog.cpp", line: fn.startLine }, `Missing dispatcher ${selector}/${slot}`);
      let depth = 0;
      let minimum = 0;
      let maximum = Infinity;
      let rangeLine = fn.startLine + start;
      const ranges: Range[] = [];
      for (let offset = start; offset < lines.length; offset++) {
        const code = lines[offset];
        depth += [...code].filter((character) => character === "{").length - [...code].filter((character) => character === "}").length;
        if (offset > start && depth === 0) break;
        if (code.includes("currentIndex()")) {
          minimum = 0;
          maximum = Infinity;
          rangeLine = fn.startLine + offset;
          for (const match of code.matchAll(/currentIndex\(\)\s*(<=|>=|<|>)\s*(\d+)/g)) {
            const value = Number(match[2]);
            switch (match[1]) {
              case "<": maximum = value - 1; break;
              case "<=": maximum = value; break;
              case ">": minimum = value + 1; break;
              case ">=": minimum = value; break;
              default: throw new Stage0SourceError({ file: "s0moredialog.cpp", line: rangeLine }, code);
            }
          }
        }
        const target = /change(Attr|Traits|Skills)\(nameElem,\s*s0Value\d\)/.exec(code);
        if (target) {
          const kind = target[1] === "Attr" ? "attribute" : target[1] === "Traits" ? "trait" : "skill";
          ranges.push({ minimum, maximum, kind, source: { file: "s0moredialog.cpp", line: rangeLine } });
        }
      }
      if (ranges.length < 2) throw new Stage0SourceError({ file: "s0moredialog.cpp", line: rangeLine }, "Missing candidate dispatch ranges");
      result.set(`${affiliation}/${slot}`, ranges);
    }
  }
  return result;
}

export function dispatchedCandidate(ranges: readonly Range[], value: string, index: number): Stage0Candidate {
  const matching = ranges.filter(({ minimum, maximum }) => index >= minimum && index <= maximum);
  if (matching.length !== 1) throw new Stage0SourceError(ranges[0].source, `Ambiguous candidate dispatch at ${index}`);
  return { kind: matching[0].kind, value };
}
