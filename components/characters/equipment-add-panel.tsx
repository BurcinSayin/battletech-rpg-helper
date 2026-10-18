"use client";

import { useId, useState } from "react";
import {
  createEquipmentRow,
  createWeaponRow,
  type EquipmentRowOverrides,
  type InventoryRowResult,
  type WeaponRowOverrides,
} from "@/lib/btcc/inventory";
import {
  inventoryAmount,
  inventoryCount,
  type InventoryKind,
} from "@/lib/characters/inventory";
import type { CatalogAmount } from "@/lib/validation/catalog";
import {
  EquipmentCatalogPicker,
  type InventoryCatalogSelection,
} from "./equipment-catalog-picker";
import { HudButton, Panel, hudInput } from "./ui";

const fieldLabels: Record<string, string> = {
  count: "Quantity to add",
  cost: "Unit cost (C-Bills)",
  mass: "Unit mass (kg)",
  ammoCost: "Reload cost (C-Bills)",
  ammoMass: "Reload mass (kg)",
  armorLocation: "Coverage",
  bar: "BAR M/B/E/X",
  damage: "Damage",
  range: "Range",
  shots: "Shots / power",
  name: "Catalog name",
  skill: "Catalog skill",
};
const numericFields = ["cost", "mass", "ammoCost", "ammoMass"];
const statFields = ["damage", "range", "shots"];
const slots = [
  ["H", "Head"],
  ["T", "Torso"],
  ["A", "Arms"],
  ["L", "Legs"],
  ["HAN", "Hands"],
  ["F", "Feet"],
] as const;
const barParts = ["M", "B", "E", "X"] as const;

type AddInputs = {
  count: string;
  overrides: Record<string, string>;
  revealed: string[];
};

// Keep the text in state, interpreting it only at the builder boundary.
function amountOverride(text: string | undefined): number | undefined {
  if (text === undefined || !text.trim()) return undefined;
  return inventoryAmount(text) ?? NaN;
}

function build(
  selection: InventoryCatalogSelection,
  inputs: AddInputs,
): InventoryRowResult {
  const count = inventoryCount(inputs.count) ?? NaN;
  const values = inputs.overrides;
  const common = {
    unitCost: amountOverride(values.cost),
    unitMassKg: amountOverride(values.mass),
  };
  if (selection.kind === "equipment") {
    const overrides: EquipmentRowOverrides = {
      ...common,
      armorLocation: values.armorLocation,
      bar: values.bar,
    };
    return createEquipmentRow(selection.item, count, overrides);
  }
  const overrides: WeaponRowOverrides = {
    ...common,
    ammoCost: amountOverride(values.ammoCost),
    ammoMassKg: amountOverride(values.ammoMass),
    damage: values.damage,
    range: values.range,
    shots: values.shots,
  };
  return createWeaponRow(selection.item, count, overrides);
}

function originalAmount(amount: CatalogAmount): string {
  return (
    amount.text ??
    (amount.multiplier !== null
      ? `×${amount.multiplier}`
      : amount.value !== null
        ? String(amount.value)
        : "Unknown")
  );
}

