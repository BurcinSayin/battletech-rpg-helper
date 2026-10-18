"use client";

import { Fragment, useState } from "react";
import type { EquipmentRow, WeaponRow } from "@/lib/btcc/inventory";
import type { EquipmentItem, WeaponItem } from "@/lib/validation/catalog";
import {
  ARMOR_SLOTS,
  armorCoverage,
  armorDisplacements,
  armorPlacementWarning,
  assignInventoryArmor,
  changeInventoryCount,
  clearInventoryArmor,
  inventoryCount,
  inventoryRows,
  inventoryTotals,
  quantityProblem,
  readyAllocationWarning,
  readyInventoryWeapon,
  removeInventoryRow,
  resolveInventoryName,
  unreadyInventoryWeapon,
  weaponReadinessProblem,
  type ArmorSlot,
  type Inventory,
  type InventoryChangeResult,
  type InventoryKind,
} from "@/lib/characters/inventory";
import { EquipmentAddPanel } from "./equipment-add-panel";
import { HudButton, Panel, hudInput } from "./ui";

type Entry = {
  kind: InventoryKind;
  index: number;
  raw: string;
  row: EquipmentRow | WeaponRow | null;
  catalog?: EquipmentItem | WeaponItem;
  group: string;
};
type RowState = {
  expanded?: boolean;
  quantity?: string;
  slots?: ArmorSlot[];
  removing?: boolean;
  error?: string;
};
const display = (value: string) => (value.trim() ? value : "Unknown");

function StoredDetails({ entry }: { entry: Entry }) {
  const { row, catalog } = entry;
  if (!row)
    return (
      <div>
        <p className="text-hud-amber">
          Unrecognized imported row. Preserved unchanged; only explicit removal
          is available.
        </p>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs [overflow-wrap:anywhere]">
          {entry.raw}
        </pre>
      </div>
    );
  const fields: [string, string][] = [
    ["Stored stack value (C-Bills)", row.costText],
    ["Stored stack mass (kg)", row.massText],
    ...("skill" in row
      ? ([
          ["Skill", row.skill],
          ["Damage", row.damage],
          ["Range", row.range],
          ["Shots / power", row.shots],
          ["Reload cost (C-Bills)", row.ammoCostText],
          ["Reload mass (kg)", row.ammoMassText],
        ] as [string, string][])
      : ([
          ["Coverage", row.armorLocation],
          ["BAR (M/B/E/X)", row.bar],
        ] as [string, string][])),
    ["Stored notes", row.notes],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-hud-muted">{label}</dt>
            <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {display(value)}
            </dd>
          </div>
        ))}
      </dl>
      {catalog && (
        <aside className="border-t border-hud-line pt-2 text-hud-muted">
          <h4 className="font-medium">
            Catalog supplemental information (not stored values)
          </h4>
          <p>
            {catalog.name} · {catalog.category}
            {catalog.section ? ` · ${catalog.section}` : ""}
          </p>
          {catalog.sources.map((source, index) => (
            <p key={index}>
              {source.file}, {source.table}, p. {source.printedPage}
            </p>
          ))}
          {catalog.notes.map((note, index) => (
            <p key={index} className="whitespace-pre-wrap">
              {note.text}
            </p>
          ))}
        </aside>
      )}
    </div>
  );
}

