// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CatalogWarningBanner } from "./warnings";

afterEach(cleanup);

describe("CatalogWarningBanner", () => {
  it("renders nothing when there are no unknown names", () => {
    const { container } = render(
      <CatalogWarningBanner warnings={{ skills: [], traits: [] }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("uses the singular noun for a single unknown name", () => {
    render(
      <CatalogWarningBanner warnings={{ skills: ["MedTech"], traits: [] }} />,
    );
    expect(screen.getByText(/1 name not in catalog/)).toBeTruthy();
    expect(screen.getByText(/Kept as-is, not rejected\. MedTech/)).toBeTruthy();
  });

  it("pluralizes and joins multiple names across skills and traits", () => {
    render(
      <CatalogWarningBanner
        warnings={{ skills: ["MedTech", "Interests"], traits: ["Custom"] }}
      />,
    );
    expect(screen.getByText(/3 names not in catalog/)).toBeTruthy();
    expect(screen.getByText(/MedTech, Interests, Custom/)).toBeTruthy();
  });
});
