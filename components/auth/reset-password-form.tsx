"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updatePassword } from "@/app/(auth)/actions";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "@/lib/auth/schema";
import { cn } from "@/lib/utils";
import { Field } from "./field";

export function ResetPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        registration={register("password")}
        error={errors.password?.message}
      />

      <Field
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        registration={register("confirmPassword")}
        error={errors.confirmPassword?.message}
      />

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background",
          "disabled:opacity-60",
        )}
      >
        {isPending ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}

