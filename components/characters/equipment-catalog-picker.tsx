"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { equipment, weapons } from "@/lib/rules/load";
import type { EquipmentItem, WeaponItem } from "@/lib/validation/catalog";
import { cn } from "@/lib/utils";
import { hudInput } from "./ui";

export type InventoryCatalogSelection =
  | { kind: "equipment"; item: EquipmentItem }
  | { kind: "weapon"; item: WeaponItem };

type Filter = "all" | "weapons" | "armor" | "other";
const catalog: InventoryCatalogSelection[] = [
  ...equipment
    .filter((item) => item.kind !== "modifier")
    .map((item) => ({ kind: "equipment" as const, item })),
  ...weapons
    .filter((item) => item.kind !== "modifier")
    .map((item) => ({ kind: "weapon" as const, item })),
];

function group(selection: InventoryCatalogSelection): Filter {
  if (selection.kind === "weapon" && selection.item.kind === "weapon")
    return "weapons";
  if (
    selection.kind === "equipment" &&
    (selection.item.kind === "armor" || selection.item.armor !== null)
  )
    return "armor";
  return "other";
}

export function EquipmentCatalogPicker({
  disabled = false,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (selection: InventoryCatalogSelection) => void;
}): React.JSX.Element {
  const id = useId();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = text.trim().toLowerCase();
  const results = useMemo(
    () =>
      catalog.filter((selection) => {
        if (filter !== "all" && group(selection) !== filter) return false;
        const { item } = selection;
        return [
          item.name,
          ...item.aliases,
          item.category,
          item.section ?? "",
        ].some((value) => value.toLowerCase().includes(query));
      }),
    [query, filter],
  );
  const visible = open && !disabled;
  const listVisible = visible && results.length > 0;

  useEffect(() => {
    if (active >= 0 && listVisible) {
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView?.({ block: "nearest" });
    }
  }, [active, id, listVisible]);

  function choose(selection: InventoryCatalogSelection) {
    if (disabled) return;
    setText("");
    setOpen(false);
    setActive(-1);
    onSelect(selection);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const selection = listVisible ? results[active] : undefined;
      if (selection) choose(selection);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!results.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        current < 0
          ? step === 1
            ? 0
            : results.length - 1
          : (current + step + results.length) % results.length,
      );
    } else if ((event.key === "Home" || event.key === "End") && listVisible) {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : results.length - 1);
    } else if (event.key === "Escape" && visible) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <label className="block text-xs text-hud-muted" htmlFor={`${id}-filter`}>
        Catalog filter
      </label>
      <select
        id={`${id}-filter`}
        className={hudInput}
        value={filter}
        disabled={disabled}
        onChange={(event) => {
          setFilter(event.target.value as Filter);
          setActive(-1);
          setOpen(true);
        }}
      >
        <option value="all">All</option>
        <option value="weapons">Weapons</option>
        <option value="armor">Armor</option>
        <option value="other">Other Gear</option>
      </select>
      <div className="relative">
        <label className="block text-xs text-hud-muted" htmlFor={`${id}-input`}>
          Search equipment catalog
        </label>
        <input
          id={`${id}-input`}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className={cn(hudInput, "mt-1")}
          value={text}
          aria-autocomplete="list"
          aria-expanded={listVisible}
          aria-controls={listVisible ? `${id}-listbox` : undefined}
          aria-activedescendant={
            listVisible && active >= 0 ? `${id}-option-${active}` : undefined
          }
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder="Search name, alias, category or section"
        />
        {listVisible && (
          <ul
            id={`${id}-listbox`}
            role="listbox"
            aria-label="Equipment catalog"
            className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-hud-line bg-hud-raised py-1 shadow-xl shadow-black/50"
          >
            {results.map((selection, index) => (
              <li
                key={`${selection.kind}-${selection.item.id}`}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(selection)}
                className={cn(
                  "cursor-pointer break-words px-3 py-3 text-sm text-hud-text",
                  index === active && "bg-hud-amber/10",
                )}
              >
                <span className="block">{selection.item.name}</span>
                <span className="block text-xs text-hud-muted">
                  {[
                    selection.kind === "equipment"
                      ? "Equipment"
                      : "Weapon catalog",
                    selection.item.category,
                    selection.item.section,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div role="status" aria-live="polite" className="text-xs text-hud-muted">
        {visible
          ? results.length
            ? `${results.length} catalog results found.`
            : "No matching equipment."
          : ""}
      </div>
      <p className="text-xs text-hud-muted">
        Modifiers require item-specific rules and are not standalone inventory.
      </p>
    </div>
  );
}
