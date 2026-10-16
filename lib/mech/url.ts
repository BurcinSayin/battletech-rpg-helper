// Approved source for predefined MTF files. Only this prefix is ever requested;
// the path segment is always a single percent-encoded catalog `file_name`.
export const MTF_BASE_URL =
  "https://helm-kore-fragment.s3.amazonaws.com/mtf/meks/";

/**
 * URL for a catalog `file_name` (e.g. "Firestarter FS9-H.mtf" →
 * ".../Firestarter%20FS9-H.mtf"). `encodeURIComponent` also encodes "/", "?",
 * "#" and "%", so a name cannot escape the base path or add query/fragment parts.
 */
export function mtfUrl(fileName: string): string {
  return MTF_BASE_URL + encodeURIComponent(fileName);
}
