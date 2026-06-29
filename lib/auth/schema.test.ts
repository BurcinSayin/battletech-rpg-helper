import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "./schema";

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
