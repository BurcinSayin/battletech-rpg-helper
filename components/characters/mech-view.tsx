"use client";

import type { ReactNode } from "react";
import type { MechData } from "@/lib/mech/types";
import { EMPTY_SLOT } from "@/lib/mech/types";
import { cn } from "@/lib/utils";
import { Panel } from "./ui";

function isEmptySlot(slot: string): boolean {
  const s = slot.trim();
  return s === "" || s.toLowerCase() === EMPTY_SLOT.toLowerCase();
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

/** Read-only mech display (view mode). */
export function MechView({ mech }: { mech: MechData | null }) {
  if (!mech) {
    return (
      <Panel title="MECH">
        <p className="text-sm text-hud-muted">No mech</p>
      </Panel>
    );
  }

  const name = [mech.chassis, mech.model].filter(Boolean).join(" ");

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

      <Panel title="ARMOR" count={mech.armorType || undefined}>
        {mech.armor.length === 0 ? (
          <p className="text-sm text-hud-muted">No armor recorded.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {mech.armor.map((a, i) => (
              <li
                key={`${a.location}-${i}`}
                className="rounded-md border border-hud-line bg-hud-raised px-3 py-2 text-center"
              >
                <span className="block font-mono text-[10px] uppercase tracking-widest text-hud-muted">
                  {a.location}
                </span>
                <span className="font-mono text-lg text-hud-text">
                  {a.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="WEAPONS" count={mech.weapons.length}>
        {mech.weapons.length === 0 ? (
          <p className="text-sm text-hud-muted">No weapons recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-widest text-hud-muted">
                  <th scope="col" className="py-1 pr-3 font-normal">
                    Weapon
                  </th>
                  <th scope="col" className="py-1 pr-3 font-normal">
                    Location
                  </th>
                  <th scope="col" className="py-1 font-normal">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody>
                {mech.weapons.map((w, i) => (
                  <tr key={i} className="border-t border-hud-line">
                    <td className="py-1.5 pr-3 text-hud-text">{w.name}</td>
                    <td className="py-1.5 pr-3 text-hud-muted">{w.location}</td>
                    <td className="py-1.5 font-mono text-xs text-hud-muted">
                      {w.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="CRITICAL SLOTS">
        {mech.criticalSlots.length === 0 ? (
          <p className="text-sm text-hud-muted">No critical slots recorded.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {mech.criticalSlots.map((section, si) => (
              <section
                key={`${section.location}-${si}`}
                aria-label={`${section.location} critical slots`}
                className="rounded-md border border-hud-line bg-hud-raised p-3"
              >
                <h4 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-hud-amber">
                  {section.location}
                </h4>
                <ol className="space-y-0.5 font-mono text-xs">
                  {section.slots.map((slot, i) => (
                    <li
                      key={i}
                      className={cn(
                        "flex gap-2",
                        isEmptySlot(slot)
                          ? "text-hud-muted/50"
                          : "text-hud-text",
                      )}
                    >
                      <span className="w-5 shrink-0 text-right text-hud-muted">
                        {i + 1}
                      </span>
                      <span className="min-w-0 break-words">{slot}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
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
