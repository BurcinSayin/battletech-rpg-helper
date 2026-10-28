import { describe, expect, it } from "vitest";
import { resolveMechWeaponReference } from "./weapon-reference";

function matched(name: string, techBase = "Inner Sphere") {
  const result = resolveMechWeaponReference(name, techBase);
  expect(result.status).toBe("matched");
  if (result.status !== "matched")
    throw new Error(`Expected match for ${name}`);
  return result.reference;
}

describe("resolveMechWeaponReference", () => {
  it.each([
    ["Inner Sphere", "(IS) ER Large Laser", [8, 8, 8], [0, 7, 14, 19]],
    ["Clan", "(CL) ER Large Laser", [10, 10, 10], [0, 8, 15, 25]],
  ])(
    "uses declared %s technology for bare names",
    (techBase, id, damage, ranges) => {
      expect(matched("ER Large Laser", techBase)).toMatchObject({
        id,
        heat: 12,
        damage,
        ranges,
      });
    },
  );

  it.each(["Mixed (IS Chassis)", "Mixed", "", "unknown"])(
    "does not infer a preference from %j",
    (techBase) => {
      expect(resolveMechWeaponReference("ER Large Laser", techBase)).toEqual({
        status: "ambiguous",
      });
    },
  );

  it("honors explicit identities regardless of declared technology and normalizes case/whitespace", () => {
    expect(matched("  (cl)  ER LARGE Laser  ").id).toBe("(CL) ER Large Laser");
    expect(matched("ER Large Laser", "  cLaN ").techBase).toBe("CL");
  });

  it("keeps duplicate MegaMek identifiers ambiguous while distinguishing canonical variants", () => {
    for (const techBase of ["Inner Sphere", "Clan", "Mixed"]) {
      expect(resolveMechWeaponReference("ISMediumLaser", techBase)).toEqual({
        status: "ambiguous",
      });
      expect(resolveMechWeaponReference("IS Medium Laser", techBase)).toEqual({
        status: "ambiguous",
      });
    }
    expect(matched("(IS) Medium Laser").heat).toBe(3);
    expect(matched("(IS) Prototype Medium Laser").heat).toBe(5);
  });

  it.each(["", " (OS)", " (iOS)"])(
    "preserves launcher variant suffix %j",
    (suffix) => {
      expect(matched(`LRM 20${suffix}`)).toMatchObject({
        id: `(IS) LRM-20${suffix}`,
        damage: [1, 1, 1],
        ranges: [6, 7, 14, 21],
        isCluster: true,
      });
    },
  );

  it("strips a quantity and rear marker without multiplying reference values", () => {
    expect(matched("2 CLERLargeLaser (r)")).toMatchObject({
      id: "(CL) ER Large Laser",
      heat: 12,
      damage: [10, 10, 10],
    });
  });

  it.each([
    "",
    "   ",
    "Custom weapon",
    "ER Large Laser extra",
    "0 CLERLargeLaser",
  ])("leaves %j unmatched", (name) => {
    expect(resolveMechWeaponReference(name, "Inner Sphere")).toEqual({
      status: "unmatched",
    });
  });

  it("retains zero heat/minimum and range-dependent damage", () => {
    expect(matched("(IS) Machine Gun")).toMatchObject({
      heat: 0,
      ranges: [0, 1, 2, 3],
    });
    expect(matched("(IS) Heavy Gauss Rifle").damage).toEqual([25, 20, 10]);
  });

  it("matches slash and hyphen spellings without dropping parentheses", () => {
    expect(matched("AC/20").id).toBe("(IS) Autocannon/20");
    expect(
      resolveMechWeaponReference("LRM 20 (custom)", "Inner Sphere"),
    ).toEqual({ status: "unmatched" });
  });
});
