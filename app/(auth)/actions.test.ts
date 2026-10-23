import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, redirect, headers } = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
  headers: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers }));

import {
  requestPasswordReset,
  updatePassword,
} from "./actions";

describe("requestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headers.mockResolvedValue(
      new Headers({
        origin: "https://example.com",
      }),
    );
  });

  it("returns an error on malformed email", async () => {
    const res = await requestPasswordReset({ email: "invalid-email" });
    expect(res).toEqual({ error: "Please enter a valid email address." });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("calls resetPasswordForEmail and returns success", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      auth: { resetPasswordForEmail },
    });

    const res = await requestPasswordReset({ email: "pilot@example.com" });
    expect(res).toEqual({ success: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("pilot@example.com", {
      redirectTo: "https://example.com/auth/callback?next=/reset-password",
    });
  });

  it("falls back to x-forwarded headers when origin is missing", async () => {
    headers.mockResolvedValue(
      new Headers({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "auth.example.com",
      }),
    );
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      auth: { resetPasswordForEmail },
    });

    const res = await requestPasswordReset({ email: "pilot@example.com" });
    expect(res).toEqual({ success: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("pilot@example.com", {
      redirectTo: "https://auth.example.com/auth/callback?next=/reset-password",
    });
  });

  it("returns anti-enumeration success even if user not found", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({
      error: { code: "user_not_found", message: "User not found" },
    });
    createClient.mockResolvedValue({
      auth: { resetPasswordForEmail },
    });

    const res = await requestPasswordReset({ email: "nonexistent@example.com" });
    expect(res).toEqual({ success: true });
  });

  it("returns rate limit error when over rate limit", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({
      error: {
        code: "over_email_send_rate_limit",
        message: "Email rate limit exceeded",
      },
    });
    createClient.mockResolvedValue({
      auth: { resetPasswordForEmail },
    });

    const res = await requestPasswordReset({ email: "pilot@example.com" });
    expect(res).toEqual({ error: "Too many attempts. Please try again later." });
  });
});

describe("updatePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error if passwords do not match", async () => {
    const res = await updatePassword({
      password: "newsecret123",
      confirmPassword: "differentsecret",
    });
    expect(res).toEqual({ error: "Passwords do not match" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("updates user password, signs out session, and redirects to login", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      auth: { updateUser, signOut },
    });

    await expect(
      updatePassword({
        password: "newsecret123",
        confirmPassword: "newsecret123",
      }),
    ).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
      path: "/login?notice=password-reset-success",
    });

    expect(updateUser).toHaveBeenCalledWith({ password: "newsecret123" });
    expect(signOut).toHaveBeenCalled();
  });

  it("handles weak_password error", async () => {
    const updateUser = vi.fn().mockResolvedValue({
      error: { code: "weak_password", message: "Password is too weak" },
    });
    const signOut = vi.fn();
    createClient.mockResolvedValue({
      auth: { updateUser, signOut },
    });

    const res = await updatePassword({
      password: "newsecret123",
      confirmPassword: "newsecret123",
    });

    expect(res).toEqual({ error: "Please choose a stronger password." });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("handles general error with fallback message", async () => {
    const updateUser = vi.fn().mockResolvedValue({
      error: { code: "session_expired", message: "Session expired" },
    });
    const signOut = vi.fn();
    createClient.mockResolvedValue({
      auth: { updateUser, signOut },
    });

    const res = await updatePassword({
      password: "newsecret123",
      confirmPassword: "newsecret123",
    });

    expect(res).toEqual({
      error: "Could not update password. Please try again.",
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});

