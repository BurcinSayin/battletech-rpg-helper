// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ForgotPasswordForm } from "./forgot-password-form";

const { requestPasswordReset } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock("@/app/(auth)/actions", () => ({
  requestPasswordReset,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ForgotPasswordForm", () => {
  it("renders email field and back to sign in link", () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeTruthy();
    const signinLink = screen.getByRole("link", { name: "Sign in" });
    expect(signinLink.getAttribute("href")).toBe("/login");
  });

  it("shows validation error on invalid email", async () => {
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "invalid-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email address")).toBeTruthy();
    });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("shows success confirmation state on successful submit", async () => {
    requestPasswordReset.mockResolvedValue({ success: true });
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "pilot@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeTruthy();
    });
    expect(
      screen.getByText(/If an account exists with that email/),
    ).toBeTruthy();
    const backLink = screen.getByRole("link", { name: "Back to sign in" });
    expect(backLink.getAttribute("href")).toBe("/login");
  });

  it("displays server error when requestPasswordReset returns an error", async () => {
    requestPasswordReset.mockResolvedValue({
      error: "Too many attempts. Please try again later.",
    });
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "pilot@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(
        screen.getByText("Too many attempts. Please try again later."),
      ).toBeTruthy();
    });
  });
});

