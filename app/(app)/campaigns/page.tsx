import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/layout/page-container";
import { CampaignForms } from "./campaign-forms";

// The campaigns a user GMs or plays in. One query: RLS gates both sides of the
// embed (members_select_self_or_gm init.sql:190-192; campaigns_select_member
// init.sql:172-174), so no role branch is needed here.
export default async function CampaignsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("campaign_members")
    .select("role, campaigns(id, name)")
    .eq("user_id", user.id);

  const campaigns = (rows ?? [])
    .flatMap((row) => (row.campaigns ? [{ role: row.role, ...row.campaigns }] : []))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PageContainer width="wide">
      <div className="rounded-xl border border-hud-line bg-hud-bg p-4 text-hud-text">
        <h1 className="text-xl font-semibold">Campaigns</h1>

        <div className="mt-4">
          <CampaignForms />
        </div>

        {campaigns.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-hud-line p-8 text-center">
            <p className="text-hud-text">You&rsquo;re not in any campaigns yet.</p>
            <p className="mt-1 text-sm text-hud-muted">
              Create one to GM, or join with an invite code.
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-hud-line bg-hud-panel p-4 transition hover:border-hud-muted"
                >
                  <span className="min-w-0 truncate text-lg font-semibold text-hud-text">
                    {campaign.name}
                  </span>
                  <span className="shrink-0 rounded border border-hud-line px-2 py-0.5 text-xs uppercase tracking-wider text-hud-muted">
                    {campaign.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
