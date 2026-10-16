import { describe, expect, it } from "vitest";
import { findCatalogEntry, searchCatalog } from "./catalog";
import { MTF_BASE_URL, mtfUrl } from "./url";

describe("mtfUrl", () => {
  it("builds the approved sample URL, encoding spaces as %20", () => {
    expect(mtfUrl("Firestarter FS9-H.mtf")).toBe(
      "https://helm-kore-fragment.s3.amazonaws.com/mtf/meks/Firestarter%20FS9-H.mtf",
    );
    expect(mtfUrl("Firestarter FS9-H.mtf")).toBe(
      `${MTF_BASE_URL}Firestarter%20FS9-H.mtf`,
    );
  });

  it("encodes path, query, fragment, and percent characters so they cannot escape the base", () => {
    const url = mtfUrl("a/b?c#d%e.mtf");
    expect(url).toBe(`${MTF_BASE_URL}a%2Fb%3Fc%23d%25e.mtf`);
    expect(url.startsWith(MTF_BASE_URL)).toBe(true);
    expect(url).not.toContain("?");
    expect(url).not.toContain("#");
  });

  it("percent-encodes non-ASCII names", () => {
    expect(mtfUrl("Él Mech.mtf")).toBe(`${MTF_BASE_URL}%C3%89l%20Mech.mtf`);
  });

  it("leaves parentheses and apostrophes readable where S3 accepts them", () => {
    expect(mtfUrl("Emerald Harrier (Roadrunner) RD-1R.mtf")).toBe(
      `${MTF_BASE_URL}Emerald%20Harrier%20(Roadrunner)%20RD-1R.mtf`,
    );
  });
});

describe("searchCatalog", () => {
  it("returns nothing for empty or whitespace queries", () => {
    expect(searchCatalog("")).toEqual([]);
    expect(searchCatalog("   ")).toEqual([]);
    expect(searchCatalog(undefined as unknown as string)).toEqual([]);
  });

  it("matches case-insensitively and returns the public entry shape", () => {
    const results = searchCatalog("FIRESTARTER fs9-h");
    expect(results).toEqual([
      {
        fileName: "Firestarter FS9-H.mtf",
        definitionName: "Firestarter FS9-H",
        era: "2703",
        mass: "35",
        techBase: "is",
      },
    ]);
  });

  it("requires every whitespace-separated token to match", () => {
    const results = searchCatalog("piranha 2");
    expect(results.length).toBeGreaterThan(0);
    for (const entry of results) {
      expect(entry.definitionName.toLowerCase()).toContain("piranha");
      expect(entry.definitionName.toLowerCase()).toContain("2");
    }
    expect(results.map((r) => r.fileName)).toContain("Piranha 2.mtf");
    expect(searchCatalog("zzz-no-such-mech")).toEqual([]);
  });

  it("ranks prefix matches before mid-name matches", () => {
    const results = searchCatalog("mercury", 200);
    const firstNonPrefix = results.findIndex(
      (r) => !r.definitionName.toLowerCase().startsWith("mercury"),
    );
    expect(results[0]?.definitionName.toLowerCase()).toMatch(/^mercury/);
    if (firstNonPrefix !== -1) {
      expect(
        results
          .slice(firstNonPrefix)
          .every((r) => !r.definitionName.toLowerCase().startsWith("mercury")),
      ).toBe(true);
    }
  });

  it("returns unique file names only and never a non-MTF placeholder", () => {
    const results = searchCatalog("rifleman", 100);
    const names = results.map((r) => r.fileName);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.endsWith(".mtf"))).toBe(true);
    expect(searchCatalog("frakenmech")).toEqual([]);
  });

  it("honours the limit and clamps it to a sane range", () => {
    expect(searchCatalog("mech", 3)).toHaveLength(3);
    expect(searchCatalog("mech", 0)).toHaveLength(1);
    expect(searchCatalog("mech", Number.NaN)).toHaveLength(25);
    expect(searchCatalog("mech", 10_000).length).toBeLessThanOrEqual(100);
  });

  it("accepts oversized queries without failing", () => {
    expect(() => searchCatalog("a ".repeat(2_000))).not.toThrow();
    expect(searchCatalog("x".repeat(5_000))).toEqual([]);
  });
});

describe("findCatalogEntry", () => {
  it("looks up an exact file name", () => {
    expect(findCatalogEntry("Firestarter FS9-H.mtf")).toMatchObject({
      fileName: "Firestarter FS9-H.mtf",
      definitionName: "Firestarter FS9-H",
    });
  });

  it("does not match case-variants, partial names, or unknown names", () => {
    expect(findCatalogEntry("firestarter fs9-h.mtf")).toBeUndefined();
    expect(findCatalogEntry("Firestarter FS9-H")).toBeUndefined();
    expect(findCatalogEntry("No Frakenmech Data.nope")).toBeUndefined();
    expect(findCatalogEntry("https://evil.example/x.mtf")).toBeUndefined();
    expect(findCatalogEntry("../etc/passwd")).toBeUndefined();
  });

  it("rejects non-string input without throwing", () => {
    expect(findCatalogEntry(null as unknown as string)).toBeUndefined();
  });
});
