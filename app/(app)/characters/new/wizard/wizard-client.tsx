"use client";

import { useReducer, useState, useTransition } from "react";
import { Panel, HudButton, hudInput } from "@/components/characters/ui";
import { serializeBtcc } from "@/lib/btcc";
import { createWizardCharacter } from "@/app/(app)/characters/actions";
import { cn } from "@/lib/utils";
import { stage0Catalog } from "@/lib/rules/load";
import { ATTRIBUTE_BASE, ATTRIBUTE_KEYS } from "@/lib/characters";
import { ChildhoodPanel } from "./childhood-panel";
import { Stage0Panel } from "./stage0-panel";
import { SchoolPanel, RealLifePanel } from "./adult-panel";
import {
  WIZARD_PAGES,
  initialWizardState,
  wizardReducer,
  canAdvance,
  canFinish,
  type WizardAction,
} from "./wizard-state";

/** Build locally, then reconcile and persist the finished lifepath. */
export function WizardClient() {
  const [state, dispatch] = useReducer(
    wizardReducer,
    undefined,
    initialWizardState,
  );
  // Back is gated behind a confirmation, mirroring the desktop's warning box
  // (`wizard.cpp:196`) — it is the moment selections are destroyed (§7.3).
  const [confirmingBack, setConfirmingBack] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const page = WIZARD_PAGES[state.pageId];

  function onFinish() {
    if (isPending || !canFinish(state)) return;
    setConfirmingBack(false);
    setError(null);
    startTransition(async () => {
      // Success redirects; only an expected failure returns to this draft.
      const result = await createWizardCharacter(
        serializeBtcc(state.draft),
        state.wizardXpRemaining,
      );
      setError(result.message);
    });
  }

  function onBackConfirmed() {
    setConfirmingBack(false);
    dispatch({ type: "back" });
  }

  function onNext() {
    // An open back-confirmation belongs to the page it was raised on;
    // navigating forward must not leave it armed against a different page.
    setConfirmingBack(false);
    dispatch({ type: "next" });
  }

  function onAdultAction(action: WizardAction) {
    setConfirmingBack(false);
    dispatch(action);
  }

  return (
    <fieldset
      disabled={isPending}
      className="flex min-w-0 flex-col gap-4"
      aria-busy={isPending}
    >
      <header>
        <h1 className="text-xl font-semibold text-hud-text">Lifepath wizard</h1>
        <p className="mt-1 text-sm text-hud-muted">
          Build a new pilot through the five lifepath stages.
        </p>
      </header>

      {/* Page order is the acceptance criterion for the shell — render it as
          the step list so the §7.1 topology is visible on screen. */}
      <nav aria-label="Wizard stages">
        <ol className="flex flex-col gap-1">
          {WIZARD_PAGES.map((p) => (
            <li
              key={p.id}
              aria-current={p.id === state.pageId ? "step" : undefined}
              className={cn(
                "rounded px-2 py-1 font-mono text-xs uppercase tracking-widest",
                p.id === state.pageId
                  ? "bg-hud-amber/10 text-hud-amber"
                  : "text-hud-muted",
              )}
            >
              {p.id}. {p.title}
            </li>
          ))}
        </ol>
      </nav>

      <section
        aria-label="XP balances"
        className="flex flex-wrap gap-x-6 gap-y-2 rounded border border-hud-line p-3 font-mono text-sm text-hud-text"
      >
        <p>Wizard XP remaining: {state.wizardXpRemaining} XP</p>
        <p>Draft XP remaining: {state.xp.remaining} XP</p>
      </section>

      <Panel title={page.title}>
        {page.key === "intro" ? (
          <label className="flex flex-col gap-1 text-sm text-hud-text">
            Character name
            <input
              className={hudInput}
              value={state.draft.scalars.name}
              onChange={(e) =>
                dispatch({ type: "setName", name: e.target.value })
              }
              maxLength={100}
              placeholder="e.g. Lisa"
            />
          </label>
        ) : page.key === "stage0" ? (
          <>
            <Stage0Panel
              catalog={stage0Catalog}
              selection={state.selections.stage0}
              complete={state.stage0Complete}
              moduleCost={
                stage0Catalog.affiliations.find(
                  (entry) => entry.id === state.selections.stage0.affiliationId,
                )?.xpCost ?? 0
              }
              wizardXpRemaining={state.wizardXpRemaining}
              draftXpRemaining={state.xp.remaining}
              onAffiliationChange={(affiliationId) =>
                dispatch({ type: "setStage0Affiliation", affiliationId })
              }
              onSubAffiliationChange={(subAffiliationId) =>
                dispatch({ type: "setStage0SubAffiliation", subAffiliationId })
              }
              onCasteChange={(casteId) =>
                dispatch({ type: "setStage0Caste", casteId })
              }
              onStartingLanguageChange={(startingLanguage) =>
                dispatch({
                  type: "setStage0StartingLanguage",
                  startingLanguage,
                })
              }
              onChoiceChange={(choice) =>
                dispatch({ type: "setStage0Choice", ...choice })
              }
            />
          </>
        ) : page.key === "stage1" || page.key === "stage2" ? (
          <ChildhoodPanel
            stage={page.key}
            view={state.childhood[page.key]}
            selection={state.selections[page.key]}
            complete={
              page.key === "stage1"
                ? state.stage1Complete
                : state.stage2Complete
            }
            dispatch={dispatch}
          />
        ) : page.key === "stage3" ? (
          <SchoolPanel state={state} dispatch={onAdultAction} />
        ) : (
          <RealLifePanel state={state} dispatch={onAdultAction} />
        )}
        {state.pageId >= 1 && (
          <section
            aria-label="Current draft"
            className="mt-4 border-t border-hud-line pt-3 text-sm text-hud-text"
          >
            <h3 className="font-mono text-xs text-hud-muted">Current draft</h3>
            <p>Age: {state.draft.scalars.age}</p>
            <p>Phenotype: {state.draft.scalars.phenotype || "None"}</p>
            <p>
              Early childhood:{" "}
              {state.draft.scalars.earlychild || "Not selected"}
            </p>
            <p>
              Late childhood: {state.draft.scalars.latechild || "Not selected"}
            </p>
            {state.pageId >= 4 && (
              <p>School: {state.draft.scalars.schoolname || "None"}</p>
            )}
            {state.pageId >= 5 && (
              <p>Real Life: {state.draft.scalars.reallife || "None"}</p>
            )}
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="font-mono text-xs text-hud-muted">Attributes</h4>
                <ul aria-label="Attributes">
                  {ATTRIBUTE_KEYS.map((key) => (
                    <li key={key}>
                      {key}: {state.draft.attrs[key] ?? ATTRIBUTE_BASE} XP
                    </li>
                  ))}
                </ul>
              </div>
              {(
                [
                  ["Skills", state.draft.skills],
                  ["Traits", state.draft.traits],
                ] as const
              ).map(([title, rows]) => (
                <div key={title}>
                  <h4 className="font-mono text-xs text-hud-muted">{title}</h4>
                  <ul aria-label={title}>
                    {rows.map((row) => (
                      <li key={row.name}>
                        {row.name}: {row.xp} XP
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </Panel>

      {confirmingBack && (
        <div
          role="alertdialog"
          aria-labelledby="wizard-back-title"
          className="rounded-md border border-hud-amber/40 bg-hud-amber/10 p-3 text-sm"
        >
          <p id="wizard-back-title" className="font-medium text-hud-amber">
            Go back to {WIZARD_PAGES[state.pageId - 1]?.title}?
          </p>
          <p className="mt-1 text-hud-text">
            If you change your stage module, all selections you have already
            made for any later stages are lost.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <HudButton variant="ghost" onClick={() => setConfirmingBack(false)}>
              Stay
            </HudButton>
            <HudButton variant="primary" onClick={onBackConfirmed}>
              Go back
            </HudButton>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-hud-red">
          {error}
        </p>
      )}
      {state.pageId === 5 && state.adult?.life.pending && (
        <p role="status" className="text-sm text-hud-muted">
          Add or clear the selected Real Life module before finishing.
        </p>
      )}
      {state.pageId === 5 && state.wizardXpRemaining < 0 && (
        <p role="alert" className="text-sm text-hud-red">
          Your lifepath exceeds the XP budget. Remove a module before finishing.
        </p>
      )}

      <footer className="flex items-center justify-between gap-2">
        <HudButton
          variant="ghost"
          // The desktop's Back button starts disabled (`wizard.cpp:30-33`):
          // there is no page before Intro.
          disabled={state.pageId === 0}
          onClick={() => setConfirmingBack(true)}
        >
          Back
        </HudButton>
        {state.pageId < 5 ? (
          <HudButton
            variant="primary"
            onClick={onNext}
            disabled={!canAdvance(state)}
          >
            Next
          </HudButton>
        ) : (
          <HudButton
            variant="primary"
            disabled={isPending || !canFinish(state)}
            onClick={onFinish}
          >
            {isPending ? "Creating…" : "Finish"}
          </HudButton>
        )}
      </footer>
    </fieldset>
  );
}
