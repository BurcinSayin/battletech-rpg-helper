"use client";

import { useId, useState } from "react";
import { HudButton, hudInput } from "@/components/characters/ui";
import type { BtccDraft } from "@/lib/btcc";
import {
  ATTRIBUTE_BASE,
  ATTRIBUTE_KEYS,
  validateFlexAllocations,
  type FlexAllocation,
  type FlexValidation,
} from "@/lib/characters";
import type { FlexPolicy } from "@/lib/rules/childhood-contract";
import type { Stage0Candidate } from "@/lib/rules/stage0-contract";
import { ChoiceSelect } from "./choice-select";

export type FlexXpPanelProps = {
  readonly policy: FlexPolicy;
  readonly allocations: readonly FlexAllocation[];
  readonly targets: readonly Stage0Candidate[];
  readonly preFlexDraft: BtccDraft;
  readonly disabled: boolean;
  readonly onGrantChange: (candidate: Stage0Candidate, xp: number) => void;
  readonly onReset: () => void;
};

const failureMessages: Record<
  Extract<FlexValidation, { valid: false }>["reason"],
  string
> = {
  candidate: "Choose a currently available concrete target.",
  amount: "Enter a nonnegative whole number of XP.",
  duplicate: "Each target can have only one flex allocation.",
  entryCap: "This allocation exceeds the module's per-target XP cap.",
  categoryCap: "These allocations exceed the module's category XP limit.",
  allowance:
    "These allocations exceed the remaining flex allowance. Reduce another allocation first.",
};

function candidateKey(candidate: Stage0Candidate): string {
  return JSON.stringify([candidate.kind, candidate.value]);
}

