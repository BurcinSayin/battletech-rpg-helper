import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeXp, rowToDraft } from "@/lib/characters";
import { groupCharactersByMember } from "@/lib/campaigns";
import { PageContainer } from "@/components/layout/page-container";
import { CampaignControls } from "./campaign-controls";

// Campaign detail: characters grouped by member. A GM sees every member's; a
// player sees only their own — from the SAME query, because
// characters_select_owner_or_gm (init.sql:203-205) already discriminates. No role
// branch in the query (AC 9).
export default async function CampaignPage({
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

  // A non-member reads nothing through campaigns_select_member, so this collapses
  // to a 404 rather than a 403 — the convention at app/(app)/AGENTS.md:75-76 (AC 13).
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, name, gm_id, invite_code")
    .eq("id", id)
    .single();
  if (error || !campaign) notFound();

  const { data: memberRows } = await supabase
    .from("campaign_members")
    .select("user_id, role")
    .eq("campaign_id", id);
  const members = memberRows ?? [];

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", members.length > 0 ? members.map((m) => m.user_id) : [user.id]);

  const { data: characterRows } = await supabase
    .from("characters")
    .select("*")
    .eq("campaign_id", id);

  const groups = groupCharactersByMember(members, profileRows ?? [], characterRows ?? []);
  const isGm = campaign.gm_id === user.id;

  return (
    <PageContainer width="wide">
      <div className="rounded-xl border border-hud-line bg-hud-bg p-4 text-hud-text">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{campaign.name}</h1>
            <p className="mt-1 text-sm text-hud-muted">
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
          </div>
          <CampaignControls
            campaignId={campaign.id}
            inviteCode={campaign.invite_code}
            isGm={isGm}
          />
        </div>

        <ul className="mt-6 flex flex-col gap-5">
          {groups.map((group) => (
            <li key={group.userId}>
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold text-hud-text">{group.label}</h2>
                {group.role === "gm" && (
                  <span className="rounded border border-hud-line px-1.5 py-0.5 text-xs uppercase tracking-wider text-hud-muted">
                    GM
                  </span>
                )}
              </div>

              {group.characters.length === 0 ? (
                <p className="mt-2 text-sm text-hud-muted">No characters yet.</p>
              ) : (
                <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.characters.map((row) => {
                    const draft = rowToDraft(row);
                    const xp = computeXp(draft);
                    const subtitle = [
                      draft.scalars.aff || "No affiliation",
                      `${draft.skills.length} skills`,
                      `${xp.spent.toLocaleString()} XP`,
                    ].join(" · ");
                    return (
                      <li key={row.id}>
                        <Link
                          href={`/characters/${row.id}`}
                          className="block rounded-lg border border-hud-line bg-hud-panel p-4 transition hover:border-hud-muted"
                        >
                          <p className="truncate text-lg font-semibold text-hud-text">
                            {row.name}
                          </p>
                          <p className="mt-1 truncate text-sm text-hud-muted">{subtitle}</p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </PageContainer>
  );
}
