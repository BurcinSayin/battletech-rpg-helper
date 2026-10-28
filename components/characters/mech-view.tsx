"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import type { BtccDraft } from "@/lib/btcc/types";
import { skillLevel } from "@/lib/characters/skill-level";
import { resolveSkillName } from "@/lib/rules/load";
import {
  skillComplexity,
  skillTargetNumber,
} from "@/lib/rules/skill-complexity";
import {
  MECH_DAMAGE_LIMITS,
  armorLost,
  emptyMechDamage,
  isCriticalHit,
  locationLabels,
  normalizeMechDamage,
  setArmorLost,
  setHeat,
  setPilotHits,
  setStructureLost,
  setStructureMax,
  structureTrack,
  toggleCritical,
  type MechDamage,
} from "@/lib/mech/damage";
import type { MechData } from "@/lib/mech/types";
import { EMPTY_SLOT } from "@/lib/mech/types";
import { resolveMechWeaponReference } from "@/lib/mech/weapon-reference";
import { cn } from "@/lib/utils";
import { HudButton, Panel } from "./ui";

const NO_DAMAGE: MechDamage = emptyMechDamage();
const COUNTER_MAX = MECH_DAMAGE_LIMITS.counter;

function isEmptySlot(slot: string): boolean {
  const s = slot.trim();
  return s === "" || s.toLowerCase() === EMPTY_SLOT.toLowerCase();
}

