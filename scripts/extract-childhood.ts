import type {
  ChildhoodCatalog,
  ChildhoodGate,
  ChildhoodModule,
} from "../lib/rules/childhood-contract";
import type { Stage0Catalog } from "../lib/rules/stage0-contract";
import type { GatingEntry, ModuleEntry } from "./extract-rules-lib";
import { extractFunction, stripTrailingComment } from "./extract-rules-lib";
import {
  childhoodChoiceDispatch,
  childhoodChoices,
  childhoodLayer,
  type ChildhoodReader,
} from "./childhood-choices";
import { childhoodFlexPolicies, childhoodSibko } from "./childhood-sibko";

function affiliationSkills(
  read: ChildhoodReader,
  stage0: Stage0Catalog,
): ChildhoodCatalog["affiliationSkills"] {
  const file = "text_resurce.cpp";
  const fn = extractFunction(read(file), /Text_Resurce::rSubAff\(/);
  const values = new Map<
    number,
    { protocol?: string; streetwise?: string; line: number }
  >();
  let id: number | null = null;
  for (const [offset, raw] of fn.lines.entries()) {
    const code = stripTrailingComment(raw).trim();
    const arm = /^case\s+(\d+)\s*:/.exec(code);
    if (arm) id = Number(arm[1]);
    if (code === "default:") id = null;
    const assignment = /^aff(Protocol|Street)\s*=\s*"([^"]+)"\s*;$/.exec(code);
    if (!assignment) continue;
    if (id === null)
      throw new Error(
        `${file}:${fn.startLine + offset}: Parameter grant outside affiliation`,
      );
    const entry = values.get(id) ?? { line: fn.startLine + offset };
    if (assignment[1] === "Protocol") entry.protocol = assignment[2];
    else entry.streetwise = assignment[2];
    values.set(id, entry);
  }
  return stage0.affiliations.map((aff) => {
    const value = values.get(aff.id);
    if (!value?.protocol || !value.streetwise)
      throw new Error(
        `${file}:${fn.startLine}: Missing parameter join for ${aff.name}`,
      );
    return {
      affiliation: aff.name,
      protocol: value.protocol,
      streetwise: value.streetwise,
      source: { file, line: value.line },
    };
  });
}

export function extractChildhood({
  readSource,
  modules,
  gating,
  gates,
  stage0,
}: {
  readonly readSource: ChildhoodReader;
  readonly modules: readonly ModuleEntry[];
  readonly gating: readonly GatingEntry[];
  readonly gates: readonly ChildhoodGate[];
  readonly stage0: Stage0Catalog;
  readonly subskills: Readonly<Record<string, readonly string[]>>;
}): ChildhoodCatalog {
  const dispatch = childhoodChoiceDispatch(readSource);
  const flex = childhoodFlexPolicies(readSource);
  const normalized = modules
    .filter((module) => module.stage === 1 || module.stage === 2)
    .map((module): ChildhoodModule => {
      const choices = childhoodChoices(
        module,
        [...module.deferredPicks, ...module.morePicks],
        dispatch,
      );
      const casteLayers = module.conditionals.map((conditional) => {
        const caste = /^casteName\s*==\s*"([^"]+)"$/.exec(
          conditional.condition,
        );
        if (
          !caste ||
          conditional.elseEffects ||
          conditional.conditionals?.length
        ) {
          throw new Error(
            `${module.source.file}:${module.source.line}: Unknown childhood conditional ${conditional.condition}`,
          );
        }
        return {
          caste: caste[1],
          layer: childhoodLayer(
            conditional.effects,
            module.source,
            childhoodChoices(
              module,
              [
                ...(conditional.effects.picks ?? []),
                ...(conditional.effects.morePicks ?? []),
              ],
              dispatch,
            ),
          ),
        };
      });
      const branches = childhoodSibko(readSource, module, gating, flex);
      if (module.stage === 2 && module.flexXp === null && !branches.length) {
        throw new Error(
          `${module.source.file}:${module.source.line}: Missing flex allowance`,
        );
      }
      return {
        stage: module.stage as 1 | 2,
        name: module.name,
        description: module.description,
        xpCost: module.xpCost,
        layer: childhoodLayer(module, module.source, choices),
        parametrizedGrants: module.parametrizedGrants,
        phenotypes: module.phenotypes,
        casteLayers,
        flexPolicy:
          module.stage === 1 || module.flexXp === null
            ? null
            : flex(module.name, module.flexXp),
        sibkoBranches: branches,
        source: module.source,
      };
    });
  return {
    modules: normalized,
    gates,
    affiliationSkills: affiliationSkills(readSource, stage0),
  };
}
