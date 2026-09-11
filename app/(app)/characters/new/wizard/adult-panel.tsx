"use client";

import { useId, type Dispatch } from "react";
import { HudButton } from "@/components/characters/ui";
import {
  completeAdultChoices,
  type AdultChoice,
  type AdultChoiceSelection,
  type SchoolTier,
} from "@/lib/characters";
import type { Stage0Candidate } from "@/lib/rules/stage0-contract";
import { ChoiceSelect } from "./choice-select";
import type { WizardAction, WizardDraftState } from "./wizard-state";

function Choices({
  choices,
  selection,
  onChange,
}: {
  readonly choices: readonly AdultChoice[];
  readonly selection: AdultChoiceSelection;
  readonly onChange: (
    choiceId: string,
    candidate: Stage0Candidate | null,
  ) => void;
}) {
  const id = useId();
  return choices
    .filter((choice) => choice.candidates.length > 1)
    .map((choice, index) => (
      <ChoiceSelect
        key={choice.id}
        id={`${id}-${choice.id}`}
        label={`${choice.label} — choice ${index + 1}`}
        value={selection[choice.id] ? JSON.stringify(selection[choice.id]) : ""}
        options={choice.candidates.map((candidate) => ({
          value: JSON.stringify(candidate),
          label: `${candidate.value} (${candidate.kind})`,
        }))}
        description={`${choice.xp} XP`}
        onChange={(value) =>
          onChange(
            choice.id,
            choice.candidates.find(
              (candidate) => JSON.stringify(candidate) === value,
            ) ?? null,
          )
        }
      />
    ));
}

export function SchoolPanel({
  state,
  dispatch,
}: {
  readonly state: WizardDraftState;
  readonly dispatch: Dispatch<WizardAction>;
}) {
  const id = useId();
  const view = state.adult?.school;
  if (!view) return null;
  const selection = state.selections.stage3;
  const schoolReady =
    selection && completeAdultChoices(view.choices, selection.choices);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-hud-muted">
        School is optional. Choose a school and its fields, or continue without
        schooling.
      </p>
      <ChoiceSelect
        id={`${id}-school`}
        label="School"
        value={selection?.moduleName ?? ""}
        options={view.modules.map((module) => ({
          value: module.name,
          label: module.name,
        }))}
        disabled={!view.modules.length}
        onChange={(moduleName) =>
          dispatch({ type: "setSchool", moduleName: moduleName || null })
        }
      />
      {!view.modules.length && (
        <p className="text-sm text-hud-muted">
          Your earlier stages do not allow further schooling.
        </p>
      )}
      {view.module && selection && (
        <>
          <p className="whitespace-pre-line text-sm text-hud-text">
            {view.module.description}
          </p>
          <p className="font-mono text-sm text-hud-text">
            School cost: {view.module.xpCost} XP + 30 XP per field skill
          </p>
          <Choices
            choices={view.choices}
            selection={selection.choices}
            onChange={(choiceId, candidate) =>
              dispatch({ type: "setSchoolChoice", choiceId, candidate })
            }
          />
          {[0, 1, 2].map((index) => {
            const tiers: SchoolTier[] =
              index === 0
                ? ["basic"]
                : index === 1
                  ? ["advanced"]
                  : ["advanced", "specialist"];
            const offered = tiers.flatMap((tier) =>
              (view.module?.fields?.[tier]?.skills ?? []).map((name) => ({
                tier,
                name,
              })),
            );
            if (!offered.length) return null;
            const field = selection.fields[index];
            const projected = view.fields[index];
            return (
              <section
                key={index}
                className="flex flex-col gap-3 rounded border border-hud-line p-3"
                aria-label={`School field ${index + 1}`}
              >
                <ChoiceSelect
                  id={`${id}-field-${index}`}
                  label={
                    index === 0
                      ? "Basic field"
                      : index === 1
                        ? "Advanced field (optional)"
                        : "Further field (optional)"
                  }
                  value={field ? JSON.stringify([field.tier, field.name]) : ""}
                  disabled={
                    !schoolReady ||
                    (index > 0 && !view.fields[index - 1]?.complete)
                  }
                  options={offered.map(({ tier, name }) => ({
                    value: JSON.stringify([tier, name]),
                    label:
                      index === 2
                        ? `${tier === "advanced" ? "Advanced" : "Specialist"}: ${name}`
                        : name,
                  }))}
                  onChange={(value) => {
                    const field = offered.find(
                      ({ tier, name }) =>
                        JSON.stringify([tier, name]) === value,
                    );
                    dispatch({
                      type: "setSchoolField",
                      index,
                      tier: field?.tier ?? tiers[0],
                      name: field?.name ?? null,
                    });
                  }}
                />
                {field && projected && (
                  <>
                    <p className="text-sm text-hud-text">
                      {projected.choices.length} skills · {projected.cost} XP ·{" "}
                      {projected.age} years · {projected.rebate} XP rebate
                    </p>
                    <ul
                      aria-label={`${field.name} field skills`}
                      className="text-sm text-hud-muted"
                    >
                      {projected.choices
                        .filter((choice) => choice.candidates.length === 1)
                        .map((choice) => (
                          <li key={choice.id}>
                            {choice.candidates[0].value}: 30 XP
                          </li>
                        ))}
                    </ul>
                    <Choices
                      choices={projected.choices}
                      selection={field.choices}
                      onChange={(choiceId, candidate) =>
                        dispatch({
                          type: "setSchoolFieldChoice",
                          index,
                          choiceId,
                          candidate,
                        })
                      }
                    />
                  </>
                )}
              </section>
            );
          })}
          <p className="font-mono text-sm text-hud-text">
            School charges applied: {view.cost} XP. Rebate on entering Stage 4:{" "}
            {view.rebate} XP.
          </p>
          {!view.complete && (
            <p role="status" className="text-sm text-hud-amber">
              Complete the school choices and basic field to continue, or skip
              School.
            </p>
          )}
        </>
      )}
      <HudButton
        variant="ghost"
        onClick={() => dispatch({ type: "skipSchool" })}
      >
        Skip School
      </HudButton>
    </div>
  );
}

