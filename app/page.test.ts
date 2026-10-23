import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));

import Home from "./page";

describe("Home", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves a recovery code returned to the Site URL", async () => {
    await expect(
      Home({ searchParams: Promise.resolve({ code: "recovery-code" }) }),
    ).rejects.toMatchObject({
      path: "/auth/callback?code=recovery-code",
    });
  });

  it("encodes the code and does not forward a supplied redirect destination", async () => {
    await expect(
      Home({
        searchParams: Promise.resolve({
          code: "recovery&next=//attacker.com",
          next: "//attacker.com",
        }),
      }),
    ).rejects.toMatchObject({
      path: "/auth/callback?code=recovery%26next%3D%2F%2Fattacker.com",
    });
  });

  it.each([undefined, "", ["one", "two"]])(
    "keeps normal dashboard navigation for missing or ambiguous codes (%j)",
    async (code) => {
      await expect(
        Home({ searchParams: Promise.resolve({ code }) }),
      ).rejects.toMatchObject({ path: "/dashboard" });
    },
  );
});
