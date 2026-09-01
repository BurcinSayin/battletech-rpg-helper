import { describe, expect, it } from "vitest";
import { createCampaignSchema, joinCampaignSchema } from "./schema";

describe("createCampaignSchema", () => {
  it("accepts a name at the DB's 1 and 100 char bounds", () => {
    expect(createCampaignSchema.safeParse({ name: "A" }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ name: "x".repeat(100) }).success).toBe(true);
  });

  it("rejects empty and over-long names", () => {
    expect(createCampaignSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });
});

describe("joinCampaignSchema", () => {
  it("normalizes a lower-case code to upper case", () => {
    const parsed = joinCampaignSchema.parse({ inviteCode: "a1b2c3d4" });
    expect(parsed.inviteCode).toBe("A1B2C3D4");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(joinCampaignSchema.parse({ inviteCode: "  A1B2C3D4  " }).inviteCode).toBe("A1B2C3D4");
  });

  it("rejects a 7-character code and a non-hex code", () => {
    expect(joinCampaignSchema.safeParse({ inviteCode: "A1B2C3D" }).success).toBe(false);
    expect(joinCampaignSchema.safeParse({ inviteCode: "A1B2C3DZ" }).success).toBe(false);
  });
});
