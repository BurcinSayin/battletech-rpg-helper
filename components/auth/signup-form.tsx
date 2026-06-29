"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signUp } from "@/app/(auth)/actions";
import { signUpSchema, type SignUpValues } from "@/lib/auth/schema";
import { cn } from "@/lib/utils";
import { Field } from "./field";

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signUp(values);
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        id="displayName"
        label={
          <>
            Display name <span className="text-foreground/50">(optional)</span>
          </>
        }
        autoComplete="nickname"
        registration={register("displayName")}
        error={errors.displayName?.message}
      />

      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        registration={register("email")}
        error={errors.email?.message}
      />

      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        registration={register("password")}
        error={errors.password?.message}
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
        {isPending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-foreground/70">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
