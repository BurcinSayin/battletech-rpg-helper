"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BtccDraft } from "@/lib/btcc/types";
import {
  ATTRIBUTE_KEYS,
  catalogSkillNames,
  catalogTraitNames,
  catalogWarnings,
  characterFormSchema,
  computeXp,
  draftToForm,
  formToDraft,
  type CharacterFormValues,
} from "@/lib/characters";
import { saveCharacter } from "@/app/(app)/characters/actions";
import { CharacterSheet } from "@/components/characters/character-sheet";
import { ConflictDialog } from "@/components/characters/conflict-dialog";
import { CatalogWarningBanner } from "@/components/characters/warnings";
import { HudButton, Panel, Stepper, hudInput } from "@/components/characters/ui";

export function CharacterEditor({
  id,
  version,
  draft,
}: {
  id: string;
  version: number;
  draft: BtccDraft;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const skillOptions = useMemo(() => catalogSkillNames(), []);
  const traitOptions = useMemo(() => catalogTraitNames(), []);

  const form = useForm<CharacterFormValues>({
    resolver: zodResolver(characterFormSchema),
    defaultValues: draftToForm(draft),
  });
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = form;

  // Re-sync the form whenever the server hands us a new row (after save/reload).
  useEffect(() => {
    reset(draftToForm(draft));
  }, [draft, reset]);

  const skills = useFieldArray({ control, name: "skills" });
  const traits = useFieldArray({ control, name: "traits" });

  const liveDraft = formToDraft(draft, watch());
  const xp = computeXp(liveDraft);
  const warnings = catalogWarnings(liveDraft);

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await saveCharacter(id, version, values);
      if (result.ok) {
        setIsEditing(false);
        router.refresh();
      } else if (result.kind === "conflict") {
        setConflict(true);
      } else {
        setServerError(result.message);
      }
    });
  });

  function cancelEdit() {
    reset(draftToForm(draft));
    setServerError(null);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <CharacterSheet draft={draft} xp={xp} warnings={warnings} onEdit={() => setIsEditing(true)} />
    );
  }

  const spentPct =
    xp.budget > 0 ? Math.min(100, Math.max(0, (xp.spent / xp.budget) * 100)) : 0;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-hud-text">Edit character</h1>
        <div className="flex gap-2">
          <HudButton type="button" variant="ghost" onClick={cancelEdit} disabled={isPending}>
            Cancel
          </HudButton>
          <HudButton type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </HudButton>
        </div>
      </header>

      {serverError && <p className="text-sm text-hud-red">{serverError}</p>}
      <CatalogWarningBanner warnings={warnings} />

      <Panel title="Experience">
        <div className="flex items-baseline justify-between font-mono text-sm">
          <span className="text-hud-text">{xp.spent.toLocaleString()} spent</span>
          <span className="text-hud-muted">{xp.remaining.toLocaleString()} left</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hud-raised">
          <div className="h-full bg-hud-amber" style={{ width: `${spentPct}%` }} />
        </div>
        <p className="mt-2 font-mono text-xs text-hud-muted">
          attributes {xp.byCategory.attributes} · skills {xp.byCategory.skills} · traits{" "}
          {xp.byCategory.traits}
        </p>
      </Panel>

      <Panel title="Basic info">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label="Name" error={errors.scalars?.name?.message}>
            <input className={hudInput} {...register("scalars.name")} />
          </Labeled>
          <Labeled label="Affiliation">
            <input className={hudInput} {...register("scalars.aff")} />
          </Labeled>
          <Labeled label="Sub-affiliation">
            <input className={hudInput} {...register("scalars.subaff")} />
          </Labeled>
          <Labeled label="Sex">
            <input className={hudInput} {...register("scalars.sex")} />
          </Labeled>
        </div>
      </Panel>

      <Panel title="Attributes">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ATTRIBUTE_KEYS.map((key) => (
            <Controller
              key={key}
              control={control}
              name={`attributes.${key}`}
              render={({ field }) => (
                <Stepper label={key} value={field.value} onChange={field.onChange} />
              )}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Skills"
        count={`${skills.fields.length} total`}
        action={
          <HudButton type="button" onClick={() => skills.append({ name: "", xp: 0 })}>
            + Add skill
          </HudButton>
        }
      >
        <RowList
          fields={skills.fields}
          remove={skills.remove}
          register={register}
          name="skills"
          datalistId="skill-options"
          options={skillOptions}
          errors={errors.skills as unknown as RowError[] | undefined}
        />
      </Panel>

      <Panel
        title="Traits"
        count={`${traits.fields.length} total`}
        action={
          <HudButton type="button" onClick={() => traits.append({ name: "", xp: 0 })}>
            + Add trait
          </HudButton>
        }
      >
        <RowList
          fields={traits.fields}
          remove={traits.remove}
          register={register}
          name="traits"
          datalistId="trait-options"
          options={traitOptions}
          errors={errors.traits as unknown as RowError[] | undefined}
        />
      </Panel>

      <Panel title="Vitals">
        <div className="grid gap-3 sm:grid-cols-3">
          <Labeled label="Age">
            <input type="number" className={hudInput} {...register("scalars.age", { valueAsNumber: true })} />
          </Labeled>
          <Labeled label="Height (cm)">
            <input type="number" className={hudInput} {...register("scalars.height", { valueAsNumber: true })} />
          </Labeled>
          <Labeled label="Weight (kg)">
            <input type="number" className={hudInput} {...register("scalars.weight", { valueAsNumber: true })} />
          </Labeled>
          <Labeled label="Hair">
            <input className={hudInput} {...register("scalars.haircolor")} />
          </Labeled>
          <Labeled label="Eyes">
            <input className={hudInput} {...register("scalars.eyecolor")} />
          </Labeled>
        </div>
      </Panel>

      <Panel title="Notes">
        <textarea
          rows={6}
          className={`${hudInput} resize-y font-mono`}
          {...register("notes")}
        />
      </Panel>

      {conflict && (
        <ConflictDialog
          onReload={() => {
            setConflict(false);
            setIsEditing(false);
            router.refresh();
          }}
          onKeepEditing={() => setConflict(false)}
        />
      )}
    </form>
  );
}

