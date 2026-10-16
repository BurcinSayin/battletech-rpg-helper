"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { HudButton } from "./ui";

export type MechDamageBarProps = {
  /** Local damage changes differ from the stored damage. */
  pending: boolean;
  /** An Apply is in flight. */
  applying: boolean;
  /** The character changed after these damage changes were started. */
  stale: boolean;
  /** User-safe message from the last failed Apply. */
  error: string | null;
  /** "Reset all" would change something. */
  canReset: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onReset: () => void;
};

const barButton = "min-h-11 px-4";

/**
 * Status and batch actions for mech damage in view mode. Damage changes stay
 * local until Apply. When pending, the bar sticks to the bottom of its
 * container so Apply stays in thumb reach while scrolling the Mech tab. Render
 * it after `<MechView>` in the same container for that to work.
 */
export function MechDamageBar({
  pending,
  applying,
  stale,
  error,
  canReset,
  onApply,
  onDiscard,
  onReset,
}: MechDamageBarProps) {
  const statusId = useId();
  const active = pending || applying || stale || error !== null;

  let message: string;
  if (stale) {
    message =
      "This character changed since you started marking damage. These changes can't be applied. Discard them to load the latest version.";
  } else if (applying) {
    message = "Applying damage…";
  } else if (pending) {
    message =
      "Damage changes not applied yet. Apply or discard them before you can Edit.";
  } else {
    message = "Damage is up to date.";
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        active
          ? "sticky bottom-0 z-20 border-hud-amber/50 bg-hud-panel/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_-12px_rgba(0,0,0,0.9)] backdrop-blur"
          : "border-hud-line bg-hud-panel",
        stale && "border-hud-red/50",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          id={statusId}
          role="status"
          className={cn(
            "flex items-start gap-2 text-sm",
            active ? "text-hud-text" : "text-hud-muted",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
              stale
                ? "bg-hud-red"
                : pending || applying
                  ? "animate-pulse bg-hud-amber"
                  : "bg-hud-green/70",
            )}
          />
          <span>{message}</span>
        </p>
        <div
          className={cn(
            "grid gap-2 sm:flex sm:shrink-0",
            stale ? "grid-cols-2" : "grid-cols-3",
          )}
        >
          {!stale && (
            <HudButton
              type="button"
              variant="danger"
              aria-label="Reset all damage"
              className={barButton}
              disabled={!canReset || applying}
              onClick={onReset}
            >
              Reset all
            </HudButton>
          )}
          <HudButton
            type="button"
            variant="ghost"
            aria-label="Discard damage changes"
            aria-describedby={stale ? statusId : undefined}
            className={barButton}
            disabled={(!pending && !stale) || applying}
            onClick={onDiscard}
          >
            {stale ? "Discard, load latest" : "Discard"}
          </HudButton>
          <HudButton
            type="button"
            variant="primary"
            aria-label="Apply damage"
            className={barButton}
            disabled={!pending || applying || stale}
            onClick={onApply}
          >
            {applying ? "Applying…" : "Apply"}
          </HudButton>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-hud-red">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Edit-mode notice, shown above the mech editor when the base mech changed and
 * stored damage would be lost by the save (the database resets it).
 */
export function MechDamageResetWarning() {
  return (
    <div
      role="status"
      className="rounded-md border border-hud-amber/40 bg-hud-amber/10 p-3 text-sm"
    >
      <p className="font-medium text-hud-amber">
        <span aria-hidden="true">⚠ </span>Damage will reset
      </p>
      <p className="mt-1 text-hud-text">
        Saving this mech change resets its armor and structure damage, structure
        maxima, critical hits and heat. Pilot hits are kept.
      </p>
    </div>
  );
}