export function EquipmentTab({
  value,
  onChange,
  disabled = false,
}: {
  value: Inventory;
  onChange?: (next: Inventory) => void;
  disabled?: boolean;
}): React.JSX.Element {
  // Both responsive presentations share staged inputs; only explicit actions commit.
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [loadoutError, setLoadoutError] = useState<string | null>(null);
  const rows = inventoryRows(value);
  const totals = inventoryTotals(value);
  const placementWarning = armorPlacementWarning(value);
  function patch(key: string, next: Partial<RowState>) {
    setStates((previous) => ({
      ...previous,
      [key]: { ...previous[key], ...next },
    }));
  }
  function commit(result: InventoryChangeResult, key?: string): boolean {
    if (disabled || !onChange) return false;
    if (!result.ok) {
      if (key) patch(key, { error: result.message });
      else setLoadoutError(result.message);
      return false;
    }
    if (key) patch(key, { error: undefined });
    else setLoadoutError(null);
    onChange(result.value);
    return true;
  }
  function status(entry: Entry) {
    if (!entry.row) return "Unrecognized imported row";
    const name = entry.row.name;
    const active =
      entry.kind === "weapon"
        ? `${value.chrWeapons.filter((item) => item === name).length} readied by name`
        : Object.entries(value.equipLoc)
            .filter(([, item]) => item === name)
            .map(([slot]) => slot)
            .join(", ") || "Carried";
    return (
      <>
        <span>{active}</span>
        {resolveInventoryName(value, entry.kind, name).length > 1 && (
          <p className="text-hud-amber">
            Ambiguous name: multiple stacks; references cannot identify a
            variant.
          </p>
        )}
      </>
    );
  }
  function details(entry: Entry) {
    const key = `${entry.kind}-${entry.index}`;
    const state = states[key] ?? {};
    const problem = entry.row
      ? quantityProblem(value, entry.kind, entry.index)
      : null;
    const coverage =
      entry.row && "armorLocation" in entry.row
        ? armorCoverage(entry.row.armorLocation)
        : null;
    const slots = state.slots ?? [];
    const displacements =
      entry.kind === "equipment" && slots.length
        ? armorDisplacements(value, entry.index, slots)
        : [];
    const readyProblem =
      entry.kind === "weapon"
        ? weaponReadinessProblem(value, entry.index)
        : null;
    return (
      <div className="min-w-0 space-y-3 p-3 text-sm [overflow-wrap:anywhere]">
        <StoredDetails entry={entry} />
        {onChange && (
          <div className="space-y-3 border-t border-hud-line pt-3">
            {entry.row && (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="max-w-48 text-hud-muted">
                    Quantity
                    <input
                      type="text"
                      inputMode="numeric"
                      className={hudInput}
                      disabled={disabled || !!problem}
                      value={state.quantity ?? entry.row.countText}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.preventDefault();
                      }}
                      onChange={(event) =>
                        patch(key, {
                          quantity: event.target.value,
                          error: undefined,
                        })
                      }
                    />
                  </label>
                  <HudButton
                    type="button"
                    disabled={disabled || !!problem}
                    onClick={() => {
                      const count = inventoryCount(
                        state.quantity ?? entry.row!.countText,
                      );
                      if (
                        commit(
                          changeInventoryCount(
                            value,
                            entry.kind,
                            entry.index,
                            count ?? NaN,
                          ),
                          key,
                        )
                      )
                        patch(key, { quantity: undefined });
                    }}
                  >
                    Apply quantity
                  </HudButton>
                </div>
                <p className="text-xs text-hud-muted">
                  Quantity text is not applied until Apply quantity.
                </p>
                {problem && <p className="text-hud-amber">{problem}</p>}
                {entry.kind === "weapon" && entry.group === "Weapons" && (
                  <div>
                    <HudButton
                      type="button"
                      disabled={disabled || !!readyProblem}
                      onClick={() =>
                        commit(readyInventoryWeapon(value, entry.index), key)
                      }
                    >
                      Ready weapon
                    </HudButton>
                    {readyProblem && (
                      <p className="mt-1 text-hud-muted">{readyProblem}</p>
                    )}
                  </div>
                )}
                {entry.kind === "equipment" && entry.group === "Armor" && (
                  <div className="space-y-2">
                    {coverage && coverage.slots.length > 0 ? (
                      <>
                        <fieldset disabled={disabled}>
                          <legend className="mb-2">
                            Armor placement
                            {coverage.exclusive
                              ? " — choose Torso OR Legs"
                              : " — choose covered slots"}
                          </legend>
                          <div className="flex flex-wrap gap-3">
                            {ARMOR_SLOTS.filter((slot) =>
                              coverage.slots.includes(slot),
                            ).map((slot) => (
                              <label
                                key={slot}
                                className="flex min-h-10 items-center gap-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={slots.includes(slot)}
                                  onChange={(event) =>
                                    patch(key, {
                                      slots: event.target.checked
                                        ? coverage.exclusive
                                          ? [slot]
                                          : [...slots, slot]
                                        : slots.filter((item) => item !== slot),
                                      error: undefined,
                                    })
                                  }
                                />
                                {slot}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <p className="text-xs text-hud-muted">
                          Placement is not applied yet. Replaces all existing
                          placements for this garment.
                        </p>
                        {displacements.length > 0 && (
                          <p className="text-hud-amber">
                            Will take off:{" "}
                            {displacements
                              .map(([slot, name]) => `${name} (${slot})`)
                              .join(", ")}
                            . All locations of each displaced garment are
                            cleared.
                          </p>
                        )}
                        <HudButton
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            commit(
                              assignInventoryArmor(value, entry.index, slots),
                              key,
                            )
                          }
                        >
                          Apply armor placement
                        </HudButton>
                      </>
                    ) : (
                      <p className="text-hud-amber">
                        Stored coverage does not permit new placement. Existing
                        placements can still be taken off.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {state.removing ? (
              <div className="space-y-2">
                <p>
                  Remove this inventory row? References are cleared only when
                  the last exact-name row is removed.
                </p>
                <div className="flex flex-wrap gap-2">
                  <HudButton
                    type="button"
                    variant="danger"
                    disabled={disabled}
                    onClick={() => {
                      if (
                        commit(
                          removeInventoryRow(value, entry.kind, entry.index),
                          key,
                        )
                      )
                        setStates({});
                    }}
                  >
                    Remove item
                  </HudButton>
                  <HudButton
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      patch(key, { removing: false, error: undefined })
                    }
                  >
                    Cancel
                  </HudButton>
                </div>
              </div>
            ) : (
              <HudButton
                type="button"
                variant="danger"
                disabled={disabled}
                onClick={() => patch(key, { removing: true })}
              >
                Remove
              </HudButton>
            )}
            {state.error && (
              <p role="alert" className="text-hud-red">
                {state.error}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
  function toggle(entry: Entry) {
    const key = `${entry.kind}-${entry.index}`;
    return (
      <HudButton
        type="button"
        aria-expanded={!!states[key]?.expanded}
        aria-label={`Details for ${entry.row?.name || "unrecognized imported row"}`}
        onClick={() => patch(key, { expanded: !states[key]?.expanded })}
      >
        Details
      </HudButton>
    );
  }
  return (
    <div className="min-w-0 space-y-4 text-sm text-hud-text [overflow-wrap:anywhere]">
      <Panel title="Inventory totals">
        <p>
          {totals.mass.unknownRows ? "Known carried mass" : "Carried mass"}:{" "}
          {totals.mass.known.toLocaleString(undefined, {
            maximumFractionDigits: 10,
          })}{" "}
          kg
          {totals.mass.unknownRows > 0 &&
            ` (+ ${totals.mass.unknownRows} unknown rows)`}
        </p>
        <p>
          {totals.cost.unknownRows
            ? "Known inventory value"
            : "Inventory value"}
          : {totals.cost.known.toLocaleString()} C-Bills
          {totals.cost.unknownRows > 0 &&
            ` (+ ${totals.cost.unknownRows} unknown rows)`}
        </p>
        <p className="mt-1 text-xs text-hud-muted">
          Stored stack totals, not remaining money. Adding or removing equipment
          does not change C-Bills.
        </p>
      </Panel>
      {onChange && (
        <EquipmentAddPanel
          disabled={disabled}
          onAdd={(kind, row) => {
            if (disabled) return;
            const field = kind === "equipment" ? "equip" : "weapons";
            onChange({ ...value, [field]: [...value[field], row] });
          }}
        />
      )}
      {(["Weapons", "Armor", "Other Gear"] as const).map((group) => {
        const entries = rows.filter((entry) => entry.group === group);
        return (
          <Panel
            key={group}
            title={group}
            count={entries.length}
            className="min-w-0"
          >
            {!entries.length ? (
              <p className="text-hud-muted">
                No {group.toLowerCase()} in inventory.
              </p>
            ) : (
              <>
                <table className="hidden w-full table-fixed text-left md:table">
                  <thead className="text-xs text-hud-muted">
                    <tr>
                      <th scope="col" className="w-1/4 p-2">
                        Name
                      </th>
                      <th scope="col" className="w-[12%] p-2">
                        Quantity
                      </th>
                      <th scope="col" className="w-[14%] p-2">
                        Mass (kg)
                      </th>
                      <th scope="col" className="p-2">
                        Status
                      </th>
                      <th scope="col" className="w-28 p-2">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const key = `${entry.kind}-${entry.index}`;
                      return (
                        <Fragment key={key}>
                          <tr className="border-t border-hud-line align-top">
                            <th scope="row" className="p-2 font-medium">
                              {entry.row
                                ? display(entry.row.name)
                                : "Unrecognized imported row"}
                            </th>
                            <td className="p-2">
                              {entry.row
                                ? display(entry.row.countText)
                                : "Unknown"}
                            </td>
                            <td className="p-2">
                              {entry.row
                                ? display(entry.row.massText)
                                : "Unknown"}
                            </td>
                            <td className="p-2">{status(entry)}</td>
                            <td className="p-2">{toggle(entry)}</td>
                          </tr>
                          {states[key]?.expanded && (
                            <tr>
                              <td colSpan={5}>{details(entry)}</td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <ul className="space-y-2 md:hidden">
                  {entries.map((entry) => {
                    const key = `${entry.kind}-${entry.index}`;
                    return (
                      <li
                        key={key}
                        className="min-w-0 rounded border border-hud-line"
                      >
                        <div className="space-y-2 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="min-w-0 font-medium">
                              {entry.row
                                ? display(entry.row.name)
                                : "Unrecognized imported row"}
                            </h3>
                            {toggle(entry)}
                          </div>
                          <dl className="grid grid-cols-2 gap-2">
                            <div>
                              <dt className="text-hud-muted">Quantity</dt>
                              <dd>
                                {entry.row
                                  ? display(entry.row.countText)
                                  : "Unknown"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-hud-muted">Mass (kg)</dt>
                              <dd>
                                {entry.row
                                  ? display(entry.row.massText)
                                  : "Unknown"}
                              </dd>
                            </div>
                            <div className="col-span-2">
                              <dt className="text-hud-muted">Status</dt>
                              <dd>{status(entry)}</dd>
                            </div>
                          </dl>
                        </div>
                        {states[key]?.expanded && details(entry)}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Panel>
        );
      })}
      <Panel title="Active loadout" className="min-w-0">
        <div className="space-y-4">
          <section>
            <h3 className="mb-2 font-medium">Readied weapons</h3>
            {!value.chrWeapons.length ? (
              <p className="text-hud-muted">No readied weapons.</p>
            ) : (
              <ol className="space-y-2">
                {value.chrWeapons.map((name, index) => {
                  const matches = resolveInventoryName(value, "weapon", name);
                  const warning = readyAllocationWarning(value, name);
                  return (
                    <li
                      key={index}
                      className="rounded border border-hud-line p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {index + 1}. {display(name)}
                        </span>
                        {onChange && (
                          <HudButton
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              commit(unreadyInventoryWeapon(value, index))
                            }
                          >
                            Unready
                          </HudButton>
                        )}
                      </div>
                      {!matches.length && (
                        <p className="text-hud-amber">
                          Missing inventory item; reference preserved.
                        </p>
                      )}
                      {matches.length > 1 && (
                        <p className="text-hud-amber">
                          Ambiguous reference: multiple same-name inventory
                          rows.
                        </p>
                      )}
                      {warning && <p className="text-hud-amber">{warning}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          <section>
            <h3 className="mb-2 font-medium">Armor placements</h3>
            {placementWarning && (
              <p className="mb-2 text-hud-amber">{placementWarning}</p>
            )}
            {!Object.keys(value.equipLoc).length ? (
              <p className="text-hud-muted">No worn armor.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(value.equipLoc).map(([slot, name]) => {
                  const matches = resolveInventoryName(
                    value,
                    "equipment",
                    name,
                  );
                  return (
                    <li
                      key={slot}
                      className="rounded border border-hud-line p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {display(slot)}: {display(name)}
                        </span>
                        {onChange && (
                          <HudButton
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              commit(clearInventoryArmor(value, slot))
                            }
                          >
                            Take off
                          </HudButton>
                        )}
                      </div>
                      {!matches.length && (
                        <p className="text-hud-amber">
                          Missing inventory item; reference preserved.
                        </p>
                      )}
                      {matches.length > 1 && (
                        <p className="text-hud-amber">
                          Ambiguous reference: multiple same-name inventory
                          rows.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {loadoutError && (
            <p role="alert" className="text-hud-red">
              {loadoutError}
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
