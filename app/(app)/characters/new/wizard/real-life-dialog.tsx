"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HudButton } from "@/components/characters/ui";
import type { AdultChoice, AdultChoiceSelection } from "@/lib/characters";
import { ChoiceSelect } from "./choice-select";

export function RealLifeDialog({
  name,
  choices,
  onAccept,
  onCancel,
}: {
  readonly name: string;
  readonly choices: readonly AdultChoice[];
  readonly onAccept: (selection: AdultChoiceSelection) => void;
  readonly onCancel: () => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  // S4AdvDialInit selects the first candidate in each slot. Extra repeat
  // positions stay optional until chosen, like the desktop Add buttons.
  const [selection, setSelection] = useState<AdultChoiceSelection>(() =>
    Object.fromEntries(
      choices
        .filter((choice) => choice.id.endsWith("-0"))
        .map((choice) => [choice.id, choice.candidates[0]]),
    ),
  );
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg border border-hud-line bg-hud-panel p-5 text-hud-text backdrop:bg-black/60"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {name} — Advanced choices
      </h2>
      <p className="my-3 text-sm text-hud-muted">
        Choose grants for this module. Reopening clears its previous advanced
        grants. Cancel leaves those grants unapplied. Repeated choices may use
        the same option.
      </p>
      <div className="flex flex-col gap-3">
        {choices.map((choice, index) => (
          <ChoiceSelect
            key={choice.id}
            id={`${id}-${choice.id}`}
            label={`${choice.label} — choice ${index + 1}`}
            description={`${choice.xp} XP`}
            value={
              selection[choice.id] ? JSON.stringify(selection[choice.id]) : ""
            }
            options={choice.candidates.map((candidate) => ({
              value: JSON.stringify(candidate),
              label: `${candidate.value} (${candidate.kind})`,
            }))}
            onChange={(value) =>
              setSelection((current) => {
                const next = { ...current };
                const candidate = choice.candidates.find(
                  (entry) => JSON.stringify(entry) === value,
                );
                if (candidate) next[choice.id] = candidate;
                else delete next[choice.id];
                return next;
              })
            }
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <HudButton variant="ghost" onClick={onCancel}>
          Cancel advanced choices
        </HudButton>
        <HudButton variant="primary" onClick={() => onAccept(selection)}>
          Apply advanced choices
        </HudButton>
      </div>
    </dialog>
  );
}
