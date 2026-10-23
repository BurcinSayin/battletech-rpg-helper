"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestPasswordReset } from "@/app/(auth)/actions";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/lib/auth/schema";
import { cn } from "@/lib/utils";
import { Field } from "./field";

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (result?.error) {
        setServerError(result.error);
      } else {
        setIsSubmitted(true);
      }
    });
  });

  if (isSubmitted) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-medium">Check your email</p>
          <p className="mt-1 text-green-800">
            If an account exists with that email, a password reset link has
            been sent. Please follow the instructions in the email to reset your
            password.
          </p>
        </div>
        <Link
          href="/login"
          className="rounded-md bg-foreground px-4 py-2 text-center text-sm font-medium text-background"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        registration={register("email")}
        error={errors.email?.message}
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
        {isPending ? "Sending reset link…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-foreground/70">
        Remember your password?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

