"use client";

import type { EquipmentRow, WeaponRow } from "@/lib/btcc/inventory";
import {
  armorPlacementWarning,
  readyAllocationWarning,
  resolveInventoryName,
  type Inventory,
} from "@/lib/characters/inventory";
import { HudButton, Panel } from "./ui";

const text = (value: string) => (value.trim() ? value : "Unknown");

function CombatStats({ row }: { row: EquipmentRow | WeaponRow }) {
  return "skill" in row ? (
    <dl className="grid gap-1 sm:grid-cols-3">
      <div>
        <dt className="text-hud-muted">Damage</dt>
        <dd>{text(row.damage)}</dd>
      </div>
      <div>
        <dt className="text-hud-muted">Range</dt>
        <dd>{text(row.range)}</dd>
      </div>
      <div>
        <dt className="text-hud-muted">Shots / power</dt>
        <dd>{text(row.shots)}</dd>
      </div>
    </dl>
  ) : (
    <p>BAR (M/B/E/X): {text(row.bar)}</p>
  );
}

function Reference({
  value,
  kind,
  name,
}: {
  value: Inventory;
  kind: "equipment" | "weapon";
  name: string;
}) {
  const matches = resolveInventoryName(value, kind, name);
  if (!matches.length)
    return (
      <p className="text-hud-amber">
        Missing inventory item; reference preserved.
      </p>
    );
  if (matches.length > 1)
    return (
      <div>
        <p className="text-hud-amber">
          Ambiguous reference: {matches.length} same-name inventory rows. Combat
          stats cannot be selected automatically.
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer py-2">
            Available variants for {name || "Unknown"}
          </summary>
          <ul className="space-y-2">
            {matches.map((entry) => (
              <li
                key={`${entry.kind}-${entry.index}`}
                className="rounded border border-hud-line p-2"
              >
                <p className="text-hud-muted">
                  Inventory row {entry.index + 1}
                </p>
                {entry.row && <CombatStats row={entry.row} />}
                {entry.row && (
                  <p className="text-hud-muted">
                    Quantity: {text(entry.row.countText)} · Stack value:{" "}
                    {text(entry.row.costText)} C-Bills · Stack mass:{" "}
                    {text(entry.row.massText)} kg
                  </p>
                )}
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {entry.row && text(entry.row.notes)}
                </p>
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  return <CombatStats row={matches[0].row!} />;
}

/** A name-based, lossless view of active references, never an inventory editor. */
export function CombatLoadout({
  value,
  onOpenEquipment,
}: {
  value: Inventory;
  onOpenEquipment?: () => void;
}): React.JSX.Element {
  const garments = new Map<string, string[]>();
  for (const [slot, name] of Object.entries(value.equipLoc)) {
    const slots = garments.get(name) ?? [];
    slots.push(slot);
    garments.set(name, slots);
  }
  const placementWarning = armorPlacementWarning(value);
  return (
    <Panel
      title="Combat loadout"
      className="min-w-0"
      action={
        onOpenEquipment && (
          <HudButton type="button" onClick={onOpenEquipment}>
            View equipment
          </HudButton>
        )
      }
    >
      <div className="grid min-w-0 gap-4 text-sm text-hud-text [overflow-wrap:anywhere] lg:grid-cols-2">
        <section className="min-w-0">
          <h3 className="mb-2 font-medium">Readied weapons</h3>
          {!value.chrWeapons.length ? (
            <p className="text-hud-muted">No readied weapons.</p>
          ) : (
            <ol className="space-y-3">
              {value.chrWeapons.map((name, index) => {
                const warning = readyAllocationWarning(value, name);
                return (
                  <li
                    key={index}
                    className="rounded border border-hud-line p-3"
                  >
                    <h4 className="mb-1 font-medium">
                      {index + 1}. {text(name)}
                    </h4>
                    <Reference value={value} kind="weapon" name={name} />
                    {warning && (
                      <p className="mt-1 text-hud-amber">{warning}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <section className="min-w-0">
          <h3 className="mb-2 font-medium">Worn armor</h3>
          {placementWarning && (
            <p className="mb-2 text-hud-amber">
              {placementWarning} BAR is shown per item, never combined.
            </p>
          )}
          {!garments.size ? (
            <p className="text-hud-muted">No worn armor.</p>
          ) : (
            <ul className="space-y-3">
              {[...garments].map(([name, slots]) => (
                <li key={name} className="rounded border border-hud-line p-3">
                  <h4 className="font-medium">{text(name)}</h4>
                  <p className="mb-1 text-hud-muted">
                    Locations: {slots.map(text).join(", ")}
                  </p>
                  <Reference value={value} kind="equipment" name={name} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}
