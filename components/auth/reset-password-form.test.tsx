// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ResetPasswordForm } from "./reset-password-form";

const { updatePassword } = vi.hoisted(() => ({
  updatePassword: vi.fn(),
}));

vi.mock("@/app/(auth)/actions", () => ({
  updatePassword,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ResetPasswordForm", () => {
  it("renders new password and confirm password inputs", () => {
    render(<ResetPasswordForm />);

    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Update password" }),
    ).toBeTruthy();
  });

  it("shows validation error when passwords do not match", async () => {
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "mismatch456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeTruthy();
    });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("shows validation error when password is too short", async () => {
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 6 characters"),
      ).toBeTruthy();
    });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("submits valid passwords to updatePassword", async () => {
    updatePassword.mockResolvedValue(undefined);
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "newsecret123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "newsecret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(updatePassword).toHaveBeenCalledWith({
        password: "newsecret123",
        confirmPassword: "newsecret123",
      });
    });
  });

  it("renders server error returned by updatePassword", async () => {
    updatePassword.mockResolvedValue({
      error: "Please choose a stronger password.",
    });
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "simple123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "simple123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => {
      expect(
        screen.getByText("Please choose a stronger password."),
      ).toBeTruthy();
    });
  });
});

