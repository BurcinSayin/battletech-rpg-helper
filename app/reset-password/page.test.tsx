import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, redirect } = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/auth/reset-password-form", () => ({
  ResetPasswordForm: () => <div data-testid="reset-form" />,
}));

import ResetPasswordPage from "./page";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to login with error param", async () => {
    createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    });

    await expect(ResetPasswordPage()).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
      path: "/login?error=invalid-reset-link",
    });
  });

  it("renders page when user session is present", async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: { id: "pilot-123" } } }),
      },
    });

    const jsx = await ResetPasswordPage();
    expect(jsx).toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});