export function FlexXpPanel({
  policy,
  allocations,
  targets,
  preFlexDraft,
  disabled,
  onGrantChange,
  onReset,
}: FlexXpPanelProps) {
  const prefix = useId();
  const [selected, setSelected] = useState({ skill: "", trait: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(
    null,
  );
  const validation = validateFlexAllocations(policy, allocations, targets);
  const spent = validation.valid ? validation.spent : 0;
  const remaining = validation.valid ? validation.remaining : policy.allowance;

  function change(candidate: Stage0Candidate, raw: string) {
    const key = candidateKey(candidate);
    const xp = raw.trim() === "" ? 0 : Number(raw);
    const proposed = allocations.filter(
      (allocation) => candidateKey(allocation.candidate) !== key,
    );
    if (xp !== 0) proposed.push({ candidate, xp });
    const result = validateFlexAllocations(policy, proposed, targets);
    if (!result.valid) {
      setErrors((previous) => ({
        ...previous,
        [key]: failureMessages[result.reason],
      }));
      return;
    }
    setErrors((previous) => ({ ...previous, [key]: "" }));
    onGrantChange(candidate, xp);
  }

  function allocationInput(candidate: Stage0Candidate) {
    const key = candidateKey(candidate);
    const xp =
      allocations.find(
        (allocation) => candidateKey(allocation.candidate) === key,
      )?.xp ?? 0;
    const existing =
      candidate.kind === "attribute"
        ? (preFlexDraft.attrs[candidate.value] ?? ATTRIBUTE_BASE)
        : ((candidate.kind === "skill"
            ? preFlexDraft.skills
            : preFlexDraft.traits
          ).find((row) => row.name === candidate.value)?.xp ?? 0);
    const id = `${prefix}-${encodeURIComponent(key)}`;
    const categoryDisabled = policy.categoryCaps[candidate.kind] === 0;
    return (
      <div
        key={key}
        className="flex min-w-0 flex-col gap-1 text-sm text-hud-text"
      >
        <label htmlFor={id}>{candidate.value} flex XP</label>
        <input
          id={id}
          className={hudInput}
          type="number"
          min={0}
          step={1}
          max={Math.min(policy.entryCaps[candidate.kind], xp + remaining)}
          value={editing?.key === key ? editing.value : xp}
          disabled={disabled || categoryDisabled}
          aria-invalid={Boolean(errors[key])}
          aria-describedby={`${id}-totals${errors[key] ? ` ${id}-error` : ""}`}
          onChange={(event) =>
            setEditing({ key, value: event.currentTarget.value })
          }
          onBlur={(event) => {
            change(candidate, event.currentTarget.value);
            setEditing(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <p id={`${id}-totals`} className="text-xs text-hud-muted">
          Pre-flex XP: {existing} XP · Total XP: {existing + xp} XP · Per-target
          cap: {policy.entryCaps[candidate.kind]} XP
        </p>
        {errors[key] && (
          <p id={`${id}-error`} role="alert" className="text-xs text-hud-amber">
            {errors[key]} Last valid allocation retained.
          </p>
        )}
        {candidate.kind !== "attribute" && (
          <HudButton
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              change(candidate, "0");
              const kind = candidate.kind as "skill" | "trait";
              setSelected((previous) => ({
                ...previous,
                [kind]: previous[kind] === key ? "" : previous[kind],
              }));
            }}
          >
            Remove {candidate.value} flex allocation
          </HudButton>
        )}
      </div>
    );
  }

  return (
    <section
      aria-label="Stage 2 flex XP"
      className="flex flex-col gap-4 border-t border-hud-line pt-3"
    >
      <h3 className="font-mono text-sm text-hud-text">Stage 2 flex XP</h3>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-sm text-hud-text">
        {(
          [
            ["Flex allowance", policy.allowance],
            ["Flex spent", spent],
            ["Flex remaining", remaining],
          ] as const
        ).map(([label, amount]) => (
          <div key={label}>
            <dt className="text-xs text-hud-muted">{label}</dt>
            <dd>{amount} XP</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-hud-muted">
        Flex values are added XP, not replacement totals. Press Enter or leave
        the field to commit an allocation. Unused allowance is allowed. Flex
        changes Draft XP, not Wizard XP.
      </p>
      {disabled && (
        <p className="text-sm text-hud-muted">
          Complete the required module choices before allocating flex XP.
        </p>
      )}
      {remaining === 0 && (
        <p role="status" className="text-sm text-hud-muted">
          Flex allowance exhausted. Reduce or remove an allocation to make
          points available; refunds remain enabled.
        </p>
      )}
      <fieldset className="min-w-0">
        <legend className="mb-2 font-mono text-xs text-hud-muted">
          Attribute allocations
        </legend>
        {policy.categoryCaps.attribute === 0 && (
          <p className="mb-2 text-sm text-hud-muted">
            This module does not allow attribute flex XP.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {ATTRIBUTE_KEYS.map((value) =>
            allocationInput({ kind: "attribute", value }),
          )}
        </div>
      </fieldset>
      {(["skill", "trait"] as const).map((kind) => {
        const choices = targets.filter((candidate) => candidate.kind === kind);
        const active = allocations
          .filter((allocation) => allocation.candidate.kind === kind)
          .map((allocation) => allocation.candidate);
        const pending = choices.find(
          (candidate) => candidateKey(candidate) === selected[kind],
        );
        if (
          pending &&
          !active.some(
            (candidate) => candidateKey(candidate) === candidateKey(pending),
          )
        )
          active.push(pending);
        const categoryCap = policy.categoryCaps[kind];
        return (
          <fieldset
            key={kind}
            className="min-w-0 border-t border-hud-line pt-3"
          >
            <legend className="px-1 font-mono text-xs text-hud-muted">
              {kind === "skill" ? "Skill" : "Trait"} allocations
            </legend>
            {categoryCap === 0 ? (
              <p className="mb-2 text-sm text-hud-muted">
                This module does not allow {kind} flex XP.
              </p>
            ) : (
              categoryCap !== null && (
                <p className="mb-2 text-sm text-hud-muted">
                  Module {kind} category limit: {categoryCap} XP total.
                </p>
              )
            )}
            <ChoiceSelect
              id={`${prefix}-${kind}-target`}
              label={`Flex ${kind} target`}
              value={selected[kind]}
              disabled={disabled || categoryCap === 0 || remaining === 0}
              options={choices.map((candidate) => ({
                value: candidateKey(candidate),
                label: candidate.value,
              }))}
              description="Choose a concrete target, then enter its added XP below. Existing allocations remain editable."
              onChange={(value) =>
                setSelected((previous) => ({ ...previous, [kind]: value }))
              }
            />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {active.map(allocationInput)}
            </div>
          </fieldset>
        );
      })}
      <HudButton
        variant="ghost"
        disabled={disabled || allocations.length === 0}
        onClick={() => {
          setErrors({});
          setEditing(null);
          setSelected({ skill: "", trait: "" });
          onReset();
        }}
      >
        Reset flex allocations
      </HudButton>
    </section>
  );
}
