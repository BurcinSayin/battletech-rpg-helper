import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Read a `.btcc` fixture verbatim (UTF-8) from `__fixtures__/`. */
export function readFixture(name: string): string {
  return readFileSync(join(here, "__fixtures__", name), "utf8");
}

export const FIXTURE_NAMES = ["lisa.btcc", "newchar.btcc", "test.btcc"] as const;
