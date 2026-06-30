import type { BtccDraft } from "@/lib/btcc/types";
import type { CatalogWarnings, XpSummary } from "@/lib/characters";
import { ATTRIBUTE_KEYS } from "@/lib/characters";
import { CatalogWarningBanner } from "./warnings";
import { HudButton, Panel } from "./ui";

const TOP_SKILLS = 5;

function signed(xp: number): string {
  return xp >= 0 ? `+${xp}` : `${xp}`;
}

/** Read-only character sheet, mirroring section 02 of the design wireframe. */
export function CharacterSheet({
  draft,
  xp,
  warnings,
  onEdit,
}: {
  draft: BtccDraft;
  xp: XpSummary;
  warnings: CatalogWarnings;
  onEdit: () => void;
}) {
  const { scalars } = draft;
  const sortedSkills = [...draft.skills].sort((a, b) => b.xp - a.xp);
  const topSkills = sortedSkills.slice(0, TOP_SKILLS);
  const moreSkills = sortedSkills.length - topSkills.length;
  const sortedTraits = [...draft.traits].sort((a, b) => b.xp - a.xp);
  const spentPct = xp.budget > 0 ? Math.min(100, Math.max(0, (xp.spent / xp.budget) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-hud-text">
            {scalars.name || "Unnamed"}
          </h1>
          <p className="mt-1 text-sm text-hud-muted">
            {[scalars.aff, scalars.subaff].filter(Boolean).join(" · ") || "No affiliation"}
          </p>
        </div>
        <HudButton variant="primary" onClick={onEdit}>
          Edit
        </HudButton>
      </header>

      <CatalogWarningBanner warnings={warnings} />

      <Panel title="Experience">
        <div className="flex items-baseline justify-between font-mono text-sm">
          <span className="text-hud-text">{xp.spent.toLocaleString()} spent</span>
          <span className="text-hud-muted">{xp.remaining.toLocaleString()} left</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hud-raised">
          <div className="h-full bg-hud-amber" style={{ width: `${spentPct}%` }} />
        </div>
      </Panel>

      <Panel title="Attributes">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ATTRIBUTE_KEYS.map((key) => {
            const value = draft.attrs[key] ?? 100;
            const pct = Math.min(100, Math.max(0, (value / 300) * 100));
            return (
              <div key={key} className="rounded-md border border-hud-line bg-hud-raised p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs uppercase tracking-widest text-hud-muted">
                    {key}
                  </span>
                  <span className="font-mono text-lg text-hud-text">{value}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-hud-bg">
                  <div className="h-full bg-hud-amber/70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Skills" count={`${draft.skills.length} total`}>
        {topSkills.length === 0 ? (
          <p className="text-sm text-hud-muted">No skills yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {topSkills.map((row, i) => (
              <li
                key={`${row.name}-${i}`}
                className="flex items-center justify-between font-mono text-sm"
              >
                <span className="text-hud-text">{row.name}</span>
                <span className="text-hud-muted">{row.xp}</span>
              </li>
            ))}
            {moreSkills > 0 && (
              <li className="pt-1 text-xs text-hud-amber">+ {moreSkills} more skills</li>
            )}
          </ul>
        )}
      </Panel>

      <Panel title="Traits" count={`${draft.traits.length} total`}>
        {sortedTraits.length === 0 ? (
          <p className="text-sm text-hud-muted">No traits yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sortedTraits.map((row, i) => (
              <li
                key={`${row.name}-${i}`}
                className="flex items-center justify-between font-mono text-sm"
              >
                <span className="text-hud-text">{row.name}</span>
                <span className={row.xp >= 0 ? "text-hud-green" : "text-hud-red"}>
                  {signed(row.xp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Vitals">
        <p className="text-sm text-hud-text">
          {[
            scalars.age ? `Age ${scalars.age}` : null,
            scalars.sex || null,
            scalars.height ? `${scalars.height} cm` : null,
            scalars.weight ? `${scalars.weight} kg` : null,
            scalars.haircolor ? `Hair ${scalars.haircolor}` : null,
            scalars.eyecolor ? `Eyes ${scalars.eyecolor}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No vitals recorded."}
        </p>
      </Panel>
    </div>
  );
}