function Labeled({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase tracking-widest text-hud-muted">
        {label}
      </span>
      {children}
      {error && <span className="text-xs text-hud-red">{error}</span>}
    </label>
  );
}

type RowError = { name?: { message?: string } } | undefined;

type RowListProps = {
  fields: { id: string }[];
  remove: (index: number) => void;
  register: ReturnType<typeof useForm<CharacterFormValues>>["register"];
  name: "skills" | "traits";
  datalistId: string;
  options: string[];
  errors?: RowError[];
};

function RowList({ fields, remove, register, name, datalistId, options, errors }: RowListProps) {
  if (fields.length === 0) {
    return <p className="text-sm text-hud-muted">None yet — use “+ Add”.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <datalist id={datalistId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <input
            list={datalistId}
            placeholder="Name"
            className={cn(hudInput, "flex-1")}
            {...register(`${name}.${index}.name`)}
          />
          <input
            type="number"
            aria-label="XP"
            className={cn(hudInput, "w-24")}
            {...register(`${name}.${index}.xp`, { valueAsNumber: true })}
          />
          <button
            type="button"
            aria-label="Remove"
            onClick={() => remove(index)}
            className="h-9 w-9 shrink-0 rounded border border-hud-line text-hud-muted hover:border-hud-red hover:text-hud-red"
          >
            ✕
          </button>
          {errors?.[index]?.name?.message && (
            <span className="text-xs text-hud-red">{errors[index]?.name?.message}</span>
          )}
        </div>
      ))}
    </div>
  );
}
