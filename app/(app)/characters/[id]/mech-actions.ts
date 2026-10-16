"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  CATALOG_QUERY_MAX_LENGTH,
  findCatalogEntry,
  searchCatalog,
  type CatalogEntry,
} from "@/lib/mech/catalog";
import { parseMtf, MTF_MAX_CHARS } from "@/lib/mech/mtf";
import { mtfUrl } from "@/lib/mech/url";
import { type MechData } from "@/lib/mech/types";

// Fetching happens here, on the server, and only for a catalog `file_name`.
// The S3 host sends no Access-Control-Allow-Origin header, so the browser
// cannot fetch it directly; the Mech tab must go through these actions.

export type MechCatalogSearchResult =
  | { ok: true; results: CatalogEntry[] }
  | { ok: false; kind: "invalid" | "unauthenticated"; message: string };

export type LoadCatalogMechResult =
  | { ok: true; mech: MechData }
  | {
      ok: false;
      kind:
        | "not_found"
        | "unavailable"
        | "invalid"
        | "too_large"
        | "unauthenticated";
      message: string;
    };

const FETCH_TIMEOUT_MS = 8_000;

const searchInput = z.string().max(CATALOG_QUERY_MAX_LENGTH);
const fileNameInput = z.string().min(1).max(128);

async function isSignedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user !== null;
}

/** Predefined-mech search for the combo box. Requires a signed-in user. */
export async function searchMechCatalog(
  query: unknown,
): Promise<MechCatalogSearchResult> {
  if (!(await isSignedIn())) {
    return {
      ok: false,
      kind: "unauthenticated",
      message: "Sign in to search predefined mechs.",
    };
  }
  const parsed = searchInput.safeParse(query);
  if (!parsed.success) {
    return { ok: false, kind: "invalid", message: "Search text is too long." };
  }
  return { ok: true, results: searchCatalog(parsed.data) };
}

/**
 * Download and parse the predefined MTF for a catalog entry. The URL is built
 * only from the catalog's own `file_name` (`mtfUrl`), never from caller input,
 * so arbitrary or redirected URLs cannot be requested. The response is size-capped
 * and parsed as untrusted text. The returned record is not persisted here.
 */
export async function loadCatalogMech(
  fileName: unknown,
): Promise<LoadCatalogMechResult> {
  if (!(await isSignedIn())) {
    return {
      ok: false,
      kind: "unauthenticated",
      message: "Sign in to load a predefined mech.",
    };
  }
  const parsed = fileNameInput.safeParse(fileName);
  if (!parsed.success) {
    return { ok: false, kind: "invalid", message: "Choose a predefined mech." };
  }
  const entry = findCatalogEntry(parsed.data);
  if (!entry) {
    return {
      ok: false,
      kind: "not_found",
      message: "That predefined mech is not in the catalog.",
    };
  }

  let response: Response;
  try {
    response = await fetch(mtfUrl(entry.fileName), {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[mech] catalog fetch failed:", entry.fileName, error);
    return unavailable();
  }

  if (response.status === 404 || response.status === 403) {
    return {
      ok: false,
      kind: "not_found",
      message: "The predefined mech file is not available.",
    };
  }
  if (!response.ok) {
    console.error(
      "[mech] catalog fetch status:",
      entry.fileName,
      response.status,
    );
    return unavailable();
  }

  let body: string | null;
  try {
    body = await readCapped(response, MTF_MAX_CHARS);
  } catch (error) {
    console.error("[mech] catalog read failed:", entry.fileName, error);
    return unavailable();
  }
  if (body === null) {
    return {
      ok: false,
      kind: "too_large",
      message: "The predefined mech file is too large to load.",
    };
  }

  const result = parseMtf(body);
  if (!result.ok) {
    return {
      ok: false,
      kind: "invalid",
      message: "The predefined mech file could not be read.",
    };
  }
  return { ok: true, mech: { ...result.mech, catalogFile: entry.fileName } };
}

function unavailable(): LoadCatalogMechResult {
  return {
    ok: false,
    kind: "unavailable",
    message: "The predefined mech file could not be downloaded.",
  };
}

/**
 * Reads the body as UTF-8, stopping at `maxBytes`. Returns null when the
 * declared or streamed size exceeds the cap. Bytes are counted, not characters,
 * since the cap guards memory.
 */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(declared) && declared > maxBytes) return null;

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(bytes);
}
