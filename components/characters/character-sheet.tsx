"use client";

import { useState, type ReactNode } from "react";
import type { BtccDraft } from "@/lib/btcc/types";
import type { CatalogWarnings, XpSummary } from "@/lib/characters";
import {
  ATTRIBUTE_KEYS,
  attributeLevel,
  attributeLinkModifier,
  skillLevel,
} from "@/lib/characters";
import { findSkill, findTrait, resolveSkillName } from "@/lib/rules/load";
import { skillComplexity, skillTargetNumber } from "@/lib/rules/skill-complexity";
import { CatalogWarningBanner } from "./warnings";
import { HudButton, Panel } from "./ui";

const TOP_SKILLS = 5;

function signed(xp: number): string {
  return xp >= 0 ? `+${xp}` : `${xp}`;
}

/**
 * Read-only character sheet, mirroring section 02 of the design wireframe.
 * The header action defaults to an Edit button (`onEdit`), but callers can pass
 * `actions` to swap it out — e.g. the import preview renders Import/Cancel.
 */
export function CharacterSheet({
  draft,
  xp,
  warnings,
  onEdit,
  actions,
}: {
  draft: BtccDraft;
  xp: XpSummary;
  warnings: CatalogWarnings;
  onEdit?: () => void;
  actions?: ReactNode;
}) {
  const { scalars } = draft;
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [expandedTrait, setExpandedTrait] = useState<string | null>(null);
  const sortedSkills = [...draft.skills].sort((a, b) => b.xp - a.xp);
  const visibleSkills = showAllSkills
    ? sortedSkills
    : sortedSkills.slice(0, TOP_SKILLS);
  const hiddenCount = sortedSkills.length - TOP_SKILLS;
  const sortedTraits = [...draft.traits].sort((a, b) => b.xp - a.xp);
  const spentPct =
    xp.budget > 0
      ? Math.min(100, Math.max(0, (xp.spent / xp.budget) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-hud-text">
            {scalars.name || "Unnamed"}
          </h1>
          <p className="mt-1 text-sm text-hud-muted">
            {[scalars.aff, scalars.subaff].filter(Boolean).join(" · ") ||
              "No affiliation"}
          </p>
        </div>
        {actions ?? (
          <HudButton variant="primary" onClick={onEdit}>
            Edit
          </HudButton>
        )}
      </header>

      <CatalogWarningBanner warnings={warnings} />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <Panel title="Experience">
            <div className="flex items-baseline justify-between font-mono text-sm">
              <span className="text-hud-text">
                {xp.spent.toLocaleString()} spent
              </span>
              <span className="text-hud-muted">
                {xp.remaining.toLocaleString()} left
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hud-raised">
              <div
                className="h-full bg-hud-amber"
                style={{ width: `${spentPct}%` }}
              />
            </div>
          </Panel>

          <Panel title="Attributes">
            <div className="grid grid-cols-2 gap-2">
              {ATTRIBUTE_KEYS.map((key) => {
                const level = attributeLevel(draft.attrs[key]);
                const modifier = attributeLinkModifier(level);
                return (
                  <div
                    key={key}
                    className="rounded-md border border-hud-amber/60 bg-hud-raised p-3"
                  >
                    <h3 className="font-mono text-base font-semibold uppercase tracking-widest text-hud-amber">
                      {key}
                    </h3>
                    <dl className="mt-2 flex items-baseline justify-between gap-1">
                      <div className="flex items-baseline gap-1">
                        <dt className="text-xs text-hud-muted">LVL</dt>
                        <dd className="font-mono text-sm text-hud-text">
                          {level === null ? "N/A" : level}
                        </dd>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <dt className="text-xs text-hud-muted">MOD</dt>
                        <dd className="font-mono text-sm text-hud-text">
                          {modifier === null ? "N/A" : signed(modifier)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-hud-muted">
              Levels are unavailable when attribute XP is missing. Link Modifiers
              are undefined below Level 1.
            </p>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Skills" count={`${draft.skills.length} total`}>
            {visibleSkills.length === 0 ? (
              <p className="text-sm text-hud-muted">No skills yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {visibleSkills.map((row, i) => {
                  const level = skillLevel(row.xp, draft.traits);
                  const complexity = skillComplexity(row.name, level);
                  const targetNumber = skillTargetNumber(row.name, level);
                  const meta = findSkill(row.name);
                  const isExpanded = expandedSkill === row.name;
                  return (
                    <li
                      key={`${row.name}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-sm border-b border-hud-line/40 pb-1.5 last:border-b-0"
                    >
                      <span
                        className={`min-w-0 break-words text-hud-text ${meta ? "cursor-pointer select-none hover:text-hud-amber transition-colors" : ""
                          }`}
                        onClick={() => {
                          if (meta) {
                            setExpandedSkill(isExpanded ? null : row.name);
                          }
                        }}
                      >
                        {resolveSkillName(row.name)}
                      </span>
                      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-hud-muted">
                        <span className="whitespace-nowrap">Lvl {level}</span>
                        <span className="whitespace-nowrap">
                          {complexity ?? "unknown"}/{targetNumber}
                        </span>

                      </div>
                      {isExpanded && meta && (
                        <div className="w-full mt-1 rounded bg-hud-raised/60 p-2 text-xs font-sans text-hud-muted border border-hud-line/40 flex flex-col gap-1">
                          <div className="flex items-center justify-between font-mono text-[11px] text-hud-text">
                            <span>
                              Links: {meta.attributes} · TN: {meta.targetNumber} · {meta.category}
                              {meta.tiered && meta.advanced && (
                                <span className="text-hud-amber ml-2">
                                  [Adv: {meta.advanced.attributes} · TN {meta.advanced.targetNumber} · {meta.advanced.category}]
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-hud-muted bg-hud-raised px-1.5 py-0.5 rounded border border-hud-line/50">
                              {meta.page}
                            </span>
                          </div>
                          {meta.description && (
                            <p className="leading-relaxed text-hud-text/90">
                              {meta.description}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
                {hiddenCount > 0 && (
                  <li className="pt-1">
                    <button
                      type="button"
                      aria-expanded={showAllSkills}
                      onClick={() => setShowAllSkills((v) => !v)}
                      className="text-xs text-hud-amber transition hover:brightness-110"
                    >
                      {showAllSkills
                        ? "Show less"
                        : `+ ${hiddenCount} more skills`}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </Panel>

          <Panel title="Traits" count={`${draft.traits.length} total`}>
            {sortedTraits.length === 0 ? (
              <p className="text-sm text-hud-muted">No traits yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {sortedTraits.map((row, i) => {
                  const meta = findTrait(row.name);
                  const isExpanded = expandedTrait === row.name;
                  return (
                    <li
                      key={`${row.name}-${i}`}
                      className="flex flex-col gap-1 border-b border-hud-line/40 pb-1.5 last:border-b-0 font-mono text-sm"
                    >
                      <div
                        className={`flex items-center justify-between ${meta ? "cursor-pointer select-none group" : ""
                          }`}
                        onClick={() => {
                          if (meta) {
                            setExpandedTrait(isExpanded ? null : row.name);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-hud-text ${meta ? "group-hover:text-hud-amber transition-colors" : ""
                              }`}
                          >
                            {row.name}
                          </span>
                          {meta && (
                            <span className="text-[10px] text-hud-muted bg-hud-raised px-1.5 py-0.5 rounded border border-hud-line/50">
                              {meta.page}
                            </span>
                          )}
                        </div>
                        <span
                          className={
                            row.xp >= 0 ? "text-hud-green" : "text-hud-red"
                          }
                        >
                          {signed(row.xp)}
                        </span>
                      </div>
                      {isExpanded && meta && (
                        <div className="mt-1 rounded bg-hud-raised/60 p-2 text-xs font-sans text-hud-muted border border-hud-line/40 flex flex-col gap-1">
                          <div className="flex items-center justify-between font-mono text-[11px] text-hud-text">
                            <span>
                              {meta.category} · {meta.trait_type}
                            </span>
                            <span className="text-hud-amber">{meta.tp_score}</span>
                          </div>
                          <p className="leading-relaxed text-hud-text/90">
                            {meta.description}
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
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
      </div>
    </div>
  );
}
