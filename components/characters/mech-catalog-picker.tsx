"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { searchMechCatalog } from "@/app/(app)/characters/[id]/mech-actions";
import type { CatalogEntry } from "@/lib/mech/catalog";
import { cn } from "@/lib/utils";
import { hudInput } from "./ui";

const DEBOUNCE_MS = 250;

type SearchState = {
  /** The (trimmed) query these results belong to. */
  query: string;
  results: CatalogEntry[];
  error: string | null;
};

const IDLE: SearchState = { query: "", results: [], error: null };

function techBaseLabel(code: string): string {
  if (code === "is") return "Inner Sphere";
  if (code === "c") return "Clan";
  return code;
}

/** `era · mass · tech base` line that tells similar variants apart. */
export function describeEntry(entry: CatalogEntry): string {
  return [
    entry.era ? `Era ${entry.era}` : null,
    entry.mass ? `${entry.mass} t` : null,
    entry.techBase ? techBaseLabel(entry.techBase) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Searchable combo box over the predefined mech catalog (ARIA 1.2 combobox
 * with a listbox popup). Searches are debounced and responses for a query that
 * is no longer current are ignored.
 */
export function MechCatalogPicker({
  onSelect,
}: {
  onSelect: (entry: CatalogEntry) => void;
}) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<SearchState>(IDLE);

  const query = text.trim();

  useEffect(() => {
    if (query === "") return;
    // Set on cleanup: a response for an outdated query is dropped.
    let stale = false;
    const timer = setTimeout(async () => {
      let next: SearchState;
      try {
        const result = await searchMechCatalog(query);
        next = result.ok
          ? { query, results: result.results, error: null }
          : { query, results: [], error: result.message };
      } catch {
        next = {
          query,
          results: [],
          error: "Predefined mechs could not be searched. Try again.",
        };
      }
      if (!stale) {
        setState(next);
        setActive(-1);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      stale = true;
    };
  }, [query]);

  const popupVisible = open && query !== "";
  const searching = state.query !== query;
  const results = searching ? [] : state.results;
  const listVisible = popupVisible && results.length > 0;

  let statusText = "";
  if (popupVisible) {
    if (searching) statusText = "Searching…";
    else if (state.error) statusText = state.error;
    else if (results.length === 0) statusText = "No matching mechs.";
    else
      statusText = `${results.length} ${results.length === 1 ? "mech" : "mechs"} found.`;
  }

  useEffect(() => {
    if (active < 0) return;
    document
      .getElementById(`${baseId}-opt-${active}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active, baseId]);

  const choose = (entry: CatalogEntry) => {
    setText("");
    setOpen(false);
    setActive(-1);
    setState(IDLE);
    onSelect(entry);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!popupVisible) {
        setOpen(true);
        return;
      }
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((cur) =>
        cur < 0
          ? step === 1
            ? 0
            : results.length - 1
          : (cur + step + results.length) % results.length,
      );
    } else if (event.key === "Home" && listVisible) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && listVisible) {
      event.preventDefault();
      setActive(results.length - 1);
    } else if (event.key === "Enter") {
      // Never submit the enclosing character form from this field.
      event.preventDefault();
      const entry = listVisible ? results[active] : undefined;
      if (entry) choose(entry);
    } else if (event.key === "Escape" && popupVisible) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="relative">
      <label
        htmlFor={`${baseId}-input`}
        className="font-mono text-xs uppercase tracking-widest text-hud-muted"
      >
        Search predefined mechs
      </label>
      <input
        id={`${baseId}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={listVisible}
        aria-controls={listVisible ? listboxId : undefined}
        aria-activedescendant={
          listVisible && active >= 0 ? `${baseId}-opt-${active}` : undefined
        }
        placeholder="e.g. Firestarter, Atlas AS7-D"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={cn(hudInput, "mt-1")}
      />
      {listVisible && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Predefined mechs"
          className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-auto rounded-md border border-hud-line bg-hud-raised py-1 shadow-xl shadow-black/50"
        >
          {results.map((entry, i) => (
            <li
              key={entry.fileName}
              id={`${baseId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              // Keep focus in the input so the popup doesn't close before click.
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(entry)}
              className={cn(
                "cursor-pointer px-3 py-2",
                i === active && "bg-hud-amber/10",
              )}
            >
              <span className="block text-sm text-hud-text">
                {entry.definitionName}
              </span>
              <span className="block font-mono text-xs text-hud-muted">
                {describeEntry(entry)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "mt-1 font-mono text-xs",
          state.error && !searching ? "text-hud-red" : "text-hud-muted",
          // The count line is for assistive tech; only show problems/progress.
          listVisible && "sr-only",
          !popupVisible && "sr-only",
        )}
      >
        {statusText}
      </div>
    </div>
  );
}
