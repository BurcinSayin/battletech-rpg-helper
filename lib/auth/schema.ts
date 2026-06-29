import { z } from "zod";

// Minimum password length mirrors Supabase config.toml `minimum_password_length`.
const password = z.string().min(6, "Password must be at least 6 characters");
const email = z.string().email("Enter a valid email address");

export const signInSchema = z.object({
  email,
  password,
});

export const signUpSchema = z.object({
  email,
  password,
  displayName: z
    .string()
    .trim()
    .max(60, "Display name is too long")
    .optional(),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
