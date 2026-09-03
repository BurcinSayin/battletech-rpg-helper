"use client";

import { useEffect, useRef } from "react";
import { HudButton } from "./ui";

/**
 * Shown when a save hits PT409 (someone else — e.g. the GM — saved a newer
 * version). Non-destructive: the user chooses to reload the remote version or keep
 * editing. No field-level merge in the MVP (PLAN.md "Concurrency UX").
 *
 * The buttons are `type="button"` because the dialog renders inside the editor
 * `<form>` — a default submit button here would fire another stale save (which
 * conflicts again). Focus and Escape both land on "Keep editing" so a stray
 * keypress can never discard unsaved edits.
 */
export function ConflictDialog({
  onReload,
  onKeepEditing,
}: {
  onReload: () => void;
  onKeepEditing: () => void;
}) {
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepEditingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onKeepEditing();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeepEditing]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-sm rounded-lg border border-hud-line bg-hud-panel p-5">
        <h2 id="conflict-title" className="text-lg font-semibold text-hud-text">
          Remote changes
        </h2>
        <p className="mt-2 text-sm text-hud-muted">
          This character was updated elsewhere since you opened it. Reloading
          discards your unsaved edits and shows the saved version. Keeping editing
          preserves them, but saving will keep conflicting with the newer version
          until you reload.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <HudButton
            ref={keepEditingRef}
            type="button"
            variant="ghost"
            onClick={onKeepEditing}
          >
            Keep editing
          </HudButton>
          <HudButton type="button" variant="primary" onClick={onReload}>
            Reload
          </HudButton>
        </div>
      </div>
    </div>
  );
}
