import { describe, expect, it } from "vitest";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schema";

describe("signInSchema", () => {
  it("accepts a valid email and password", () => {
    expect(
      signInSchema.safeParse({ email: "pilot@example.com", password: "secret" })
        .success,
    ).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(
      signInSchema.safeParse({ email: "not-an-email", password: "secret" })
        .success,
    ).toBe(false);
  });

  it("rejects a password shorter than 6 characters", () => {
    expect(
      signInSchema.safeParse({ email: "pilot@example.com", password: "12345" })
        .success,
    ).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("accepts input with an optional display name", () => {
    expect(
      signUpSchema.safeParse({
        email: "pilot@example.com",
        password: "secret",
        displayName: "Lisa",
      }).success,
    ).toBe(true);
  });

  it("accepts input without a display name", () => {
    expect(
      signUpSchema.safeParse({
        email: "pilot@example.com",
        password: "secret",
      }).success,
    ).toBe(true);
  });

  it("rejects a short password", () => {
    expect(
      signUpSchema.safeParse({ email: "pilot@example.com", password: "no" })
        .success,
    ).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "pilot@example.com" }).success,
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      forgotPasswordSchema.safeParse({ email: "not-an-email" }).success,
    ).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts matching passwords of valid length", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "newsecret123",
        confirmPassword: "newsecret123",
      }).success,
    ).toBe(true);
  });

  it("rejects when passwords do not match", () => {
    const res = resetPasswordSchema.safeParse({
      password: "newsecret123",
      confirmPassword: "differentsecret",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("Passwords do not match");
      expect(res.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });

  it("rejects password shorter than 6 characters", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "12345",
        confirmPassword: "12345",
      }).success,
    ).toBe(false);
  });
});
