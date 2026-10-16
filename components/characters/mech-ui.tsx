"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HudButton, hudInput } from "./ui";

/** Short codes for the known critical-slot sections (used in accessible names). */
const SLOT_ABBREVIATIONS: Record<string, string> = {
  "Left Arm": "LA",
  "Right Arm": "RA",
  "Left Torso": "LT",
  "Right Torso": "RT",
  "Center Torso": "CT",
  Head: "HD",
  "Left Leg": "LL",
  "Right Leg": "RL",
  "Front Left Leg": "FLL",
  "Front Right Leg": "FRL",
  "Rear Left Leg": "RLL",
  "Rear Right Leg": "RRL",
  "Center Leg": "CL",
};

export function slotAbbreviation(location: string): string {
  return SLOT_ABBREVIATIONS[location] ?? location;
}

export const smallButton =
  "h-8 min-w-8 shrink-0 rounded border border-hud-line px-2 text-xs text-hud-muted transition hover:border-hud-amber hover:text-hud-amber disabled:opacity-40 disabled:hover:border-hud-line disabled:hover:text-hud-muted";

export const dangerSmallButton =
  "h-8 min-w-8 shrink-0 rounded border border-hud-line px-2 text-xs text-hud-muted transition hover:border-hud-red hover:text-hud-red disabled:opacity-40";

/** Collapsible `// GROUP` section. Content stays mounted while collapsed. */
export function Group({
  title,
  meta,
  defaultOpen = true,
  children,
}: {
  title: string;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-hud-line bg-hud-panel"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-hud-muted">
          {`// ${title}`}
        </h3>
        <span className="flex items-center gap-3 font-mono text-xs text-hud-muted">
          {meta}
          <span
            aria-hidden="true"
            className="transition group-open:rotate-90 group-open:text-hud-amber"
          >
            ▸
          </span>
        </span>
      </summary>
      <div className="border-t border-hud-line p-4">{children}</div>
    </details>
  );
}

export function TextField({
  label,
  value,
  onChange,
  maxLength,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="font-mono text-xs uppercase tracking-widest text-hud-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={cn(hudInput, "mt-1")}
      />
    </label>
  );
}

/** Clamp typed text into a whole number in 0..max; blank/NaN becomes 0. */
export function coerceWhole(raw: string, max: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, n));
}

/**
 * Whole-number input that tolerates blank/partial text while typing. The parent
 * always receives a valid in-range number; the typed text is only kept for
 * display while it still matches the committed value, and snaps back on blur.
 */
export function NumberField({
  label,
  value,
  max,
  onChange,
  hideLabel,
  className,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
  /** Use `label` only as the accessible name (a visible caption is supplied elsewhere). */
  hideLabel?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    draft !== null && coerceWhole(draft, max) === value ? draft : String(value);

  const input = (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      step={1}
      value={shown}
      aria-label={hideLabel ? label : undefined}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(coerceWhole(e.target.value, max));
      }}
      onBlur={() => setDraft(null)}
      className={cn(hudInput, "font-mono", !hideLabel && "mt-1")}
    />
  );

  if (hideLabel) return <div className={className}>{input}</div>;
  return (
    <label className={cn("block", className)}>
      <span className="font-mono text-xs uppercase tracking-widest text-hud-muted">
        {label}
      </span>
      {input}
    </label>
  );
}

/**
 * Modal confirmation. The editor renders inside a `<form>`, so every button is
 * `type="button"`. Focus lands on Cancel and Escape cancels, so a stray key
 * never discards the draft.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      } else if (event.key === "Tab") {
        // Two-button focus loop keeps keyboard users inside the dialog.
        const next =
          document.activeElement === cancelRef.current
            ? confirmRef.current
            : cancelRef.current;
        event.preventDefault();
        next?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-sm rounded-lg border border-hud-line bg-hud-panel p-5">
        <h2 id={titleId} className="text-lg font-semibold text-hud-text">
          {title}
        </h2>
        <div className="mt-2 text-sm text-hud-muted">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <HudButton
            ref={cancelRef}
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            Cancel
          </HudButton>
          <HudButton
            ref={confirmRef}
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
          >
            {confirmLabel}
          </HudButton>
        </div>
      </div>
    </div>
  );
}
