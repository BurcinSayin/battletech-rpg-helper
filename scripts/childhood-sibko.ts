import type {
  FlexPolicy,
  SibkoBranch,
  SibkoPool,
} from "../lib/rules/childhood-contract";
import type { Stage0Source } from "../lib/rules/stage0-contract";
import type { Effects, GatingEntry, ModuleEntry } from "./extract-rules-lib";
import {
  extractFunction,
  splitModuleBlocks,
  stringLiterals,
  stripTrailingComment,
} from "./extract-rules-lib";
import { childhoodLayer, type ChildhoodReader } from "./childhood-choices";

export function childhoodFlexPolicies(
  read: ChildhoodReader,
): (name: string, allowance: number) => FlexPolicy {
  const file = "s2flexxpdialog.cpp";
  const text = read(file).split("\n").map(stripTrailingComment).join("\n");
  const cap = (widget: string): number => {
    const values = [
      ...text.matchAll(new RegExp(`${widget}->setMaximum\\((\\d+)\\)`, "g")),
    ]
      .map((match) => Number(match[1]))
      .filter((value) => value > 0);
    if (!values.length) throw new Error(`${file}:1: Missing ${widget} cap`);
    return Math.max(...values);
  };
  const entryCaps = {
    attribute: cap("S2FlexDialSTRSpinBox"),
    trait: cap("S2FlexDialSpinBoxTraits"),
    skill: cap("S2FlexDialSpinBoxSkills"),
  };
  const fn = extractFunction(text, /S2FlexXPDialog::S2FXDDisableElem\(/);
  const restrictions = new Map<string, FlexPolicy["categoryCaps"]>();
  for (const block of splitModuleBlocks(fn, "nameChilld", file)) {
    const code = block.lines.map(stripTrailingComment).join("\n");
    if (block.name === "Military School") {
      if (
        !code.includes("S2FlexDialSTRSpinBox->setDisabled(true)") ||
        !code.includes("S2FlexDialSpinBoxTraits->setDisabled(true)")
      ) {
        throw new Error(
          `${file}:${block.line}: Missing skills-only restrictions`,
        );
      }
      restrictions.set(block.name, { attribute: 0, trait: 0, skill: null });
    } else if (
      block.name === "Preparatory School" ||
      block.name === "Spacer Family"
    ) {
      const limit = /countXP\s*==\s*(\d+)/.exec(code);
      const bucket = /countXP\s*\+=\s*s2FXD(Traits|Skills)\[i\]\.second/.exec(
        code,
      );
      if (!limit || !bucket)
        throw new Error(`${file}:${block.line}: Unrecognized category cap`);
      restrictions.set(block.name, {
        attribute: null,
        trait: bucket[1] === "Traits" ? Number(limit[1]) : null,
        skill: bucket[1] === "Skills" ? Number(limit[1]) : null,
      });
    }
  }
  if (restrictions.size !== 3)
    throw new Error(
      `${file}:${fn.startLine}: Missing Stage 2 flex restrictions`,
    );
  return (name, allowance) => ({
    allowance,
    entryCaps,
    categoryCaps: restrictions.get(name) ?? {
      attribute: null,
      trait: null,
      skill: null,
    },
  });
}

function pool(
  schedule: NonNullable<Effects["clanXp"]>["basic"],
  groups: SibkoPool["groups"],
  source: Stage0Source,
): SibkoPool {
  if (!schedule || !groups.length)
    throw new Error(`${source.file}:${source.line}: Missing Sibko pool`);
  return {
    budgetXp: schedule.xp,
    stepXp: schedule.stepXp,
    rebateXp: schedule.rebateXp,
    groups,
  };
}

export function childhoodSibko(
  read: ChildhoodReader,
  module: ModuleEntry,
  gating: readonly GatingEntry[],
  flex: (name: string, allowance: number) => FlexPolicy,
): SibkoBranch[] {
  const picker = gating.find(
    (entry) => entry.kind === "sibkoPicker" && entry.appliesTo === module.name,
  );
  if (!picker) return [];
  const basic = gating.find((entry) => entry.kind === "clanFieldList");
  if (!basic?.branches?.[0])
    throw new Error(
      `${module.source.file}:${module.source.line}: Missing basic field source`,
    );
  const basicGroups = basic.branches[0].offered.map((skill) => ({
    id: skill,
    skills: [skill],
  }));
  const cavalryFn = extractFunction(
    read("s2clanfielddialog.cpp"),
    /S2ClanFieldDialog::S2CFDInit\(/,
  );
  const cavalryGroups = cavalryFn.lines
    .map(stripTrailingComment)
    .flatMap((line) => {
      const match = /^\s*advListPart(\d+)\s*<<\s*(.+);\s*$/.exec(line);
      return match
        ? [{ id: `cavalry-${match[1]}`, skills: stringLiterals(match[2]) }]
        : [];
    });
  if (cavalryGroups.length !== 5)
    throw new Error(
      `s2clanfielddialog.cpp:${cavalryFn.startLine}: Missing Cavalry groups`,
    );
  const offeredNames = new Set(
    picker.branches?.flatMap(({ offered }) => offered),
  );
  const orderedNames = gating
    .filter(
      (entry) =>
        entry.kind === "sibkoBranch" &&
        entry.appliesTo === module.name &&
        entry.name &&
        offeredNames.has(entry.name),
    )
    .map((entry) => entry.name!);
  return orderedNames.map((name) => {
    const branch = gating.find(
      (entry) =>
        entry.kind === "sibkoBranch" &&
        entry.appliesTo === module.name &&
        entry.name === name,
    );
    const effects = branch?.effects;
    if (
      !branch ||
      !effects ||
      effects.flexXp === undefined ||
      !effects.clanFieldList
    ) {
      throw new Error(
        `${picker.source.file}:${picker.source.line}: Missing ${module.name}/${name} effects`,
      );
    }
    const xpCost = effects.xpCost ?? module.xpCost;
    if (xpCost === null)
      throw new Error(
        `${branch.source.file}:${branch.source.line}: Missing branch cost`,
      );
    const memberships =
      picker.branches?.filter(({ offered }) => offered.includes(name)) ?? [];
    const universal = memberships.length === picker.branches?.length;
    const clans = universal
      ? null
      : [
          ...new Set(
            memberships.flatMap(({ condition }) => {
              if (!condition) return [];
              // The positive innermost clan test declares this special branch; enclosing else tests only exclude other specials.
              return [
                ...condition
                  .replace(/!\([^)]*\)/g, "")
                  .matchAll(/nameClan\s*==\s*"([^"]+)"/g),
              ].map((match) => match[1]);
            }),
          ),
        ];
    if (clans?.length === 0)
      throw new Error(
        `${picker.source.file}:${picker.source.line}: Unresolved branch clans`,
      );
    const groups =
      name === "Cavalry"
        ? cavalryGroups
        : effects.clanFieldList.map((skill) => ({
            id: skill,
            skills: [skill],
          }));
    return {
      name,
      clans,
      xpCost,
      flexPolicy: flex(module.name, effects.flexXp),
      layer: childhoodLayer(effects, branch.source),
      basic: pool(picker.effects?.clanXp?.basic, basicGroups, basic.source),
      advanced: pool(effects.clanXp?.advanced, groups, branch.source),
      source: branch.source,
    };
  });
}
