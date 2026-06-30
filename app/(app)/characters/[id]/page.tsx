import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToDraft } from "@/lib/characters";
import { CharacterEditor } from "./editor-client";

// Server shell: fetch the RLS-gated character row, map it to a BtccDraft, and hand
// the draft + version to the client editor. RLS returns nothing for a character the
// user can neither own nor GM, which we surface as a 404.
export default async function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("characters")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) notFound();

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-hud-line bg-hud-bg p-4 text-hud-text">
      <CharacterEditor id={row.id} version={row.version} draft={rowToDraft(row)} />
    </div>
  );
}
