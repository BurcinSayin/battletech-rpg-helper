"use client";

import { useState } from "react";
import { MECH_LIMITS } from "@/lib/mech/schema";
import {
  EMPTY_SLOT,
  KNOWN_SLOT_LOCATIONS,
  type MechData,
} from "@/lib/mech/types";
import { cn } from "@/lib/utils";
import { HudButton, hudInput } from "./ui";
import {
  Group,
  NumberField,
  TextField,
  dangerSmallButton,
  slotAbbreviation,
  smallButton,
} from "./mech-ui";

export type SectionProps = {
  mech: MechData;
  update: (patch: Partial<MechData>) => void;
};

const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-4";

export function IdentitySection({ mech, update }: SectionProps) {
  return (
    <Group title="IDENTITY & SOURCE">
      <div className={grid}>
        <TextField
          label="Chassis"
          value={mech.chassis}
          maxLength={MECH_LIMITS.chassis}
          onChange={(chassis) => update({ chassis })}
        />
        <TextField
          label="Model"
          value={mech.model}
          maxLength={MECH_LIMITS.model}
          onChange={(model) => update({ model })}
        />
        <TextField
          label="MUL ID"
          value={mech.mulId ?? ""}
          maxLength={MECH_LIMITS.mulId}
          onChange={(v) => update({ mulId: v === "" ? undefined : v })}
        />
        <TextField
          label="Config"
          value={mech.config}
          maxLength={MECH_LIMITS.config}
          onChange={(config) => update({ config })}
        />
        <TextField
          label="Tech base"
          value={mech.techBase}
          maxLength={MECH_LIMITS.techBase}
          onChange={(techBase) => update({ techBase })}
        />
        <TextField
          label="Era"
          value={mech.era}
          maxLength={MECH_LIMITS.era}
          onChange={(era) => update({ era })}
        />
        <TextField
          label="Rules level"
          value={mech.rulesLevel}
          maxLength={MECH_LIMITS.rulesLevel}
          onChange={(rulesLevel) => update({ rulesLevel })}
        />
        <TextField
          label="Source"
          value={mech.source}
          maxLength={MECH_LIMITS.source}
          onChange={(source) => update({ source })}
        />
      </div>
      {mech.catalogFile && (
        <p className="mt-3 font-mono text-xs text-hud-muted">
          Loaded from {mech.catalogFile}
        </p>
      )}
    </Group>
  );
}

export function StatsSection({ mech, update }: SectionProps) {
  return (
    <Group title="CORE STATS">
      <div className={grid}>
        <NumberField
          label="Mass"
          value={mech.mass}
          max={MECH_LIMITS.mass}
          onChange={(mass) => update({ mass })}
        />
        <NumberField
          label="Walk MP"
          value={mech.walkMP}
          max={MECH_LIMITS.movement}
          onChange={(walkMP) => update({ walkMP })}
        />
        <NumberField
          label="Jump MP"
          value={mech.jumpMP}
          max={MECH_LIMITS.movement}
          onChange={(jumpMP) => update({ jumpMP })}
        />
        <TextField
          label="Engine"
          value={mech.engine}
          maxLength={MECH_LIMITS.engine}
          onChange={(engine) => update({ engine })}
        />
        <TextField
          label="Structure"
          value={mech.structure}
          maxLength={MECH_LIMITS.structure}
          onChange={(structure) => update({ structure })}
        />
        <TextField
          label="Myomer"
          value={mech.myomer}
          maxLength={MECH_LIMITS.myomer}
          onChange={(myomer) => update({ myomer })}
        />
        <TextField
          label="Heat sinks"
          value={mech.heatSinks}
          maxLength={MECH_LIMITS.heatSinks}
          onChange={(heatSinks) => update({ heatSinks })}
        />
      </div>
    </Group>
  );
}

