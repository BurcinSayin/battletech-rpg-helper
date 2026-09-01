// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppHeader } from "./app-header";

// AppHeader imports a server action; stub it so nothing server-only loads in jsdom
// (same technique as app/(app)/characters/import/import-client.test.tsx:14-16).
vi.mock("@/app/(auth)/actions", () => ({ signOut: vi.fn() }));

describe("AppHeader", () => {
  it("links to the campaigns index (AC 4)", () => {
    render(<AppHeader email="pilot@example.com" />);
    expect(screen.getByRole("link", { name: "Campaigns" }).getAttribute("href")).toBe(
      "/campaigns",
    );
  });

  it("still links home and shows the signed-in email", () => {
    render(<AppHeader email="pilot@example.com" />);
    expect(
      screen.getByRole("link", { name: "BattleTech RPG Helper" }).getAttribute("href"),
    ).toBe("/dashboard");
    expect(screen.getByText("pilot@example.com")).toBeTruthy();
  });
});