export function RealLifePanel({
  state,
  dispatch,
}: {
  readonly state: WizardDraftState;
  readonly dispatch: Dispatch<WizardAction>;
}) {
  const id = useId();
  const view = state.adult?.life;
  if (!view) return null;
  const selection = state.selections.stage4;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-hud-muted">
        Real Life is optional. Add successive modules to extend your lifepath.
        Each module can be taken once.
      </p>
      <ChoiceSelect
        id={`${id}-life`}
        label="Real Life module"
        value={selection?.pending ?? ""}
        options={view.offered.map((module) => ({
          value: module.name,
          label: module.name,
        }))}
        disabled={!view.offered.length}
        onChange={(moduleName) =>
          dispatch({ type: "setRealLife", moduleName: moduleName || null })
        }
      />
      {view.pending && (
        <>
          <p className="whitespace-pre-line text-sm text-hud-text">
            {view.pending.description}
          </p>
          <p className="font-mono text-sm text-hud-text">
            Module cost: {view.pending.xpCost} XP · Duration: {view.pending.age}{" "}
            years
          </p>
        </>
      )}
      <HudButton
        variant="primary"
        disabled={!view.pending}
        onClick={() => dispatch({ type: "addRealLife" })}
      >
        Add Real Life module
      </HudButton>
      {view.committed.length > 0 && (
        <section aria-label="Completed Real Life modules">
          <ol className="flex flex-col gap-3">
            {view.committed.map(({ module, cost, age }, index) => (
              <li
                key={module.name}
                className="rounded border border-hud-line p-3 text-sm text-hud-text"
              >
                <p>
                  {index + 1}. {module.name} · {cost} XP · {age} years
                </p>
                <HudButton
                  variant="ghost"
                  onClick={() => dispatch({ type: "removeRealLife", index })}
                >
                  Remove {module.name}
                  {index < view.committed.length - 1
                    ? " and later modules"
                    : ""}
                </HudButton>
              </li>
            ))}
          </ol>
        </section>
      )}
      {selection?.skipped && (
        <p role="status" className="text-sm text-hud-muted">
          Stage 4 skipped. Your lifepath ends after{" "}
          {state.selections.stage3 ? "School" : "Late Childhood"}.
        </p>
      )}
      <HudButton
        variant="ghost"
        onClick={() => dispatch({ type: "skipRealLife" })}
      >
        Skip Real Life
      </HudButton>
    </div>
  );
}