export function ArmorSection({ mech, update }: SectionProps) {
  const [newLocation, setNewLocation] = useState("");
  const location = newLocation.trim();
  const full = mech.armor.length >= MECH_LIMITS.armorEntries;

  const add = () => {
    if (location === "" || full) return;
    update({ armor: [...mech.armor, { location, value: 0 }] });
    setNewLocation("");
  };

  return (
    <Group title="ARMOR" meta={mech.armor.length}>
      <TextField
        label="Armor type"
        value={mech.armorType}
        maxLength={MECH_LIMITS.armorType}
        onChange={(armorType) => update({ armorType })}
        className="sm:max-w-sm"
      />
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {mech.armor.map((entry, i) => (
          <li
            key={i}
            className="rounded-md border border-hud-line bg-hud-raised p-2"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-xs uppercase tracking-widest text-hud-muted">
                {entry.location}
              </span>
              <button
                type="button"
                aria-label={`Remove armor ${entry.location}`}
                onClick={() =>
                  update({ armor: mech.armor.filter((_, j) => j !== i) })
                }
                className="text-hud-muted hover:text-hud-red"
              >
                ×
              </button>
            </div>
            <NumberField
              hideLabel
              label={`Armor ${entry.location}`}
              value={entry.value}
              max={MECH_LIMITS.armorValue}
              onChange={(value) =>
                update({
                  armor: mech.armor.map((a, j) =>
                    j === i ? { ...a, value } : a,
                  ),
                })
              }
              className="mt-1"
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-end gap-2">
        <input
          type="text"
          aria-label="New armor location"
          placeholder="Location code"
          value={newLocation}
          maxLength={MECH_LIMITS.armorLocation}
          onChange={(e) => setNewLocation(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          className={cn(hudInput, "max-w-40")}
        />
        <HudButton
          type="button"
          onClick={add}
          disabled={location === "" || full}
        >
          Add armor location
        </HudButton>
      </div>
    </Group>
  );
}

export function WeaponsSection({ mech, update }: SectionProps) {
  const { weapons } = mech;
  const patch = (i: number, p: Partial<MechData["weapons"][number]>) =>
    update({ weapons: weapons.map((w, j) => (j === i ? { ...w, ...p } : w)) });
  const move = (i: number, to: number) => {
    const next = [...weapons];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item);
    update({ weapons: next });
  };

  return (
    <Group title="WEAPONS" meta={weapons.length}>
      {weapons.length === 0 && (
        <p className="mb-3 text-sm text-hud-muted">No weapons recorded.</p>
      )}
      <ul className="space-y-3">
        {weapons.map((w, i) => {
          const n = i + 1;
          return (
            <li
              key={i}
              className="grid grid-cols-[1fr_auto] gap-2 rounded-md border border-hud-line bg-hud-raised p-2 lg:grid-cols-[1fr_1fr_10rem_auto]"
            >
              <input
                type="text"
                aria-label={`Weapon ${n} name`}
                placeholder="Weapon"
                value={w.name}
                maxLength={MECH_LIMITS.weaponName}
                onChange={(e) => patch(i, { name: e.target.value })}
                className={cn(hudInput, "col-span-2 lg:col-span-1")}
              />
              <input
                type="text"
                aria-label={`Weapon ${n} location`}
                placeholder="Location"
                value={w.location}
                maxLength={MECH_LIMITS.weaponLocation}
                onChange={(e) => patch(i, { location: e.target.value })}
                className={cn(hudInput, "col-span-2 lg:col-span-1")}
              />
              <input
                type="text"
                aria-label={`Weapon ${n} detail`}
                placeholder="Detail (optional)"
                value={w.detail ?? ""}
                maxLength={MECH_LIMITS.weaponDetail}
                onChange={(e) =>
                  patch(i, {
                    detail: e.target.value === "" ? undefined : e.target.value,
                  })
                }
                className={hudInput}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move weapon ${n} up`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  className={smallButton}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move weapon ${n} down`}
                  disabled={i === weapons.length - 1}
                  onClick={() => move(i, i + 1)}
                  className={smallButton}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove weapon ${n}`}
                  onClick={() =>
                    update({ weapons: weapons.filter((_, j) => j !== i) })
                  }
                  className={dangerSmallButton}
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <HudButton
        type="button"
        className="mt-3"
        disabled={weapons.length >= MECH_LIMITS.weapons}
        onClick={() =>
          update({ weapons: [...weapons, { name: "", location: "" }] })
        }
      >
        Add weapon
      </HudButton>
    </Group>
  );
}

export function CriticalSlotsSection({ mech, update }: SectionProps) {
  const sections = mech.criticalSlots;
  const [toAdd, setToAdd] = useState("");

  const missing = KNOWN_SLOT_LOCATIONS.filter(
    (name) => !sections.some((s) => s.location === name),
  );
  const chosen = missing.includes(toAdd as (typeof missing)[number])
    ? toAdd
    : (missing[0] ?? "");

  const setSlots = (si: number, slots: string[]) =>
    update({
      criticalSlots: sections.map((s, j) => (j === si ? { ...s, slots } : s)),
    });

  return (
    <Group title="CRITICAL SLOTS" meta={sections.length}>
      <p className="mb-3 text-xs text-hud-muted">
        Slots are listed in order, starting at 1. Expand a location to edit it.
      </p>
      <div className="space-y-2">
        {sections.map((section, si) => {
          const code = slotAbbreviation(section.location);
          const used = section.slots.filter(
            (s) => s.trim() !== "" && s.trim().toLowerCase() !== "-empty-",
          ).length;
          return (
            <details
              key={si}
              className="group rounded-md border border-hud-line bg-hud-raised"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                <span className="text-sm text-hud-text">
                  {section.location}
                </span>
                <span className="flex items-center gap-3 font-mono text-xs text-hud-muted">
                  {used}/{section.slots.length} used
                  <span
                    aria-hidden="true"
                    className="transition group-open:rotate-90 group-open:text-hud-amber"
                  >
                    ▸
                  </span>
                </span>
              </summary>
              <div className="border-t border-hud-line p-3">
                <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {section.slots.map((slot, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-right font-mono text-xs text-hud-muted">
                        {i + 1}
                      </span>
                      <input
                        type="text"
                        aria-label={`${code} slot ${i + 1}`}
                        value={slot}
                        maxLength={MECH_LIMITS.slotEntry}
                        onChange={(e) =>
                          setSlots(
                            si,
                            section.slots.map((s, j) =>
                              j === i ? e.target.value : s,
                            ),
                          )
                        }
                        className={hudInput}
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${code} slot ${i + 1}`}
                        onClick={() =>
                          setSlots(
                            si,
                            section.slots.filter((_, j) => j !== i),
                          )
                        }
                        className={dangerSmallButton}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex flex-wrap gap-2">
                  <HudButton
                    type="button"
                    aria-label={`Add ${code} slot`}
                    disabled={
                      section.slots.length >= MECH_LIMITS.slotsPerSection
                    }
                    onClick={() => setSlots(si, [...section.slots, EMPTY_SLOT])}
                  >
                    Add slot
                  </HudButton>
                  <HudButton
                    type="button"
                    variant="danger"
                    aria-label={`Remove ${section.location} section`}
                    onClick={() =>
                      update({
                        criticalSlots: sections.filter((_, j) => j !== si),
                      })
                    }
                  >
                    Remove section
                  </HudButton>
                </div>
              </div>
            </details>
          );
        })}
      </div>
      {missing.length > 0 && sections.length < MECH_LIMITS.slotSections && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <select
            aria-label="Critical slot section to add"
            value={chosen}
            onChange={(e) => setToAdd(e.target.value)}
            className={cn(hudInput, "max-w-48")}
          >
            {missing.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <HudButton
            type="button"
            onClick={() =>
              update({
                criticalSlots: [
                  ...sections,
                  { location: chosen, slots: [EMPTY_SLOT] },
                ],
              })
            }
          >
            Add section
          </HudButton>
        </div>
      )}
    </Group>
  );
}

export function UnsupportedSection({ mech, update }: SectionProps) {
  const lines = mech.unsupported;
  return (
    <Group
      title="UNSUPPORTED SOURCE LINES"
      meta={lines.length}
      defaultOpen={false}
    >
      <p className="mb-2 text-xs text-hud-muted">
        Lines from the source file this editor has no field for. They are kept
        with the mech; one line per row.
      </p>
      <textarea
        aria-label="Unsupported source lines"
        rows={Math.min(12, Math.max(3, lines.length + 1))}
        value={lines.join("\n")}
        onChange={(e) => {
          const raw = e.target.value;
          update({
            unsupported:
              raw === ""
                ? []
                : raw
                    .split("\n")
                    .slice(0, MECH_LIMITS.unsupportedLines)
                    .map((l) => l.slice(0, MECH_LIMITS.unsupportedLine)),
          });
        }}
        className={cn(hudInput, "font-mono text-xs")}
      />
    </Group>
  );
}
