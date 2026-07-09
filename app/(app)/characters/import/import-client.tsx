"use client";

import { useRef, useState, useTransition } from "react";
import { parseBtcc } from "@/lib/btcc";
import type { BtccDraft } from "@/lib/btcc/types";
import {
  catalogWarnings,
  computeXp,
  prepareImport,
  type CatalogWarnings,
} from "@/lib/characters";
import { CharacterSheet } from "@/components/characters/character-sheet";
import { HudButton } from "@/components/characters/ui";
import { cn } from "@/lib/utils";
import { importCharacter } from "@/app/(app)/characters/actions";

type Parsed = { text: string; draft: BtccDraft; fileName: string };

const NOT_A_CHARACTER =
  "That file doesn't look like a BattleTech character. Choose a .btcc file exported from the desktop app.";

/** Explicit list of skill/trait names not found in the static rules catalog. */
function NotInCatalog({ warnings }: { warnings: CatalogWarnings }) {
  const total = warnings.skills.length + warnings.traits.length;
  if (total === 0) return null;
  return (
    <div className="rounded-md border border-hud-amber/40 bg-hud-amber/10 p-3 text-sm">
      <p className="font-medium text-hud-amber">
        ⚠ {total} name{total === 1 ? "" : "s"} not in the rules catalog
      </p>
      <p className="mt-1 text-hud-muted">
        Kept as-is, not rejected — they still import.
      </p>
      {warnings.skills.length > 0 && (
        <p className="mt-2 text-hud-text">
          <span className="text-hud-muted">Skills: </span>
          {warnings.skills.join(", ")}
        </p>
      )}
      {warnings.traits.length > 0 && (
        <p className="mt-1 text-hud-text">
          <span className="text-hud-muted">Traits: </span>
          {warnings.traits.join(", ")}
        </p>
      )}
    </div>
  );
}

export function ImportClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setError(null);
    const text = await file.text();
    const prepared = prepareImport(parseBtcc(text));
    if (!prepared.ok) {
      setParsed(null);
      setError(NOT_A_CHARACTER);
      return;
    }
    setParsed({ text, draft: prepared.draft, fileName: file.name });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so re-selecting the same file fires onChange again.
    e.target.value = "";
  }

  function onCancel() {
    setParsed(null);
    setError(null);
  }

  function onImport() {
    if (!parsed) return;
    setError(null);
    startTransition(async () => {
      // Resolves only on failure — success redirects into the new character.
      const result = await importCharacter(parsed.text);
      setError(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-hud-text">Import .btcc character</h1>
        <p className="mt-1 text-sm text-hud-muted">
          Upload a BattleTech desktop (.btcc) file to add it as a new pilot.
        </p>
      </header>

      {parsed ? (
        <div className="flex flex-col gap-4">
          <p className="font-mono text-xs uppercase tracking-widest text-hud-muted">
            Previewing {parsed.fileName}
          </p>
          <NotInCatalog warnings={catalogWarnings(parsed.draft)} />
          <CharacterSheet
            draft={parsed.draft}
            xp={computeXp(parsed.draft)}
            warnings={{ skills: [], traits: [] }}
            actions={
              <div className="flex items-center gap-2">
                <HudButton variant="ghost" onClick={onCancel} disabled={isPending}>
                  Cancel
                </HudButton>
                <HudButton variant="primary" onClick={onImport} disabled={isPending}>
                  {isPending ? "Importing…" : "Import character"}
                </HudButton>
              </div>
            }
          />
          {error && <p className="text-sm text-hud-red">{error}</p>}
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center transition",
              dragging
                ? "border-hud-amber bg-hud-amber/5"
                : "border-hud-line hover:border-hud-muted",
            )}
          >
            <span className="text-2xl text-hud-amber" aria-hidden>
              ⬆
            </span>
            <span className="text-sm text-hud-text">
              Drop a .btcc file here, or click to browse
            </span>
            <span className="font-mono text-xs uppercase tracking-widest text-hud-muted">
              .btcc
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".btcc"
            onChange={onSelect}
            className="hidden"
            aria-label="Upload .btcc file"
          />
          {error && <p className="mt-3 text-sm text-hud-red">{error}</p>}
        </div>
      )}
    </div>
  );
}
