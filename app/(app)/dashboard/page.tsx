import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeXp, rowToDraft } from "@/lib/characters";
import {
  createCharacter,
  deleteCharacter,
} from "@/app/(app)/characters/actions";
import { HudButton } from "@/components/characters/ui";
import { PageContainer } from "@/components/layout/page-container";

// Dashboard: the signed-in user's characters with create / open / delete, plus a
// compact read-only list of their campaigns. RLS also exposes characters from
// campaigns the user GMs; the explicit owner filter keeps this list to "my
// characters" — a GM sees members' characters on the campaign page instead.
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("characters")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  const characters = rows ?? [];

  // Same shape as the /campaigns index; RLS gates both sides of the embed.
  const { data: memberRows } = await supabase
    .from("campaign_members")
    .select("role, campaigns(id, name)")
    .eq("user_id", user.id);
  const campaigns = (memberRows ?? [])
    .flatMap((row) => (row.campaigns ? [{ role: row.role, ...row.campaigns }] : []))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PageContainer width="wide">
      <div className="rounded-xl border border-hud-line bg-hud-bg p-4 text-hud-text">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Your characters</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/characters/import"
              className="rounded-md border border-hud-line px-3 py-2 text-xs font-medium uppercase tracking-wider text-hud-text transition hover:border-hud-muted"
            >
              Import .btcc
            </Link>
            <form action={createCharacter}>
              <HudButton type="submit" variant="primary">
                + New character
              </HudButton>
            </form>
          </div>
        </div>

        {characters.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-hud-line p-8 text-center">
            <p className="text-hud-text">No characters yet.</p>
            <p className="mt-1 text-sm text-hud-muted">
              Create your first pilot — no campaign required.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {characters.map((row) => {
              const draft = rowToDraft(row);
              const xp = computeXp(draft);
              const subtitle = [
                draft.scalars.aff || "No affiliation",
                `${draft.skills.length} skills`,
                `${xp.spent.toLocaleString()} XP`,
              ].join(" · ");
              return (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-hud-line bg-hud-panel p-4"
                >
                  <Link
                    href={`/characters/${row.id}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-lg font-semibold text-hud-text">
                      {row.name}
                    </p>
                    <p className="mt-1 truncate text-sm text-hud-muted">
                      {subtitle}
                    </p>
                  </Link>
                  <form action={deleteCharacter.bind(null, row.id)}>
                    <button
                      type="submit"
                      aria-label={`Delete ${row.name}`}
                      className="h-8 w-8 shrink-0 rounded border border-hud-line text-hud-muted transition hover:border-hud-red hover:text-hud-red"
                    >
                      ✕
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Read-only: create / join / leave all live on /campaigns and the detail
          page. Deliberately no second "+ New character" button here. */}
      <div className="mt-4 rounded-xl border border-hud-line bg-hud-bg p-4 text-hud-text">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <Link
            href="/campaigns"
            className="rounded-md border border-hud-line px-3 py-2 text-xs font-medium uppercase tracking-wider text-hud-text transition hover:border-hud-muted"
          >
            Manage
          </Link>
        </div>

        {campaigns.length === 0 ? (
          <p className="mt-3 text-sm text-hud-muted">
            Not in any campaigns yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-hud-line bg-hud-panel px-4 py-2 transition hover:border-hud-muted"
                >
                  <span className="min-w-0 truncate text-hud-text">{campaign.name}</span>
                  <span className="shrink-0 text-xs uppercase tracking-wider text-hud-muted">
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