/** Rear torso armor codes (armor-only locations). */
function isRearArmor(location: string): boolean {
  return /^RT[LRC]$/i.test(location.trim());
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-hud-line bg-hud-raised px-3 py-2">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-hud-muted">
        {label}
      </dt>
      <dd className="mt-0.5 break-words font-mono text-sm text-hud-text">
        {value === "" || value == null ? "—" : value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Condition helpers

type Tone = "none" | "intact" | "damaged" | "depleted";

function toneOf(remaining: number, max: number): Tone {
  if (max <= 0) return "none";
  if (remaining <= 0) return "depleted";
  if (remaining < max) return "damaged";
  return "intact";
}

const toneText: Record<Tone, string> = {
  none: "text-hud-muted",
  intact: "text-hud-text",
  damaged: "text-hud-amber",
  depleted: "text-hud-red",
};
const toneBorder: Record<Tone, string> = {
  none: "border-hud-line",
  intact: "border-hud-line",
  damaged: "border-hud-amber/40",
  depleted: "border-hud-red/50 bg-hud-red/5",
};
const toneFill: Record<Tone, string> = {
  none: "bg-hud-line",
  intact: "bg-hud-green/70",
  damaged: "bg-hud-amber",
  depleted: "bg-hud-red",
};

function Meter({ remaining, max }: { remaining: number; max: number }) {
  const tone = toneOf(remaining, max);
  const pct = max > 0 ? Math.round((Math.max(0, remaining) / max) * 100) : 0;
  return (
    <div
      aria-hidden="true"
      className="h-1 overflow-hidden rounded-full bg-hud-line"
    >
      <div
        className={cn("h-full rounded-full transition-all", toneFill[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatusWord({ tone, depleted }: { tone: Tone; depleted: string }) {
  if (tone === "damaged") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-widest text-hud-amber">
        Damaged
      </span>
    );
  }
  if (tone === "depleted") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-widest text-hud-red">
        {depleted}
      </span>
    );
  }
  return null;
}

/** 44px square +/- control. */
const stepButton =
  "flex h-11 min-w-11 items-center justify-center rounded-md border border-hud-line bg-hud-bg/40 font-mono text-lg leading-none text-hud-text transition hover:border-hud-amber hover:text-hud-amber active:scale-95 disabled:pointer-events-none disabled:opacity-30";

function StepButtons({
  minusLabel,
  plusLabel,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  className,
}: {
  minusLabel: string;
  plusLabel: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled: boolean;
  plusDisabled: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-1.5", className)}>
      <button
        type="button"
        aria-label={minusLabel}
        disabled={minusDisabled}
        onClick={onMinus}
        className={stepButton}
      >
        −
      </button>
      <button
        type="button"
        aria-label={plusLabel}
        disabled={plusDisabled}
        onClick={onPlus}
        className={stepButton}
      >
        +
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heat & pilot

function parseHeatSinkCount(raw: string): number | null {
  const match = /^\s*(\d+)(?=\s|$)/.exec(raw);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

function Counter({
  label,
  value,
  hint,
  controls,
}: {
  label: string;
  value: number;
  hint?: string;
  controls?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-md border bg-hud-raised p-3",
        value > 0 ? "border-hud-amber/40" : "border-hud-line",
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-hud-muted">
        {label}
      </span>
      <span
        className={cn(
          "mt-1 font-mono text-3xl tabular-nums",
          value > 0 ? "text-hud-amber" : "text-hud-text",
        )}
      >
        {value}
      </span>
      {hint && (
        <span className="mt-0.5 truncate font-mono text-[10px] text-hud-muted">
          {hint}
        </span>
      )}
      {controls && <div className="mt-auto pt-3">{controls}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Structure maximum input

/** Blank, junk or 0 means "not tracked"; otherwise a whole number 1..999. */
function parseMax(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(COUNTER_MAX, n);
}

/**
 * Structure max field. It updates on every keystroke so Apply is ready without
 * a blur. Typing goes through intermediate values ("1" on the way to "15", or
 * "" after select-all + backspace), and those must not clamp or erase this
 * location's recorded loss. So the field snapshots THIS track's loss when the
 * typing session starts (focus, or first change) and reports it with every
 * value. The caller clamps only the final value against that original loss.
 * Blur ends the session; an explicit −/+ change to this location's loss while
 * still focused becomes the new baseline.
 */
function StructureMaxInput({
  label,
  max,
  lost,
  disabled,
  onChange,
}: {
  label: string;
  max: number | null;
  /** Current loss of this location's track (0 if untracked). */
  lost: number;
  disabled: boolean;
  onChange: (next: number | null, originalLost: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const originalLost = useRef<number | null>(null);
  // The loss this field's last keystroke produced. If the prop differs, the
  // loss was changed some other way (e.g. a −/+ tap while still focused) and
  // that explicit change becomes the new baseline.
  const producedLost = useRef<number | null>(null);
  const committed = max === null ? "" : String(max);
  const shown = draft !== null && parseMax(draft) === max ? draft : committed;
  const end = () => {
    originalLost.current = null;
    producedLost.current = null;
  };
  return (
    <label className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="font-mono text-[10px] uppercase tracking-widest text-hud-muted"
      >
        Max
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={COUNTER_MAX}
        step={1}
        aria-label={label}
        placeholder="—"
        value={shown}
        disabled={disabled}
        onFocus={() => {
          end();
          originalLost.current = lost;
        }}
        onChange={(e) => {
          if (
            originalLost.current === null ||
            (producedLost.current !== null && producedLost.current !== lost)
          ) {
            originalLost.current = lost;
          }
          const next = parseMax(e.target.value);
          producedLost.current =
            next === null ? 0 : Math.min(originalLost.current, next);
          setDraft(e.target.value);
          onChange(next, originalLost.current);
        }}
        onBlur={() => {
          end();
          setDraft(null);
        }}
        className="h-11 w-16 rounded-md border border-hud-line bg-hud-bg/40 px-2 text-center font-mono text-sm text-hud-text outline-none transition placeholder:text-hud-muted focus:border-hud-amber/60 disabled:opacity-50"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Critical slots

function CriticalSection({
  label,
  slots,
  isHit,
  onToggle,
  disabled,
}: {
  label: string;
  slots: string[];
  isHit: (slot: number) => boolean;
  onToggle: (slot: number) => void;
  disabled: boolean;
}) {
  const baseId = useId();
  const hits = slots.filter((_, i) => isHit(i)).length;
  // Mobile: collapsed unless already hit, so a full mech stays scrollable.
  // Desktop (lg): always expanded.
  const [open, setOpen] = useState(hits > 0);
  const used = slots.filter((s) => !isEmptySlot(s)).length;
  const listId = `${baseId}-slots`;

  const meta = (
    <span className="flex items-center gap-2 font-mono text-xs text-hud-muted">
      {hits > 0 && (
        <span className="text-hud-red">
          {hits} {hits === 1 ? "hit" : "hits"}
        </span>
      )}
      <span>
        {used}/{slots.length}
      </span>
    </span>
  );

  return (
    <section
      aria-label={`${label} critical slots`}
      className={cn(
        "rounded-md border bg-hud-raised",
        hits > 0 ? "border-hud-red/40" : "border-hud-line",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left lg:hidden"
      >
        <span className="font-mono text-[11px] uppercase tracking-widest text-hud-amber">
          {label}
        </span>
        <span className="flex items-center gap-3">
          {meta}
          <span
            aria-hidden="true"
            className={cn(
              "text-hud-muted transition",
              open && "rotate-90 text-hud-amber",
            )}
          >
            ▸
          </span>
        </span>
      </button>
      <div className="hidden items-center justify-between gap-2 px-3 pt-3 lg:flex">
        <h4 className="font-mono text-[10px] uppercase tracking-widest text-hud-amber">
          {label}
        </h4>
        {meta}
      </div>
      <ol
        id={listId}
        className={cn(
          "space-y-1 border-t border-hud-line p-2 lg:block lg:border-t-0",
          open ? "block" : "hidden",
        )}
      >
        {slots.map((slot, i) => {
          const hit = isHit(i);
          const empty = isEmptySlot(slot);
          const nameId = `${baseId}-name-${i}`;
          return (
            <li key={i}>
              <button
                type="button"
                aria-pressed={hit}
                aria-label={`Critical hit ${label} slot ${i + 1}`}
                aria-describedby={nameId}
                disabled={disabled}
                onClick={() => onToggle(i)}
                className={cn(
                  "group/slot flex min-h-11 w-full items-center gap-2 rounded border px-2 text-left font-mono text-xs transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-8",
                  hit
                    ? "border-hud-red/60 bg-hud-red/10 text-hud-red"
                    : empty
                      ? "border-dashed border-hud-line/70 text-hud-muted/50 hover:border-hud-muted hover:text-hud-muted"
                      : "border-hud-line/60 text-hud-text hover:border-hud-amber/60",
                )}
              >
                <span className="w-5 shrink-0 text-right text-hud-muted">
                  {i + 1}
                </span>
                <span
                  id={nameId}
                  className={cn(
                    "min-w-0 flex-1 break-words",
                    hit && "line-through decoration-2",
                  )}
                >
                  {slot}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none transition",
                    hit
                      ? "border-hud-red bg-hud-red text-hud-bg"
                      : "border-hud-line text-transparent group-hover/slot:border-hud-muted",
                  )}
                >
                  ✕
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------

export type MechViewProps = {
  mech: MechData | null;
  pilot?: Pick<BtccDraft, "skills" | "traits">;
  /** Damage to display against `mech`. Defaults to none. */
  damage?: MechDamage;
  /** Enables damage controls. Without it the view is read-only. */
  onDamageChange?: (next: MechDamage) => void;
  /** Disables damage controls (e.g. while applying or when stale). */
  controlsDisabled?: boolean;
};

/** Mech display for view mode, with optional damage tracking controls. */
export function MechView({
  mech,
  pilot,
  damage = NO_DAMAGE,
  onDamageChange,
  controlsDisabled = false,
}: MechViewProps) {
  const [structureSetupOpen, setStructureSetupOpen] = useState(false);
  if (!mech) {
    return (
      <Panel title="MECH">
        <p className="text-sm text-hud-muted">No mech</p>
      </Panel>
    );
  }

  const name = [mech.chassis, mech.model].filter(Boolean).join(" ");
  const sinkCount = parseHeatSinkCount(mech.heatSinks);
  const d = normalizeMechDamage(damage, mech);
  const interactive = onDamageChange !== undefined;
  const hasStructure = d.structure.length > 0;
  const configuringStructure =
    interactive && mech.criticalSlots.length > 0 && structureSetupOpen;
  const off = controlsDisabled;
  const change = (next: MechDamage) => onDamageChange?.(next);

  const armorLabels = locationLabels(mech.armor.map((a) => a.location));
  const sectionLabels = locationLabels(
    mech.criticalSlots.map((s) => s.location),
  );
  const totalHits = d.criticals.length;
  const pilotSkill = (canonicalName: string) => {
    const rows = pilot?.skills.flatMap((row, index) => {
      if (resolveSkillName(row.name) !== canonicalName) return [];
      const level = skillLevel(row.xp, pilot.traits);
      const complexity = skillComplexity(row.name, level);
      const targetNumber = skillTargetNumber(row.name, level);
      return [
        <div key={index}>
          Lvl {level} · {complexity ?? "unknown"}/{targetNumber ?? "N/A"}
        </div>,
      ];
    });
    return rows?.length ? rows : "N/A";
  };

  return (
    <div className="space-y-4">
      <Panel
        title="MECH"
        count={mech.mass ? `${mech.mass} t` : undefined}
        action={
          mech.config ? (
            <span className="font-mono text-xs text-hud-amber">
              {mech.config}
            </span>
          ) : undefined
        }
      >
        <h3 className="text-xl font-semibold text-hud-text">
          {name || "Unnamed mech"}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Tech base" value={mech.techBase} />
          <Stat label="Era" value={mech.era} />
          <Stat label="Rules level" value={mech.rulesLevel} />
          <Stat label="MUL ID" value={mech.mulId} />
          <Stat label="Source" value={mech.source} />
        </dl>
        {mech.catalogFile && (
          <p className="mt-3 font-mono text-xs text-hud-muted">
            Loaded from {mech.catalogFile}
          </p>
        )}
      </Panel>

      <Panel title="STATS">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Mass" value={mech.mass} />
          <Stat label="Walk MP" value={mech.walkMP} />
          <Stat label="Jump MP" value={mech.jumpMP} />
          <Stat label="Engine" value={mech.engine} />
          <Stat label="Structure" value={mech.structure} />
          <Stat label="Myomer" value={mech.myomer} />
          <Stat label="Heat sinks" value={mech.heatSinks} />
        </dl>
      </Panel>

      <Panel title="HEAT & PILOT">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid w-full grid-cols-2 gap-2 sm:max-w-md">
            <Counter
              label="Heat"
              value={d.heat}
              hint={mech.heatSinks ? `Sinks: ${mech.heatSinks}` : undefined}
              controls={
                interactive && (
                  <StepButtons
                    minusLabel="Decrease heat"
                    plusLabel="Increase heat"
                    minusDisabled={off || d.heat <= 0}
                    plusDisabled={off || d.heat >= COUNTER_MAX}
                    onMinus={() => change(setHeat(d, d.heat - 1))}
                    onPlus={() => change(setHeat(d, d.heat + 1))}
                  />
                )
              }
            />
            <Counter
              label="Pilot hits"
              value={d.pilotHits}
              controls={
                interactive && (
                  <StepButtons
                    minusLabel="Remove pilot hit"
                    plusLabel="Add pilot hit"
                    minusDisabled={off || d.pilotHits <= 0}
                    plusDisabled={off || d.pilotHits >= COUNTER_MAX}
                    onMinus={() => change(setPilotHits(d, d.pilotHits - 1))}
                    onPlus={() => change(setPilotHits(d, d.pilotHits + 1))}
                  />
                )
              }
            />
          </div>
          {interactive && (
            <HudButton
              type="button"
              className="h-11 w-full shrink-0 sm:w-auto"
              disabled={off || d.heat <= 0 || sinkCount === null}
              onClick={() => {
                if (off || d.heat <= 0 || sinkCount === null) return;
                change(setHeat(d, d.heat - sinkCount));
              }}
            >
              Cool heat
            </HudButton>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Stat label="Mech piloting" value={pilotSkill("Piloting/'Mech")} />
          <Stat label="Mech gunnery" value={pilotSkill("Gunnery/'Mech")} />
        </dl>
      </Panel>

      <Panel title="ARMOR" count={mech.armorType || undefined}>
        {mech.armor.length === 0 ? (
          <p className="text-sm text-hud-muted">No armor recorded.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {mech.armor.map((a, i) => {
              const label = armorLabels[i];
              const max = Math.max(0, a.value);
              const lost = armorLost(d, i);
              const remaining = Math.max(0, max - lost);
              const tone = toneOf(remaining, max);
              return (
                <li
                  key={`${a.location}-${i}`}
                  className={cn(
                    "flex flex-col rounded-md border bg-hud-raised px-2 py-2 sm:px-3",
                    toneBorder[tone],
                  )}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-hud-muted">
                      {label}
                    </span>
                    {isRearArmor(a.location) && (
                      <span className="font-mono text-[9px] uppercase tracking-widest text-hud-muted/70">
                        Rear
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono tabular-nums">
                    <span className={cn("text-lg", toneText[tone])}>
                      {remaining}
                    </span>
                    <span className="text-xs text-hud-muted">/{max}</span>
                  </p>
                  <Meter remaining={remaining} max={max} />
                  <div className="mt-1 h-3.5">
                    <StatusWord tone={tone} depleted="Depleted" />
                  </div>
                  {interactive && (
                    <StepButtons
                      className="mt-1.5"
                      minusLabel={`Damage armor ${label}`}
                      plusLabel={`Repair armor ${label}`}
                      minusDisabled={off || remaining <= 0}
                      plusDisabled={off || lost <= 0}
                      onMinus={() => change(setArmorLost(d, mech, i, lost + 1))}
                      onPlus={() => change(setArmorLost(d, mech, i, lost - 1))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {interactive && mech.criticalSlots.length > 0 && (
        <HudButton
          type="button"
          className="h-11"
          disabled={off}
          aria-expanded={configuringStructure}
          onClick={() => setStructureSetupOpen((open) => !open)}
        >
          {configuringStructure
            ? "Done configuring structure"
            : hasStructure
              ? "Configure structure"
              : "Track structure"}
        </HudButton>
      )}

      {(hasStructure || configuringStructure) && (
        <Panel title="STRUCTURE">
          {configuringStructure && (
            <p className="mb-3 text-xs text-hud-muted">
              Enter each location&apos;s internal structure to track it. Leave
              it blank to skip a location.
            </p>
          )}
          <ul className="grid gap-2 lg:grid-cols-2">
            {mech.criticalSlots.map((section, si) => {
              const label = sectionLabels[si];
              const track = structureTrack(d, si);
              if (!configuringStructure && !track) return null;
              const max = track?.max ?? 0;
              const lost = track?.lost ?? 0;
              const remaining = Math.max(0, max - lost);
              const tone = track ? toneOf(remaining, max) : "none";
              return (
                <li
                  key={`${section.location}-${si}`}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-hud-raised p-2 sm:px-3",
                    toneBorder[tone],
                  )}
                >
                  <div className="min-w-0 flex-1 basis-36">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-mono text-[10px] uppercase tracking-widest text-hud-muted">
                        {label}
                      </span>
                      {track ? (
                        <span className="font-mono tabular-nums">
                          <span className={cn("text-lg", toneText[tone])}>
                            {remaining}
                          </span>
                          <span className="text-xs text-hud-muted">/{max}</span>
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-hud-muted/70">
                          Not tracked
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <Meter remaining={remaining} max={max} />
                    </div>
                    <div className="mt-1 h-3.5">
                      <StatusWord tone={tone} depleted="Destroyed" />
                    </div>
                  </div>
                  {interactive && (
                    <div className="flex items-center gap-2">
                      {configuringStructure && (
                        <StructureMaxInput
                          label={`Structure max ${label}`}
                          max={track?.max ?? null}
                          lost={lost}
                          disabled={off}
                          onChange={(next, originalLost) => {
                            // Latest damage everywhere else; only this
                            // track's loss comes from the typing snapshot.
                            const withMax = setStructureMax(d, mech, si, next);
                            change(
                              next === null
                                ? withMax
                                : setStructureLost(
                                    withMax,
                                    mech,
                                    si,
                                    Math.min(originalLost, next),
                                  ),
                            );
                          }}
                        />
                      )}
                      <StepButtons
                        minusLabel={`Damage structure ${label}`}
                        plusLabel={`Repair structure ${label}`}
                        minusDisabled={off || !track || remaining <= 0}
                        plusDisabled={off || !track || lost <= 0}
                        onMinus={() =>
                          change(setStructureLost(d, mech, si, lost + 1))
                        }
                        onPlus={() =>
                          change(setStructureLost(d, mech, si, lost - 1))
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel
        title="CRITICAL SLOTS"
        count={
          totalHits > 0 ? (
            <span className="text-hud-red">
              {totalHits} {totalHits === 1 ? "hit" : "hits"}
            </span>
          ) : undefined
        }
      >
        {mech.criticalSlots.length === 0 ? (
          <p className="text-sm text-hud-muted">No critical slots recorded.</p>
        ) : interactive ? (
          <>
            <p className="mb-3 text-xs text-hud-muted">
              Tap a slot to mark or clear a critical hit.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3">
              {mech.criticalSlots.map((section, si) => (
                <CriticalSection
                  key={`${section.location}-${si}`}
                  label={sectionLabels[si]}
                  slots={section.slots}
                  isHit={(slot) => isCriticalHit(d, si, slot)}
                  onToggle={(slot) => change(toggleCritical(d, mech, si, slot))}
                  disabled={off}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {mech.criticalSlots.map((section, si) => (
              <section
                key={`${section.location}-${si}`}
                aria-label={`${sectionLabels[si]} critical slots`}
                className="rounded-md border border-hud-line bg-hud-raised p-3"
              >
                <h4 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hud-amber">
                  {sectionLabels[si]}
                </h4>
                <ol className="space-y-0.5 font-mono text-xs">
                  {section.slots.map((slot, i) => {
                    const hit = isCriticalHit(d, si, i);
                    return (
                      <li
                        key={i}
                        className={cn(
                          "flex gap-2",
                          hit
                            ? "text-hud-red"
                            : isEmptySlot(slot)
                              ? "text-hud-muted/50"
                              : "text-hud-text",
                        )}
                      >
                        <span className="w-5 shrink-0 text-right text-hud-muted">
                          {i + 1}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 break-words",
                            hit && "line-through decoration-2",
                          )}
                        >
                          {slot}
                        </span>
                        {hit && (
                          <span className="sr-only"> (critical hit)</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="WEAPONS" count={mech.weapons.length}>
        {mech.weapons.length === 0 ? (
          <p className="text-sm text-hud-muted">No weapons recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="pb-3 text-left text-xs text-hud-muted">
                S/M/L = short/medium/long; Min = minimum. Base catalog values;
                ammunition, firing modes, cluster hits, and special effects are
                not calculated.
              </caption>
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-widest text-hud-muted">
                  <th scope="col" className="py-1 pr-3 font-normal">
                    Weapon
                  </th>
                  <th scope="col" className="py-1 pr-3 font-normal">
                    Location
                  </th>
                  <th scope="col" className="py-1 pr-3 font-normal">
                    Heat
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap py-1 pr-3 font-normal"
                  >
                    Damage (S/M/L)
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap py-1 pr-3 font-normal"
                  >
                    Range (Min/S/M/L)
                  </th>
                  <th scope="col" className="py-1 font-normal">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody>
                {mech.weapons.map((w, i) => {
                  const result = resolveMechWeaponReference(
                    w.name,
                    mech.techBase,
                  );
                  const reference =
                    result.status === "matched" ? result.reference : null;
                  return (
                    <tr key={i} className="border-t border-hud-line">
                      <td className="py-1.5 pr-3 text-hud-text">
                        {w.name}
                        {result.status !== "matched" && (
                          <span className="mt-1 block text-xs text-hud-muted">
                            {result.status === "ambiguous"
                              ? "Ambiguous catalog match"
                              : "No catalog match"}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-hud-muted">
                        {w.location}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-hud-text">
                        {reference ? reference.heat : "—"}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-hud-text">
                        {reference ? reference.damage.join(" / ") : "—"}
                        {reference?.isCluster && (
                          <span className="mt-1 block whitespace-normal text-xs text-hud-muted">
                            Cluster weapon; not calculated salvo damage.
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-hud-text">
                        {reference ? reference.ranges.join(" / ") : "—"}
                      </td>
                      <td className="py-1.5 font-mono text-xs text-hud-muted">
                        {w.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {mech.unsupported.length > 0 && (
        <Panel title="OTHER SOURCE LINES" count={mech.unsupported.length}>
          <ul className="space-y-0.5 font-mono text-xs text-hud-muted">
            {mech.unsupported.map((line, i) => (
              <li key={i} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
