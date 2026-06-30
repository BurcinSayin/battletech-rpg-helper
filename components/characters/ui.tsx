import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared input styling for the dark HUD editor (mirrors auth's `fieldClass`). */
export const hudInput =
  "w-full rounded-md border border-hud-line bg-hud-raised px-3 py-2 text-sm text-hud-text outline-none transition focus:border-hud-amber/60 placeholder:text-hud-muted";

/** A `// SECTION` panel with an optional count/action in the header. */
export function Panel({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string;
  count?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-lg border border-hud-line bg-hud-panel p-4", className)}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-hud-muted">
          {`// ${title}`}
        </h2>
        <div className="flex items-center gap-3">
          {count != null && (
            <span className="font-mono text-xs text-hud-muted">{count}</span>
          )}
          {action}
        </div>
      </header>
      {children}
    </section>
  );
}

type Variant = "primary" | "ghost" | "danger";

const variantClass: Record<Variant, string> = {
  primary: "bg-hud-amber text-hud-bg hover:brightness-110",
  ghost: "border border-hud-line text-hud-text hover:border-hud-muted",
  danger: "border border-hud-red/40 text-hud-red hover:bg-hud-red/10",
};

export function HudButton({
  variant = "ghost",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "rounded-md px-3 py-2 text-xs font-medium uppercase tracking-wider transition disabled:opacity-50",
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A labelled +/- numeric stepper used for the 8 attributes. */
export function Stepper({
  label,
  value,
  onChange,
  step = 5,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div className="rounded-md border border-hud-line bg-hud-raised p-3">
      <span className="font-mono text-xs uppercase tracking-widest text-hud-muted">
        {label}
      </span>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - step))}
          className="h-7 w-7 rounded border border-hud-line text-hud-muted hover:border-hud-amber hover:text-hud-amber"
        >
          −
        </button>
        <input
          type="number"
          aria-label={label}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 bg-transparent text-center font-mono text-lg text-hud-text outline-none"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + step)}
          className="h-7 w-7 rounded border border-hud-line text-hud-muted hover:border-hud-amber hover:text-hud-amber"
        >
          +
        </button>
      </div>
    </div>
  );
}
