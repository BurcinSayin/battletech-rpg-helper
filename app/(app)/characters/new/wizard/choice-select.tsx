"use client";

import { hudInput } from "@/components/characters/ui";

type SelectOption = {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
};

export function ChoiceSelect({
  id,
  label,
  value,
  options,
  disabled = false,
  description,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  readonly description?: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm text-hud-text">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className={hudInput}
        required
        disabled={disabled}
        aria-describedby={description ? `${id}-help` : undefined}
        value={options.some((option) => option.value === value) ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">Choose…</option>
        {options.map((option, index) => (
          <option
            key={`${option.value}-${index}`}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {description && (
        <p id={`${id}-help`} className="text-xs text-hud-muted">
          {description}
        </p>
      )}
    </div>
  );
}
