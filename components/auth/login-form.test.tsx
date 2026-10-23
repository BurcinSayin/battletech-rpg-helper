// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LoginForm } from "./login-form";

vi.mock("@/app/(auth)/actions", () => ({
  signIn: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  it("renders a link to forgot password", () => {
    render(<LoginForm />);

    const forgotLink = screen.getByRole("link", { name: "Forgot password?" });
    expect(forgotLink).toBeTruthy();
    expect(forgotLink.getAttribute("href")).toBe("/forgot-password");
  });
});
