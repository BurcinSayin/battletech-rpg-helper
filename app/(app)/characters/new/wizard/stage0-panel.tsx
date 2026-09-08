"use client";

import { useId } from "react";
import { ChoiceSelect } from "./choice-select";
import type {
  Stage0Candidate,
  Stage0Catalog,
  Stage0Layer,
} from "@/lib/rules/stage0-contract";
import {
  resolveStage0Candidates,
  type Stage0ChoiceSelection,
  type Stage0LayerId,
  type Stage0Selection,
} from "./wizard-stage0";

export type Stage0PanelProps = {
  readonly catalog: Stage0Catalog;
  readonly selection: Stage0Selection;
  readonly complete: boolean;
  readonly moduleCost: number;
  readonly wizardXpRemaining: number;
  readonly draftXpRemaining: number;
  readonly onAffiliationChange: (id: number | null) => void;
  readonly onSubAffiliationChange: (id: number | null) => void;
  readonly onStartingLanguageChange: (value: string | null) => void;
  readonly onCasteChange: (id: string | null) => void;
  readonly onChoiceChange: (choice: Stage0ChoiceSelection) => void;
};

function candidateKey(candidate: Stage0Candidate): string {
  return JSON.stringify([candidate.kind, candidate.value]);
}

function displayName(value: string): string {
  return value.replace(/^Language\//, "");
}

export function Stage0Panel(props: Stage0PanelProps) {
  const prefix = useId();
  const { catalog, selection } = props;
  const affiliation = catalog.affiliations.find(
    (entry) => entry.id === selection.affiliationId,
  );
  const children =
    affiliation?.subAffiliations.filter(
      (entry) => entry.affiliationId === affiliation.id,
    ) ?? [];
  const child = children.find(
    (entry) => entry.id === selection.subAffiliationId,
  );
  const clan = affiliation?.id === 9 || affiliation?.id === 10;
  const castes = child?.castes ?? affiliation?.castes ?? [];
  const caste =
    clan && child && castes.includes(selection.casteId ?? "")
      ? catalog.castes.find((entry) => entry.name === selection.casteId)
      : undefined;
  const languageRule =
    child?.startingLanguages ?? affiliation?.startingLanguages;
  const languages =
    languageRule?.mode === "base" ? languageRule.candidates : [];
  const layers = [
    { id: "base", layer: affiliation?.base },
    { id: "subAffiliation", layer: child?.layer },
    { id: "caste", layer: caste?.layer },
  ] satisfies readonly {
    readonly id: Stage0LayerId;
    readonly layer: Stage0Layer | undefined;
  }[];

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-wrap gap-x-6 gap-y-3 border-b border-hud-line pb-3 font-mono text-sm">
        {(
          [
            ["Module cost", props.moduleCost],
            ["Wizard XP remaining", props.wizardXpRemaining],
            ["Draft XP remaining", props.draftXpRemaining],
          ] as const
        ).map(([label, amount]) => (
          <div key={label}>
            <dt className="text-xs text-hud-muted">{label}</dt>
            <dd className="mt-1 text-hud-text">
              {amount.toLocaleString("en-US")} XP
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceSelect
          id={`${prefix}-affiliation`}
          label="Affiliation"
          value={String(selection.affiliationId ?? "")}
          options={catalog.affiliations.map((entry) => ({
            value: String(entry.id),
            label: entry.name,
          }))}
          onChange={(value) =>
            props.onAffiliationChange(
              catalog.affiliations.find((entry) => String(entry.id) === value)
                ?.id ?? null,
            )
          }
        />
        <ChoiceSelect
          id={`${prefix}-sub-affiliation`}
          label="Sub-affiliation"
          value={String(selection.subAffiliationId ?? "")}
          disabled={!affiliation}
          options={children.map((entry) => ({
            value: String(entry.id),
            label: entry.name,
          }))}
          description={affiliation ? undefined : "Choose an affiliation first."}
          onChange={(value) =>
            props.onSubAffiliationChange(
              children.find((entry) => String(entry.id) === value)?.id ?? null,
            )
          }
        />
        <ChoiceSelect
          id={`${prefix}-language`}
          label="Starting language"
          value={selection.startingLanguage ?? ""}
          disabled={!child || languages.length === 0}
          options={languages.map((value) => ({
            value,
            label: displayName(value),
          }))}
          description={
            !child
              ? "Choose a sub-affiliation first."
              : languages.length === 0
                ? "No starting languages are available. Choose another sub-affiliation to continue."
                : undefined
          }
          onChange={(value) =>
            props.onStartingLanguageChange(
              languages.find((entry) => entry === value) ?? null,
            )
          }
        />
        {clan && (
          <ChoiceSelect
            id={`${prefix}-caste`}
            label="Caste"
            value={selection.casteId ?? ""}
            disabled={!child}
            options={castes.map((value) => ({ value, label: value }))}
            description={child ? undefined : "Choose a sub-affiliation first."}
            onChange={(value) =>
              props.onCasteChange(
                castes.find((entry) => entry === value) ?? null,
              )
            }
          />
        )}
      </div>
      {layers.flatMap(({ id: layerId, layer }) =>
        (layer?.choices ?? []).map((choice, choiceIndex) => {
          const candidates = resolveStage0Candidates(
            choice,
            layerId,
            selection,
          );
          const picked =
            selection.choices.find(
              (entry) =>
                entry.layer === layerId && entry.choiceId === choice.id,
            )?.candidates ?? [];
          const label = choice.label ?? `Required choice ${choiceIndex + 1}`;
          return (
            <fieldset
              key={`${layerId}-${choice.id}`}
              className="min-w-0 border-t border-hud-line pt-3"
            >
              <legend className="px-1 font-mono text-xs text-hud-muted">
                {
                  (
                    {
                      base: "Affiliation",
                      subAffiliation: "Sub-affiliation",
                      caste: "Caste",
                    } as const
                  )[layerId]
                }{" "}
                · {label} · {choice.xp > 0 ? "+" : ""}
                {choice.xp} XP per choice
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from(
                  { length: choice.selectionCount },
                  (_, position) => {
                    const current = picked[position];
                    const currentKey = current ? candidateKey(current) : "";
                    const options = candidates.map((candidate) => ({
                      value: candidateKey(candidate),
                      label: `${displayName(candidate.value)} (${candidate.kind})`,
                      disabled:
                        choice.unique &&
                        candidateKey(candidate) !== currentKey &&
                        picked.some(
                          (sibling, index) =>
                            index !== position &&
                            candidateKey(sibling) === candidateKey(candidate),
                        ),
                    }));
                    return (
                      <ChoiceSelect
                        key={position}
                        id={`${prefix}-${layerId}-${encodeURIComponent(choice.id)}-${position}`}
                        label={
                          choice.selectionCount > 1
                            ? `${label} — ${position + 1} of ${choice.selectionCount}`
                            : label
                        }
                        value={currentKey}
                        options={options}
                        disabled={
                          position > picked.length || candidates.length === 0
                        }
                        description={
                          candidates.length === 0
                            ? "Choose the required earlier values to make candidates available."
                            : choice.selectionCount > 1
                              ? "Fill positions in order. Clearing a position also clears the positions after it."
                              : undefined
                        }
                        onChange={(value) => {
                          const candidate = candidates.find(
                            (entry) => candidateKey(entry) === value,
                          );
                          props.onChoiceChange({
                            layer: layerId,
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
        }),
      )}
      <p role="status" className="text-sm text-hud-muted">
        {props.complete
          ? "Stage 0 complete. All required selections are ready."
          : "Stage 0 incomplete. Select every required value and fill every choice position before continuing."}
      </p>
    </div>
  );
}
