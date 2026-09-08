"use client";

import { useId, type Dispatch } from "react";
import type { ChildhoodSelection } from "@/lib/characters";
import type { Stage0Candidate } from "@/lib/rules/stage0-contract";
import { ChoiceSelect } from "./choice-select";
import { FlexXpPanel } from "./flex-xp-panel";
import { SibkoPanel } from "./sibko-panel";
import type {
  ChildhoodStageView,
  Stage2Selection,
  WizardAction,
} from "./wizard-state";

export type ChildhoodPanelProps = {
  readonly stage: "stage1" | "stage2";
  readonly view: ChildhoodStageView;
  readonly selection: ChildhoodSelection | Stage2Selection | null;
  readonly complete: boolean;
  readonly dispatch: Dispatch<WizardAction>;
};

function candidateKey(candidate: Stage0Candidate): string {
  return JSON.stringify([candidate.kind, candidate.value]);
}

export function ChildhoodPanel({
  stage,
  view,
  selection,
  complete,
  dispatch,
}: ChildhoodPanelProps) {
  const prefix = useId();
  const number = stage === "stage1" ? 1 : 2;
  const selectedModule = view.modules.find(
    (module) => module.name === selection?.moduleName,
  );
  const resolved =
    view.resolution && view.resolution.status !== "invalid"
      ? view.resolution.module
      : null;
  const cost = resolved?.xpCost ?? selectedModule?.xpCost;
  const flexPolicy = resolved?.flexPolicy ?? selectedModule?.flexPolicy;
  const branches =
    selectedModule?.sibkoBranches.filter(
      (branch) =>
        branch.clans === null ||
        branch.clans.includes(view.context?.subAffiliation ?? ""),
    ) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <ChoiceSelect
        id={`${prefix}-module`}
        label={`Stage ${number} module`}
        value={selection?.moduleName ?? ""}
        disabled={!view.context}
        options={view.modules.map((module) => ({
          value: module.name,
          label: module.name,
        }))}
        description="Only modules available from your completed earlier stages are shown. Changing module clears this stage's choices and later stages."
        onChange={(moduleName) =>
          dispatch({
            type: "setStageModule",
            stage,
            moduleName: moduleName || null,
          })
        }
      />
      {selectedModule && (
        <>
          {selectedModule.description && (
            <p className="whitespace-pre-line text-sm text-hud-text">
              {selectedModule.description}
            </p>
          )}
          <p className="font-mono text-sm text-hud-text">
            Module cost: {cost == null ? "Choose a Sibko branch" : `${cost} XP`}
          </p>
          {stage === "stage1" && selectedModule.phenotypes.length > 0 && (
            <ChoiceSelect
              id={`${prefix}-phenotype`}
              label="Stage 1 phenotype"
              value={selection?.phenotype ?? ""}
              options={selectedModule.phenotypes.map((value) => ({
                value,
                label: value,
              }))}
              description="Required identity choice. This does not add phenotype-catalog attribute adjustments."
              onChange={(phenotype) =>
                dispatch({
                  type: "setStage1Phenotype",
                  phenotype: phenotype || null,
                })
              }
            />
          )}
          {stage === "stage2" && selectedModule.sibkoBranches.length > 0 && (
            <SibkoPanel
              branches={branches}
              selection={selection?.sibko ?? null}
              pools={resolved?.sibkoPools ?? null}
              fields={view.fields}
              onBranchChange={(branch) =>
                dispatch({ type: "setSibkoBranch", branch })
              }
              onFieldChange={(pool, groupId, skill) =>
                dispatch({ type: "setSibkoField", pool, groupId, skill })
              }
            />
          )}
          {resolved?.layer.choices.map((choice, choiceIndex) => {
            const picked =
              selection?.choices.find((entry) => entry.choiceId === choice.id)
                ?.candidates ?? [];
            const label = choice.id.startsWith("more:")
              ? `Module choice ${choice.id.slice(5)}`
              : choice.label?.startsWith("Flexible XP")
                ? `Module choice ${choice.id}`
                : choice.label
                  ? `${choice.label}${resolved.layer.choices.filter((entry) => entry.label === choice.label).length > 1 ? ` (${choice.id})` : ""}`
                  : `Required choice ${choiceIndex + 1}`;
            const group = choice.id.startsWith("more:")
              ? "Module choices"
              : choice.id.startsWith("advanced:")
                ? "Advanced module choices"
                : "Required module choices";
            return (
              <fieldset
                key={choice.id}
                className="min-w-0 border-t border-hud-line pt-3"
              >
                <legend className="px-1 font-mono text-xs text-hud-muted">
                  {group} · {label} · {choice.xp > 0 ? "+" : ""}
                  {choice.xp} XP per choice
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {Array.from(
                    { length: choice.selectionCount },
                    (_, position) => {
                      const current = picked[position];
                      const currentKey = current ? candidateKey(current) : "";
                      return (
                        <ChoiceSelect
                          key={position}
                          id={`${prefix}-${encodeURIComponent(choice.id)}-${position}`}
                          label={
                            choice.selectionCount > 1
                              ? `${label} — ${position + 1} of ${choice.selectionCount}`
                              : label
                          }
                          value={currentKey}
                          disabled={position > picked.length}
                          options={choice.candidates.map((candidate) => ({
                            value: candidateKey(candidate),
                            label: `${candidate.value} (${candidate.kind})`,
                            disabled:
                              choice.unique &&
                              candidateKey(candidate) !== currentKey &&
                              picked.some(
                                (other, index) =>
                                  index !== position &&
                                  candidateKey(other) ===
                                    candidateKey(candidate),
                              ),
                          }))}
                          description={
                            choice.selectionCount > 1
                              ? "Fill positions in order. Clearing a position also clears the positions after it."
                              : undefined
                          }
                          onChange={(value) => {
                            const candidate = choice.candidates.find(
                              (entry) => candidateKey(entry) === value,
                            );
                            dispatch({
                              type: "setStageChoice",
                              stage,
                              choiceId: choice.id,
                              candidates: candidate
                                ? [
                                    ...picked.slice(0, position),
                                    candidate,
                                    ...picked.slice(position + 1),
                                  ]
                                : picked.slice(0, position),
                            });
                          }}
                        />
                      );
                    },
                  )}
                </div>
              </fieldset>
            );
          })}
        </>
      )}
      <p role="status" className="text-sm text-hud-muted">
        {complete
          ? `Stage ${number} complete. All required selections are ready.`
          : `Stage ${number} incomplete. Choose a module and fill every required choice before continuing. The current draft retains the completed earlier stages.`}
      </p>
      {stage === "stage2" && flexPolicy && (
        <FlexXpPanel
          key={`${selection?.moduleName}:${selection?.sibko?.branch ?? ""}`}
          policy={flexPolicy}
          allocations={
            selection && "flexGrants" in selection ? selection.flexGrants : []
          }
          targets={view.flexTargets}
          preFlexDraft={view.preFlexDraft}
          disabled={!complete}
          onGrantChange={(candidate, xp) =>
            dispatch({ type: "setStage2FlexGrant", candidate, xp })
          }
          onReset={() => dispatch({ type: "resetStage2Flex" })}
        />
      )}
    </div>
  );
}
