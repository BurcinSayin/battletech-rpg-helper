import { HudButton } from "./ui";

/**
 * Non-destructive notice that the character changed elsewhere while the user is
 * editing. Deliberately NOT `conflict-dialog.tsx`, which is `aria-modal` over a
 * full-screen scrim: this sits in normal flow, interrupts nothing, and leaves the
 * form untouched. Realtime is the early warning; PT409 → ConflictDialog remains
 * the backstop.
 */
export function RemoteChangeBanner({
  onReload,
  onDismiss,
}: {
  onReload: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hud-amber/40 bg-hud-amber/10 p-3 text-sm"
    >
      <p className="text-hud-text">
        <span className="text-hud-amber">⚠</span> This character was updated
        elsewhere.
      </p>
      <div className="flex gap-2">
        <HudButton type="button" variant="ghost" onClick={onDismiss}>
          Dismiss
        </HudButton>
        <HudButton type="button" variant="primary" onClick={onReload}>
          Reload
        </HudButton>
      </div>
    </div>
  );
}
