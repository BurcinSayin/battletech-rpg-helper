import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mechSchema } from "@/lib/mech/schema";
import { mtfUrl } from "@/lib/mech/url";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { loadCatalogMech, searchMechCatalog } from "./mech-actions";

const FIRESTARTER = readFileSync(
  new URL(
    "../../../../lib/mech/__fixtures__/firestarter-fs9-h.mtf",
    import.meta.url,
  ),
  "utf8",
);
const FILE = "Firestarter FS9-H.mtf";
const fetchMock = vi.fn();

function signedIn(user: { id: string } | null = { id: "owner" }) {
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  signedIn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function silenceLogs() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("searchMechCatalog", () => {
  it("returns matching catalog entries for a signed-in user", async () => {
    const result = await searchMechCatalog("firestarter");
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected results");
    expect(result.results.map((r) => r.fileName)).toContain(FILE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    signedIn(null);
    expect(await searchMechCatalog("firestarter")).toMatchObject({
      ok: false,
      kind: "unauthenticated",
    });
  });

  it.each([42, null, { q: "x" }, "x".repeat(81)])(
    "rejects invalid query %j",
    async (query) => {
      expect(await searchMechCatalog(query)).toMatchObject({
        ok: false,
        kind: "invalid",
      });
    },
  );
});

describe("loadCatalogMech: gating", () => {
  it("requires a signed-in user and never fetches", async () => {
    signedIn(null);
    expect(await loadCatalogMech(FILE)).toMatchObject({
      ok: false,
      kind: "unauthenticated",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, 42, "", "x".repeat(129), { fileName: FILE }])(
    "rejects malformed input %j without fetching",
    async (input) => {
      expect(await loadCatalogMech(input)).toMatchObject({
        ok: false,
        kind: "invalid",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    "https://evil.example/mech.mtf",
    "//evil.example/mech.mtf",
    "../../secret.mtf",
    "Firestarter FS9-H",
    "firestarter fs9-h.mtf",
    "No Frakenmech Data.nope",
  ])("refuses %s, which is not a catalog file_name", async (input) => {
    expect(await loadCatalogMech(input)).toMatchObject({
      ok: false,
      kind: "not_found",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("loadCatalogMech: fetching", () => {
  it("fetches the catalog-derived URL server-side with redirects refused and no caching", async () => {
    fetchMock.mockResolvedValue(new Response(FIRESTARTER, { status: 200 }));

    await loadCatalogMech(FILE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(mtfUrl(FILE));
    expect(url).toBe(
      "https://helm-kore-fragment.s3.amazonaws.com/mtf/meks/Firestarter%20FS9-H.mtf",
    );
    expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the parsed mech with catalog provenance on success", async () => {
    fetchMock.mockResolvedValue(new Response(FIRESTARTER, { status: 200 }));

    const result = await loadCatalogMech(FILE);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("expected a mech");
    expect(result.mech).toMatchObject({
      chassis: "Firestarter",
      model: "FS9-H",
      mass: 35,
      catalogFile: FILE,
    });
    expect(mechSchema.safeParse(result.mech).success).toBe(true);
  });

  it("accepts CRLF downloads", async () => {
    fetchMock.mockResolvedValue(
      new Response(FIRESTARTER.replace(/\n/g, "\r\n"), { status: 200 }),
    );
    const result = await loadCatalogMech(FILE);
    expect(result).toMatchObject({ ok: true, mech: { mass: 35 } });
  });

  it("reports a missing file as not_found", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    expect(await loadCatalogMech(FILE)).toMatchObject({
      ok: false,
      kind: "not_found",
    });
  });

  it("reports a server error as unavailable and logs it", async () => {
    const log = silenceLogs();
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    expect(await loadCatalogMech(FILE)).toMatchObject({
      ok: false,
      kind: "unavailable",
    });
    expect(log).toHaveBeenCalled();
  });

  it("reports a network failure as unavailable without leaking the error", async () => {
    const log = silenceLogs();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const result = await loadCatalogMech(FILE);
    expect(result).toMatchObject({ ok: false, kind: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("fetch failed");
    expect(log).toHaveBeenCalled();
  });

  it("reports a rejected redirect (redirect: error) as unavailable", async () => {
    silenceLogs();
    fetchMock.mockRejectedValue(new TypeError("redirect mode is set to error"));
    expect(await loadCatalogMech(FILE)).toMatchObject({
      ok: false,
      kind: "unavailable",
    });
  });
});

describe("loadCatalogMech: bounds and malformed content", () => {
  it("rejects a declared content-length over the cap before reading the body", async () => {
    const body = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": "70000" }),
      get body() {
        body();
        return null;
      },
    });
    expect(await loadCatalogMech(FILE)).toMatchObject({
      ok: false,
      kind: "too_large",
    });
    expect(body).not.toHaveBeenCalled();
  });

  it("rejects a streamed body over the cap even without content-length", async () => {
    const chunk = new TextEncoder().encode("a".repeat(40 * 1024));
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 10) controller.close();
        else controller.enqueue(chunk);
      },
    });
    fetchMock.mockResolvedValue(new Response(stream, { status: 200 }));
    expect(await loadCatalogMech(FILE)).toMatchObject({
      ok: false,
      kind: "too_large",
    });
    expect(pulls).toBeLessThan(10);
  });

  it("accepts a body right at the cap boundary", async () => {
    const padding = "# " + "x".repeat(64 * 1024 - FIRESTARTER.length - 3);
    const text = `${FIRESTARTER}\n${padding}`.slice(0, 64 * 1024);
    fetchMock.mockResolvedValue(new Response(text, { status: 200 }));
    expect(await loadCatalogMech(FILE)).toMatchObject({ ok: true });
  });

  it.each([
    ["HTML error page", "<html><body>Access Denied</body></html>"],
    ["empty body", ""],
    ["missing mass", "Version:1.0\nFirestarter\nFS9-H\n\nWalk MP:6\n"],
    ["non-numeric mass", "Chassis:X\nMass:heavy\n"],
  ])("rejects malformed content (%s) as invalid", async (_label, body) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }));
    expect(await loadCatalogMech(FILE)).toMatchObject({
      ok: false,
      kind: "invalid",
    });
  });
});
