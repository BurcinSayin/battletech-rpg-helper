"use client";

import { useId } from "react";
import {
  resolveSibkoFields,
  type SibkoFieldsResult,
  type SibkoSelection,
} from "@/lib/characters";
import type { SibkoBranch, SibkoPool } from "@/lib/rules/childhood-contract";
import { ChoiceSelect } from "./choice-select";

export type SibkoPanelProps = {
  readonly branches: readonly SibkoBranch[];
  readonly selection: SibkoSelection | null;
  readonly pools: {
    readonly basic: SibkoPool;
    readonly advanced: SibkoPool;
  } | null;
  readonly fields: SibkoFieldsResult | null;
  readonly onBranchChange: (branch: string | null) => void;
  readonly onFieldChange: (
    pool: "basic" | "advanced",
    groupId: string,
    skill: string | null,
  ) => void;
};

export function SibkoPanel({
  branches,
  selection,
  pools,
  fields,
  onBranchChange,
  onFieldChange,
}: SibkoPanelProps) {
  const prefix = useId();
  return (
    <section
      aria-label="Sibko training"
      className="flex flex-col gap-4 border-t border-hud-line pt-3"
    >
      <ChoiceSelect
        id={`${prefix}-branch`}
        label="Sibko branch"
        value={selection?.branch ?? ""}
        options={branches.map((branch) => ({
          value: branch.name,
          label: branch.name,
        }))}
        description="Changing branch clears both field pools and flex allocations. Your inherited phenotype does not change."
        onChange={(value) => onBranchChange(value || null)}
      />
      {pools && selection && (
        <>
          {(["basic", "advanced"] as const).map((poolName) => {
            const pool = pools[poolName];
            const title = poolName === "basic" ? "Basic" : "Advanced";
            const remaining =
              fields?.status === "complete"
                ? fields[
                    poolName === "basic"
                      ? "basicRemaining"
                      : "advancedRemaining"
                  ]
                : pool.budgetXp;
            return (
              <fieldset
                key={poolName}
                className="min-w-0 border-t border-hud-line pt-3"
              >
                <legend className="px-1 font-mono text-xs text-hud-muted">
                  {title} fields
                </legend>
                <p className="mb-3 text-sm text-hud-muted">
                  {title} field XP remaining: {remaining} XP / {pool.budgetXp}{" "}
                  XP. Each selected field grants {pool.stepXp} XP.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {pool.groups.map((group) => {
                    const current =
                      selection[poolName].find(
                        (field) => field.groupId === group.id,
                      )?.skill ?? "";
                    return (
                      <ChoiceSelect
                        key={group.id}
                        id={`${prefix}-${poolName}-${encodeURIComponent(group.id)}`}
                        label={`${title} field — ${group.id}`}
                        value={current}
                        options={group.skills.map((skill) => {
                          const proposed = {
                            ...selection,
                            [poolName]: [
                              ...selection[poolName].filter(
                                (field) => field.groupId !== group.id,
                              ),
                              { groupId: group.id, skill },
                            ],
                          };
                          return {
                            value: skill,
                            label: skill,
                            disabled:
                              (current !== "" && current !== skill) ||
                              resolveSibkoFields(
                                pools.basic,
                                pools.advanced,
                                proposed,
                              ).status === "invalid",
                          };
                        })}
                        description={
                          group.skills.length > 1
                            ? "Choose at most one alternative. Clear the selection before choosing a different alternative."
                            : "Optional field. Clear the selection to return its points to this pool."
                        }
                        onChange={(value) =>
                          onFieldChange(poolName, group.id, value || null)
                        }
                      />
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          <p className="text-sm text-hud-muted">
            Unused field XP does not transfer to another pool or to flex. Next
            accepts the currently displayed field selections, including empty or
            partial pools.
          </p>
          <p className="font-mono text-sm text-hud-text">
            Pending Stage 3 rebate:{" "}
            {fields?.status === "complete" ? fields.rebateXp : 0} XP
          </p>
          <p className="text-xs text-hud-muted">
            The rebate is credited to Wizard XP only when entering Stage 3.
            Returning here removes that credit without clearing these fields.
          </p>
        </>
      )}
    </section>
  );
}