function StagedItem({
  selection,
  disabled,
  onAdd,
  onCancel,
}: {
  selection: InventoryCatalogSelection;
  disabled: boolean;
  onAdd: (kind: InventoryKind, row: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const id = useId();
  const [inputs, setInputs] = useState<AddInputs>(() => {
    const initial: AddInputs = { count: "1", overrides: {}, revealed: [] };
    const result = build(selection, initial);
    return { ...initial, revealed: result.ok ? [] : result.fields };
  });
  const result = build(selection, inputs);
  const failures = result.ok ? [] : result.fields;
  const visible = new Set([...inputs.revealed, ...failures]);
  const { item } = selection;

  function update(next: AddInputs) {
    const preview = build(selection, next);
    setInputs({
      ...next,
      revealed: [
        ...new Set([...visible, ...(preview.ok ? [] : preview.fields)]),
      ],
    });
  }
  function setOverride(field: string, value: string) {
    update({ ...inputs, overrides: { ...inputs.overrides, [field]: value } });
  }
  function error(field: string) {
    if (!failures.includes(field)) return null;
    return (
      <p id={`${id}-${field}-error`} className="text-xs text-hud-red">
        {fieldLabels[field] ?? field}:{" "}
        {result.ok
          ? ""
          : result.code === "unsafe-field"
            ? "Cannot contain semicolons, colons or line breaks."
            : result.code === "invalid-count"
              ? "Enter a positive whole number no greater than 2147483647."
              : "Enter an explicit valid value; unresolved catalog values cannot be assumed to be zero."}
      </p>
    );
  }
  function textField(field: string) {
    const numeric = numericFields.includes(field);
    return (
      <div key={field} className="space-y-1">
        <label
          htmlFor={`${id}-${field}`}
          className="block text-xs text-hud-muted"
        >
          {fieldLabels[field]}
        </label>
        <input
          id={`${id}-${field}`}
          type="text"
          inputMode={numeric ? "decimal" : "text"}
          className={hudInput}
          disabled={disabled}
          value={inputs.overrides[field] ?? ""}
          aria-invalid={failures.includes(field)}
          aria-describedby={
            failures.includes(field) ? `${id}-${field}-error` : undefined
          }
          onChange={(event) => setOverride(field, event.target.value)}
        />
        {error(field)}
      </div>
    );
  }

  return (
    <section
      aria-label={`Add ${item.name}`}
      className="mt-4 min-w-0 space-y-4 rounded-md border border-hud-line p-3"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement)
          event.preventDefault();
      }}
    >
      <h3 className="break-words text-sm font-semibold text-hud-text">
        {item.name}
      </h3>
      <p className="text-xs text-hud-amber">
        Staged item — not yet added. Adding does not ready, wear or debit money.
      </p>
      <div className="space-y-1 break-words text-xs text-hud-muted">
        <p>
          Catalog: {[item.category, item.section].filter(Boolean).join(" · ")}
        </p>
        <p>
          Catalog unit cost: {originalAmount(item.cost)}; unit mass:{" "}
          {originalAmount(item.mass)}
        </p>
        {selection.kind === "weapon" && (
          <>
            <p>
              Catalog reload cost: {originalAmount(selection.item.ammoCost)};
              reload mass: {originalAmount(selection.item.ammoMass)}
            </p>
            <p>
              Catalog damage: {selection.item.damage ?? "Unknown"}; range:{" "}
              {selection.item.range ?? "Unknown"}; shots / power:{" "}
              {selection.item.shots ?? "Unknown"}
            </p>
          </>
        )}
        {selection.kind === "equipment" && selection.item.armor && (
          <p>
            Catalog coverage: {selection.item.armor.coverage || "Unknown"}; BAR:{" "}
            {selection.item.armor.bar || "Unknown"}
          </p>
        )}
        <p>
          Sources:{" "}
          {item.sources
            .map(
              (source) =>
                `${source.file}, ${source.table}, p. ${source.printedPage} (PDF p. ${source.pdfPage})`,
            )
            .join("; ")}
        </p>
        {item.notes.map((note, index) => (
          <p key={index} className="whitespace-pre-wrap">
            Catalog note ({note.scope}): {note.text}
          </p>
        ))}
        <p>
          Catalog multipliers and item-specific modification rules are not
          calculated here.
        </p>
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-count`} className="block text-xs text-hud-muted">
          Quantity to add
        </label>
        <input
          id={`${id}-count`}
          type="text"
          inputMode="numeric"
          className={hudInput}
          value={inputs.count}
          disabled={disabled}
          aria-invalid={failures.includes("count")}
          aria-describedby={
            failures.includes("count") ? `${id}-count-error` : undefined
          }
          onChange={(event) => update({ ...inputs, count: event.target.value })}
        />
        {error("count")}
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {numericFields.filter((field) => visible.has(field)).map(textField)}
        {selection.kind === "weapon" &&
          statFields.filter((field) => visible.has(field)).map(textField)}
      </div>
      {selection.kind === "equipment" && visible.has("armorLocation") && (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="text-xs text-hud-muted">Coverage</legend>
          <div className="flex flex-wrap gap-3">
            {slots.map(([token, label]) => {
              const current = inputs.overrides.armorLocation ?? "";
              const selected =
                current === "FUL"
                  ? slots.map(([slot]) => slot)
                  : slots
                      .map(([slot]) => slot)
                      .filter((slot) => {
                        // Read only our canonical selection; HAN must not also select H/A.
                        const tokens: readonly string[] =
                          current.match(/HAN|H|T|A|L|F/g) ?? [];
                        return tokens.includes(slot);
                      });
              return (
                <label
                  key={token}
                  className="flex min-h-11 items-center gap-2 text-sm text-hud-text"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(token)}
                    onChange={(event) => {
                      const next = slots
                        .map(([slot]) => slot)
                        .filter((slot) =>
                          slot === token
                            ? event.target.checked
                            : selected.includes(slot),
                        );
                      setOverride(
                        "armorLocation",
                        next.length === 6 ? "FUL" : next.join(""),
                      );
                    }}
                  />
                  {label}
                </label>
              );
            })}
            <label className="flex min-h-11 items-center gap-2 text-sm text-hud-text">
              <input
                type="checkbox"
                checked={inputs.overrides.armorLocation === "N"}
                onChange={(event) =>
                  setOverride("armorLocation", event.target.checked ? "N" : "")
                }
              />
              No coverage
            </label>
          </div>
          {error("armorLocation")}
        </fieldset>
      )}
      {selection.kind === "equipment" && visible.has("bar") && (
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="text-xs text-hud-muted">BAR M/B/E/X</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {barParts.map((part, index) => (
              <label key={part} className="block text-xs text-hud-muted">
                BAR {part}
                <input
                  type="text"
                  inputMode="numeric"
                  className={hudInput}
                  value={
                    (inputs.overrides.bar ?? "///").split("/")[index] ?? ""
                  }
                  aria-invalid={failures.includes("bar")}
                  aria-describedby={
                    failures.includes("bar") ? `${id}-bar-error` : undefined
                  }
                  onChange={(event) => {
                    const values = (inputs.overrides.bar ?? "///").split("/");
                    values[index] = event.target.value;
                    setOverride("bar", values.join("/"));
                  }}
                />
              </label>
            ))}
          </div>
          {error("bar")}
        </fieldset>
      )}
      {result.ok ? (
        <div className="space-y-1">
          <p className="text-xs text-hud-muted">
            Builder preview (not yet added)
          </p>
          <pre className="whitespace-pre-wrap break-all text-xs text-hud-text">
            {result.row}
          </pre>
        </div>
      ) : (
        <div role="alert" className="space-y-1 text-xs text-hud-red">
          <p>
            Cannot add item: {result.code}. Fields:{" "}
            {result.fields
              .map((field) => fieldLabels[field] ?? field)
              .join(", ")}
            .
          </p>
          {result.fields
            .filter(
              (field) =>
                field === "name" || field === "skill" || field === "notes",
            )
            .map((field) => (
              <p key={field}>
                {fieldLabels[field] ?? field} cannot be safely stored. This
                catalog field cannot be replaced here.
              </p>
            ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <HudButton
          type="button"
          variant="primary"
          disabled={disabled || !result.ok}
          onClick={() => {
            if (!disabled && result.ok) onAdd(selection.kind, result.row);
          }}
        >
          Add item
        </HudButton>
        <HudButton type="button" disabled={disabled} onClick={onCancel}>
          Cancel addition
        </HudButton>
      </div>
    </section>
  );
}

export function EquipmentAddPanel({
  disabled = false,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (kind: InventoryKind, row: string) => void;
}): React.JSX.Element {
  const [selection, setSelection] = useState<InventoryCatalogSelection | null>(
    null,
  );
  return (
    <Panel title="Add equipment" className="min-w-0">
      <EquipmentCatalogPicker disabled={disabled} onSelect={setSelection} />
      {selection && (
        <StagedItem
          key={`${selection.kind}-${selection.item.id}`}
          selection={selection}
          disabled={disabled}
          onCancel={() => setSelection(null)}
          onAdd={(kind, row) => {
            onAdd(kind, row);
            setSelection(null);
          }}
        />
      )}
    </Panel>
  );
}
