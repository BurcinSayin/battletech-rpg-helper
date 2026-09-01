// Classify the custom SQLSTATE raised by the `join_campaign` RPC. Kept separate
// from lib/characters/errors.ts, which is scoped to `update_character`'s
// PT409/PT403 (see its header). Same defensive code-then-message check.
//   PT404 → the invite code matched no campaign

export type JoinErrorKind = "not-found" | "unknown";

export interface RpcErrorLike {
  code?: string | null;
  message?: string | null;
}

export function classifyJoinError(error: RpcErrorLike | null | undefined): JoinErrorKind {
  if (!error) return "unknown";
  if ((error.code ?? "") === "PT404") return "not-found";
  if ((error.message ?? "").includes("PT404")) return "not-found";
  return "unknown";
}
