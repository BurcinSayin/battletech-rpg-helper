"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { emptyDraft } from "@/lib/btcc";
import {
  ATTRIBUTE_BASE,
  ATTRIBUTE_KEYS,
  characterFormSchema,
  classifyUpdateError,
  draftToInsert,
  draftToPayload,
  formToDraft,
  rowToDraft,
} from "@/lib/characters";

// Result of a save, surfaced to the editor client (never throws on expected
// failures so the form can render them; PT409 → reload dialog, PT403 → message).
export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; kind: "conflict" }
  | { ok: false; kind: "forbidden" | "error"; message: string };

/**
 * Create a blank character owned by the current user and open it. Usable directly
 * as a `<form action={createCharacter}>`. RLS lets a user insert a character they
 * own with a null campaign.
 */
export async function createCharacter(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const draft = emptyDraft();
  draft.scalars.name = "New Character";
  for (const key of ATTRIBUTE_KEYS) draft.attrs[key] = ATTRIBUTE_BASE;

  const { data, error } = await supabase
    .from("characters")
    .insert(draftToInsert(draft, user.id))
    .select("id")
    .single();

  if (error || !data) {
    console.error("[characters] create failed:", error?.code, error?.message);
    redirect("/dashboard?error=create");
  }

  revalidatePath("/dashboard");
  redirect(`/characters/${data.id}`);
}

/**
 * Save edits through the version-guarded `update_character` RPC. We re-fetch the
 * stored row server-side and merge the editable form fields onto it, so untouched
 * sections (equip/weapons/pre*) are preserved and the client only sends what it
 * edits. A stale `expectedVersion` collapses to PT409 → conflict.
 */
export async function saveCharacter(
  id: string,
  expectedVersion: number,
  values: unknown,
): Promise<SaveResult> {
  const parsed = characterFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, kind: "error", message: "Some fields are invalid." };
  }

  const supabase = await createClient();
  const { data: row, error: fetchError } = await supabase
    .from("characters")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !row) {
    return { ok: false, kind: "error", message: "Character not found." };
  }

  const draft = formToDraft(rowToDraft(row), parsed.data);

  const { data, error } = await supabase.rpc("update_character", {
    p_id: id,
    p_expected_version: expectedVersion,
    p_payload: draftToPayload(draft),
  });

  if (error) {
    const kind = classifyUpdateError(error);
    if (kind === "conflict") return { ok: false, kind: "conflict" };
    if (kind === "forbidden") {
      return { ok: false, kind: "forbidden", message: "You can't save to that campaign." };
    }
    console.error("[characters] save failed:", error.code, error.message);
    return { ok: false, kind: "error", message: "Could not save. Please try again." };
  }

  revalidatePath(`/characters/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, version: data?.version ?? expectedVersion + 1 };
}

/** Delete a character (RLS allows the owner or the campaign GM). */
export async function deleteCharacter(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("characters").delete().eq("id", id);
  if (error) {
    console.error("[characters] delete failed:", error.code, error.message);
  }
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
