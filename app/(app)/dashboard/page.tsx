import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeXp, rowToDraft } from "@/lib/characters";
import { createCharacter, deleteCharacter } from "@/app/(app)/characters/actions";
import { HudButton } from "@/components/characters/ui";

// Dashboard: the signed-in user's characters with create / open / delete. RLS also
// exposes characters from campaigns the user GMs; the explicit owner filter keeps
// this list to "my characters" for the single-user MVP (campaigns land in step #7).
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

  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-hud-line bg-hud-bg p-4 text-hud-text">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Your characters</h1>
        <form action={createCharacter}>
          <HudButton type="submit" variant="primary">
            + New character
          </HudButton>
        </form>
      </div>

      {characters.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-hud-line p-8 text-center">
          <p className="text-hud-text">No characters yet.</p>
          <p className="mt-1 text-sm text-hud-muted">
            Create your first pilot — no campaign required.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3">
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
                <Link href={`/characters/${row.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold text-hud-text">{row.name}</p>
                  <p className="mt-1 truncate text-sm text-hud-muted">{subtitle}</p>
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
  );
}
