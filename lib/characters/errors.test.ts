import { describe, expect, it } from "vitest";
import { classifyUpdateError } from "./errors";

describe("classifyUpdateError", () => {
  it("maps PT409 to a version conflict", () => {
    expect(
      classifyUpdateError({
        code: "PT409",
        message: "character version conflict",
      }),
    ).toBe("conflict");
  });

  it("maps PT403 to forbidden", () => {
    expect(classifyUpdateError({ code: "PT403" })).toBe("forbidden");
  });

  it("maps PT422 code and message to invalid", () => {
    expect(classifyUpdateError({ code: "PT422" })).toBe("invalid");
    expect(classifyUpdateError({ message: "raised PT422 here" })).toBe(
      "invalid",
    );
    expect(classifyUpdateError({ code: "PT409", message: "PT422" })).toBe(
      "conflict",
    );
  });

  it("falls back to inspecting the message", () => {
    expect(
      classifyUpdateError({ code: null, message: "raised PT409 here" }),
    ).toBe("conflict");
  });

  it("returns unknown for unrelated or missing errors", () => {
    expect(classifyUpdateError({ code: "23505", message: "duplicate" })).toBe(
      "unknown",
    );
    expect(classifyUpdateError(null)).toBe("unknown");
    expect(classifyUpdateError(undefined)).toBe("unknown");
  });
});
