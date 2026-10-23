// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginPage from "./page";

vi.mock("@/components/auth/login-form", () => ({
  LoginForm: () => <div data-testid="login-form" />,
}));

describe("LoginPage", () => {
  it("renders check-email notice", async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({ notice: "check-email" }),
    });
    render(page);

    expect(
      screen.getByText(
        "Account created. Check your email to confirm your address, then sign in.",
      ),
    ).toBeTruthy();
  });

  it("renders password-reset-success notice", async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({ notice: "password-reset-success" }),
    });
    render(page);

    expect(
      screen.getByText(
        "Your password has been updated. Please sign in with your new password.",
      ),
    ).toBeTruthy();
  });

  it("renders invalid-reset-link error notice", async () => {
    const page = await LoginPage({
      searchParams: Promise.resolve({ error: "invalid-reset-link" }),
    });
    render(page);

    expect(
      screen.getByText(
        "This password reset link is invalid or has expired. Please request a new one.",
      ),
    ).toBeTruthy();
  });
});

