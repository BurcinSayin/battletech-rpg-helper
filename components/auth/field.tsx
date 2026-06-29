import type { ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

export const fieldClass =
  "w-full rounded-md border border-foreground/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/60";

type FieldProps = {
  id: string;
  label: ReactNode;
  registration: UseFormRegisterReturn;
  type?: string;
  autoComplete?: string;
  error?: string;
};

export function Field({
  id,
  label,
  registration,
  type = "text",
  autoComplete,
  error,
}: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        className={fieldClass}
        {...registration}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
