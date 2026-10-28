import { describe, expect, it } from "vitest";
import { buildMechWeaponCatalog } from "./parse-mech-weapons";

function entry(LookupName = "(IS) Medium Laser") {
  return {
    LookupName,
    ActualName: "Medium Laser",
    CritName: "Medium Laser",
    ChatName: "ML",
    MegaMekName: "ISMediumLaser",
    IsCluster: false,
    Heat: 3,
    DamSht: 5,
    DamMed: 5,
    DamLng: 5,
    RngMin: 0,
    RngSht: 3,
    RngMed: 6,
    RngLng: 9,
  };
}

const stats = [
  "Heat",
  "DamSht",
  "DamMed",
  "DamLng",
  "RngMin",
  "RngSht",
  "RngMed",
  "RngLng",
];

describe("buildMechWeaponCatalog", () => {
  it.each(stats)(
    "rejects missing, invalid, and nonfinite %s with entry context",
    (field) => {
      for (const value of [undefined, "0", NaN, Infinity, -Infinity]) {
        expect(() =>
          buildMechWeaponCatalog({
            "(IS) Medium Laser": { ...entry(), [field]: value },
          }),
        ).toThrow(`(IS) Medium Laser.${field}`);
      }
    },
  );

  it("rejects mismatched keys rather than changing variant identity", () => {
    expect(() => buildMechWeaponCatalog({ wrong: entry() })).toThrow(
      "wrong.LookupName",
    );
  });

  it.each([{}, [], null, { "": entry("") }])(
    "rejects an invalid catalog %j",
    (raw) => {
      expect(() => buildMechWeaponCatalog(raw)).toThrow();
    },
  );

  it("rejects missing names and invalid cluster flags", () => {
    for (const field of [
      "LookupName",
      "ActualName",
      "CritName",
      "ChatName",
      "MegaMekName",
      "IsCluster",
    ]) {
      expect(() =>
        buildMechWeaponCatalog({
          "(IS) Medium Laser": { ...entry(), [field]: undefined },
        }),
      ).toThrow(`(IS) Medium Laser.${field}`);
    }
  });

  it("retains distinct variants sharing an identifier and their different heat", () => {
    const prototype = "(IS) Medium Laser (Prototype)";
    const catalog = buildMechWeaponCatalog({
      "(IS) Medium Laser": entry(),
      [prototype]: { ...entry(prototype), Heat: 5 },
    });
    expect(
      catalog.map(({ id, megaMekName, heat }) => ({ id, megaMekName, heat })),
    ).toEqual([
      { id: "(IS) Medium Laser", megaMekName: "ISMediumLaser", heat: 3 },
      { id: prototype, megaMekName: "ISMediumLaser", heat: 5 },
    ]);
  });
});
