import { HudButton } from "./ui";

/**
 * Shown when a save hits PT409 (someone else — e.g. the GM — saved a newer
 * version). Non-destructive: the user chooses to reload the remote version or keep
 * editing. No field-level merge in the MVP (PLAN.md "Concurrency UX").
 */
export function ConflictDialog({
  onReload,
  onKeepEditing,
}: {
  onReload: () => void;
  onKeepEditing: () => void;
}) {
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
          This character was updated elsewhere since you opened it. Reload the latest
          version (your unsaved edits will be discarded) or keep editing to copy them
          over first.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <HudButton variant="ghost" onClick={onKeepEditing}>
            Keep editing
          </HudButton>
          <HudButton variant="primary" onClick={onReload}>
            Reload
          </HudButton>
        </div>
      </div>
    </div>
  );
}
