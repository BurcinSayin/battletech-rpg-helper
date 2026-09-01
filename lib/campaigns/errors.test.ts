import { describe, expect, it } from "vitest";
import { classifyJoinError } from "./errors";

describe("classifyJoinError", () => {
  it("maps the PT404 code to not-found", () => {
    expect(classifyJoinError({ code: "PT404", message: "invalid invite code" })).toBe("not-found");
  });

  it("falls back to the message when only it carries the code", () => {
    expect(classifyJoinError({ message: "… PT404 …" })).toBe("not-found");
  });

  it("treats an unrelated code as unknown", () => {
    expect(classifyJoinError({ code: "23505", message: "duplicate key" })).toBe("unknown");
  });

  it("treats null and undefined as unknown", () => {
    expect(classifyJoinError(null)).toBe("unknown");
    expect(classifyJoinError(undefined)).toBe("unknown");
  });
});
