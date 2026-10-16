"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  loadCatalogMech,
  type LoadCatalogMechResult,
} from "@/app/(app)/characters/[id]/mech-actions";
import type { CatalogEntry } from "@/lib/mech/catalog";
import { emptyMech } from "@/lib/mech/schema";
import type { MechData } from "@/lib/mech/types";
import { MechCatalogPicker } from "./mech-catalog-picker";
import {
  ArmorSection,
  CriticalSlotsSection,
  IdentitySection,
  StatsSection,
  UnsupportedSection,
  WeaponsSection,
} from "./mech-sections";
import { ConfirmDialog } from "./mech-ui";
import { MechView } from "./mech-view";
import { HudButton, Panel } from "./ui";

export { MechView };

export type MechTabProps = {
  /** Current mech draft; null = character has no mech. */
  value: MechData | null;
  /** Called with the next draft (null = mech removed). Never persists. */
  onChange: (next: MechData | null) => void;
  disabled?: boolean;
};

const LOAD_FAILED = "The predefined mech could not be loaded.";

/**
 * Editable mech editor (edit mode). Fully controlled and never persists: the
 * character's Save does. It renders inside the editor's `<form>`, so it uses no
 * form elements of its own, every button is `type="button"`, and Enter inside a
 * text field never submits.
 */
export function MechTab({ value, onChange, disabled }: MechTabProps) {
  const [pending, setPending] = useState<CatalogEntry | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [loading, setLoading] = useState<CatalogEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRef = useRef(0);

  // A load that finishes after unmount must not call onChange.
  useEffect(
    () => () => {
      loadRef.current++;
    },
    [],
  );

  // Always call the latest onChange when an async load completes.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const startLoad = useCallback(async (entry: CatalogEntry) => {
    const id = ++loadRef.current;
    setLoadError(null);
    setLoading(entry);
    let result: LoadCatalogMechResult;
    try {
      result = await loadCatalogMech(entry.fileName);
    } catch {
      result = { ok: false, kind: "unavailable", message: LOAD_FAILED };
    }
    // Only the latest load may touch state or the draft.
    if (id !== loadRef.current) return;
    setLoading(null);
    if (result.ok) onChangeRef.current(result.mech);
    else setLoadError(result.message || LOAD_FAILED);
  }, []);

  const select = (entry: CatalogEntry) => {
    if (value === null) void startLoad(entry);
    else setPending(entry);
  };

  const update = (patch: Partial<MechData>) => {
    if (value) onChange({ ...value, ...patch });
  };

  const locked = Boolean(disabled) || loading !== null;

  // The editor form must never submit from a text field.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
    }
  };

  const picker = (
    <div className="space-y-2">
      <MechCatalogPicker onSelect={select} />
      {loading && (
        <p role="status" className="font-mono text-xs text-hud-amber">
          Loading {loading.definitionName}…
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-hud-red">
          {loadError} You can keep editing, or add the mech manually.
        </p>
      )}
    </div>
  );

  const name = value
    ? [value.chassis, value.model].filter(Boolean).join(" ")
    : "";

  return (
    <div
      className="space-y-4"
      onKeyDown={onKeyDown}
      aria-busy={loading !== null}
    >
      <fieldset
        disabled={locked}
        className="m-0 min-w-0 space-y-4 border-0 p-0"
      >
        <legend className="sr-only">Mech</legend>

        {value === null ? (
          <Panel title="MECH">
            <p className="text-sm text-hud-text">This character has no mech.</p>
            <p className="mt-1 text-sm text-hud-muted">
              Enter one by hand, or start from a predefined mech and edit it.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-[auto_1fr] md:items-end">
              <HudButton
                type="button"
                variant="primary"
                onClick={() => onChange(emptyMech())}
              >
                Add mech manually
              </HudButton>
              {picker}
            </div>
          </Panel>
        ) : (
          <>
            <Panel
              title="MECH"
              count={name || undefined}
              action={
                <HudButton
                  type="button"
                  variant="danger"
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove mech
                </HudButton>
              }
            >
              <p className="mb-3 text-sm text-hud-muted">
                Edits are kept with the character. Save the character to store
                them.
              </p>
              <div className="lg:max-w-xl">{picker}</div>
            </Panel>

            <IdentitySection mech={value} update={update} />
            <StatsSection mech={value} update={update} />
            <ArmorSection mech={value} update={update} />
            <WeaponsSection mech={value} update={update} />
            <CriticalSlotsSection mech={value} update={update} />
            <UnsupportedSection mech={value} update={update} />
          </>
        )}
      </fieldset>

      {pending && (
        <ConfirmDialog
          title="Replace current mech draft?"
          confirmLabel="Replace"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const entry = pending;
            setPending(null);
            void startLoad(entry);
          }}
        >
          Loading {pending.definitionName} replaces the current mech, including
          any unsaved edits to it. Nothing is stored until you save the
          character.
        </ConfirmDialog>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remove this mech?"
          confirmLabel="Remove"
          confirmVariant="danger"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setConfirmRemove(false);
            setLoadError(null);
            onChange(null);
          }}
        >
          The mech, including any unsaved edits to it, is removed from this
          character when you save.
        </ConfirmDialog>
      )}
    </div>
  );
}
