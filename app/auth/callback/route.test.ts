import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { GET } from "./route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login?error=invalid-reset-link when code is missing", async () => {
    const request = new NextRequest("https://example.com/auth/callback");
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/login?error=invalid-reset-link",
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("redirects to /login?error=invalid-reset-link when exchange fails", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      error: { code: "otp_expired", message: "Token has expired" },
    });
    createClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    });

    const request = new NextRequest(
      "https://example.com/auth/callback?code=bad-code",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/login?error=invalid-reset-link",
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("bad-code");
  });

  it("exchanges code for session and redirects to default /reset-password", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    });

    const request = new NextRequest(
      "https://example.com/auth/callback?code=valid-code",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/reset-password",
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
  });

  it("redirects to valid next destination if provided", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    });

    const request = new NextRequest(
      "https://example.com/auth/callback?code=valid-code&next=/dashboard",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/dashboard",
    );
  });

  it("prevents open redirect attacks by sanitizing next", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    });

    const request = new NextRequest(
      "https://example.com/auth/callback?code=valid-code&next=//attacker.com",
    );
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/reset-password",
    );
  });
});

