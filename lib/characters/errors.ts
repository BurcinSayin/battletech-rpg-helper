// Classify the custom SQLSTATEs raised by the `update_character` RPC. PostgREST
// surfaces the Postgres error code on `PostgrestError.code`; we also check the
// message defensively in case a transport only carries it there.
//   PT409 → optimistic-concurrency version conflict (show the reload dialog)
//   PT403 → tried to attach to a campaign the user isn't a member of

export type UpdateErrorKind = "conflict" | "forbidden" | "unknown";

export interface RpcErrorLike {
  code?: string | null;
  message?: string | null;
}

export function classifyUpdateError(error: RpcErrorLike | null | undefined): UpdateErrorKind {
  if (!error) return "unknown";
  const code = error.code ?? "";
  if (code === "PT409") return "conflict";
  if (code === "PT403") return "forbidden";

  const message = error.message ?? "";
  if (message.includes("PT409")) return "conflict";
  if (message.includes("PT403")) return "forbidden";
  return "unknown";
}
