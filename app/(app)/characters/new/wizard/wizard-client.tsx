"use client";

import { useReducer, useState } from "react";
import { Panel, HudButton, hudInput } from "@/components/characters/ui";
import { cn } from "@/lib/utils";
import {
  WIZARD_PAGES,
  initialWizardState,
  wizardReducer,
} from "./wizard-state";

/**
 * The step-#12a wizard shell: six pages in `RULES.md` §7.1 order with §7.3
 * back-navigation. Stage content lands in steps #12b–#14; until then each
 * stage page is a placeholder and `Finish` stays disabled.
 */
export function WizardClient() {
  const [state, dispatch] = useReducer(
    wizardReducer,
    undefined,
    initialWizardState,
  );
  // Back is gated behind a confirmation, mirroring the desktop's warning box
  // (`wizard.cpp:196`) — it is the moment selections are destroyed (§7.3).
  const [confirmingBack, setConfirmingBack] = useState(false);

  const page = WIZARD_PAGES[state.pageId];

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

  return (
    <div className="flex flex-col gap-4">
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

      <Panel title={page.title}>
        {page.key === "intro" ? (
          <label className="flex flex-col gap-1 text-sm text-hud-text">
            Character name
            <input
              className={hudInput}
              value={state.characterName}
              onChange={(e) =>
                dispatch({ type: "setName", name: e.target.value })
              }
              placeholder="e.g. Lisa"
            />
          </label>
        ) : (
          <p className="text-sm text-hud-muted">
            {page.title} content lands in a later build step. The shell under it
            — page order and back-navigation — is in place now.
          </p>
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
          <HudButton variant="primary" onClick={onNext}>
            Next
          </HudButton>
        ) : (
          <HudButton
            variant="primary"
            disabled
            title="Completion lands in build step #14c."
          >
            Finish
          </HudButton>
        )}
      </footer>
    </div>
  );
}
