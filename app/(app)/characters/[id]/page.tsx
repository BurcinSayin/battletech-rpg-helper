import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rowToDraft } from "@/lib/characters";
import { PageContainer } from "@/components/layout/page-container";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row, error } = await supabase
    .from("characters")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !row) notFound();

  // Campaign options come from the viewer's own memberships. Because the GM is
  // always a member (the on_campaign_created trigger), readable campaigns and
  // membership campaigns are the same set — so a campaign_id absent from this list
  // is one the viewer cannot see at all.
  const { data: memberRows } = await supabase
    .from("campaign_members")
    .select("campaigns(id, name)")
    .eq("user_id", user.id);
  const campaigns = (memberRows ?? [])
    .flatMap((r) => (r.campaigns ? [r.campaigns] : []))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PageContainer width="content">
      <div className="rounded-xl border border-hud-line bg-hud-bg p-4 text-hud-text">
        <CharacterEditor
          id={row.id}
          version={row.version}
          draft={rowToDraft(row)}
          campaigns={campaigns}
          campaignId={row.campaign_id}
          isOwner={row.owner_id === user.id}
        />
      </div>
    </PageContainer>
  );
}
