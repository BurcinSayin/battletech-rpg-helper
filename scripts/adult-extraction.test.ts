import { describe, expect, it } from "vitest";
import { emptyDraft } from "../lib/btcc";
import { resolveAdultModule } from "../lib/characters/adult";
import { adultModuleSchema } from "../lib/validation/adult";
import { parseDispatchFunction } from "./extract-rules-lib";
import { buildModulesFile } from "./extract-rules";

describe("adult source semantics", () => {
  it.each([
    ["Major Periphery State", "Military School", { WIL: 57, EDG: 40 }],
    ["Invading Clan", "Military School", { WIL: 27, EDG: 90 }],
    ["Major Periphery State", "Back Woods", { WIL: 12, EDG: 40 }],
  ])(
    "replays nested branches, overwrites, and increments for %s / %s",
    (aff, latechild, expected) => {
      const source = `void Stage3::S3SchoolChange(QString school) {
      if (school == "Order fixture") {
        s3Attr["WIL"] = 10;
        if (lateVar == "Military School") {
          s3Attr["WIL"] = 50;
          if (affVar == "Major Periphery State") {
            s3Attr["WIL"] += 5;
          } else {
            s3Attr["WIL"] = 25;
          }
          s3Attr["EDG"] = 30;
        }
        s3Attr["WIL"] += 2;
        s3Attr["EDG"] = 40;
        if (affVar == "Invading Clan") {
          s3Attr["EDG"] = 90;
        }
      }
    }`;
      const [entry] = parseDispatchFunction(
        () => source,
        "stage3_resurce.cpp",
        /Stage3::S3SchoolChange\(/,
        "school",
        3,
        "school",
        {},
      );
      const draft = emptyDraft();
      draft.scalars.aff = aff;
      draft.scalars.latechild = latechild;
      const resolved = resolveAdultModule(adultModuleSchema.parse(entry), {
        draft,
        startingLanguage: "Language/English",
        militaryField: false,
        clanFields: [],
      });
      expect(resolved.attrDeltas).toEqual(expected);
    },
  );

  it("normalizes the desktop's integer field members in the generated catalog", () => {
    const schools = buildModulesFile().modules.filter(
      (entry) => entry.kind === "school",
    );
    for (const school of schools) {
      expect(adultModuleSchema.safeParse(school).success).toBe(true);
      for (const field of Object.values(school.fields ?? {}))
        if (field?.age !== null && field?.age !== undefined)
          expect(Number.isInteger(field.age)).toBe(true);
    }
    for (const name of ["Family Training", "Military Enlistment"]) {
      const school = schools.find((entry) => entry.name === name)!;
      expect(school.fields?.basic?.age).toBe(0);
      expect(school.fields?.advanced?.age).toBe(1);
      expect(
        adultModuleSchema.safeParse({
          ...school,
          fields: {
            ...school.fields,
            basic: { ...school.fields?.basic, age: 0.5 },
          },
        }).success,
      ).toBe(false);
    }
  });
});
