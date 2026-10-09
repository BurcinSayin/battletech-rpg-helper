"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
  skillLevel,
  type CharacterFormValues,
} from "@/lib/characters";
import { saveCharacter } from "@/app/(app)/characters/actions";
import { CharacterSheet } from "@/components/characters/character-sheet";
import { useCharacterRealtime } from "./use-character-realtime";
import { ConflictDialog } from "@/components/characters/conflict-dialog";
import { RemoteChangeBanner } from "@/components/characters/remote-change-banner";
import { CatalogWarningBanner } from "@/components/characters/warnings";
import {
  HudButton,
  Panel,
  Stepper,
  hudInput,
} from "@/components/characters/ui";

type CharacterSnapshot = {
  version: number;
  draft: BtccDraft;
  campaignId: string | null;
};

export function CharacterEditor({
  id,
  version,
  draft,
  campaigns,
  campaignId,
  isOwner,
}: {
  id: string;
  version: number;
  draft: BtccDraft;
  campaigns: { id: string; name: string }[];
  campaignId: string | null;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<CharacterSnapshot>({
    version,
    draft,
    campaignId,
  });
  const latestSnapshotRef = useRef(snapshot);
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<number | null>(null);
  const [dismissedRemoteVersion, setDismissedRemoteVersion] = useState<
    number | null
  >(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(
    campaignId,
  );

  // Acknowledged versions suppress own-save echoes, but never rebase an edit.
  const [knownVersion, setKnownVersion] = useState(version);

  // A layout effect, not a passive one: a passive effect can be deferred past a
  // later task, so a websocket message could read a stale `false` and refresh the
  // page mid-edit.
  const isEditingRef = useRef(isEditing);
  useLayoutEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useCharacterRealtime({
    id,
    version: knownVersion,
    onRemoteVersion: (next) => {
      if (next <= knownVersion) return;
      setRemoteVersion((current) => Math.max(current ?? 0, next));
      if (!isEditingRef.current) router.refresh();
    },
  });

  // The character sits in a campaign this user can no longer see: offer no way to
  // change it, and send no campaign argument on save.
  const campaignUnreadable =
    campaignId !== null && !campaigns.some((c) => c.id === campaignId);
  const campaignLocked = !isOwner || campaignUnreadable;

  const skillOptions = useMemo(() => catalogSkillNames(), []);
  const traitOptions = useMemo(() => catalogTraitNames(), []);

  const form = useForm<CharacterFormValues>({
    resolver: zodResolver(characterFormSchema),
    defaultValues: draftToForm(snapshot.draft),
  });
  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = form;

  const adoptSnapshot = useCallback(
    (next: CharacterSnapshot): void => {
      setSnapshot(next);
      reset(draftToForm(next.draft));
      setSelectedCampaign(next.campaignId);
      setKnownVersion((current) => Math.max(current, next.version));
      setRemoteVersion((current) =>
        current !== null && current > next.version ? current : null,
      );
      setDismissedRemoteVersion((current) =>
        current !== null && current > next.version ? current : null,
      );
    },
    [reset],
  );

  const skills = useFieldArray({ control, name: "skills" });
  const traits = useFieldArray({ control, name: "traits" });

  useLayoutEffect(() => {
    if (version > latestSnapshotRef.current.version) {
      latestSnapshotRef.current = { version, draft, campaignId };
    }
    const next = latestSnapshotRef.current;
    if (isEditing) {
      if (next.version > snapshot.version && next.version > knownVersion) {
        setRemoteVersion((current) => Math.max(current ?? 0, next.version));
      }
    } else if (next.version > snapshot.version && next.version >= knownVersion) {
      adoptSnapshot(next);
    }
  }, [
    version,
    draft,
    campaignId,
    isEditing,
    snapshot.version,
    knownVersion,
    adoptSnapshot,
  ]);

  const liveDraft = isEditing
    ? formToDraft(snapshot.draft, watch())
    : snapshot.draft;
  const xp = computeXp(liveDraft);
  const warnings = catalogWarnings(liveDraft);

  const onSubmit = handleSubmit((values) => {
    const baseVersion = snapshot.version;
    const submittedCampaign = selectedCampaign;
    setServerError(null);
    startTransition(async () => {
      const result = campaignLocked
        ? await saveCharacter(id, baseVersion, values)
        : await saveCharacter(id, baseVersion, values, {
            id: submittedCampaign,
          });
      if (result.ok) {
        setKnownVersion((current) => Math.max(current, result.version));
        setRemoteVersion((current) =>
          current !== null && current > result.version ? current : null,
        );
        setServerError(null);
        setConflict(false);
        setDismissedRemoteVersion(null);
        isEditingRef.current = false;
        setIsEditing(false);
        const next = latestSnapshotRef.current;
        if (next.version >= result.version) adoptSnapshot(next);
        router.refresh();
      } else if (result.kind === "conflict") {
        setConflict(true);
      } else {
        setServerError(result.message);
      }
    });
  });

  function beginEdit(): void {
    if (isPending || knownVersion > snapshot.version) return;
    reset(draftToForm(snapshot.draft));
    setSelectedCampaign(snapshot.campaignId);
    setServerError(null);
    setConflict(false);
    setDismissedRemoteVersion(null);
    isEditingRef.current = true;
    setIsEditing(true);
  }

  function finishEditing(reload: boolean): void {
    if (isPending) return;
    const latest = latestSnapshotRef.current;
    const next =
      latest.version > snapshot.version && latest.version >= knownVersion
        ? latest
        : snapshot;
    adoptSnapshot(next);
    setServerError(null);
    setConflict(false);
    setDismissedRemoteVersion(null);
    isEditingRef.current = false;
    setIsEditing(false);
    if (reload || (remoteVersion !== null && remoteVersion > latest.version)) {
      router.refresh();
    }
  }

  if (!isEditing) {
    return (
      <CharacterSheet
        draft={snapshot.draft}
        xp={xp}
        warnings={warnings}
        onEdit={beginEdit}
        actions={
          knownVersion > snapshot.version || isPending ? (
            <HudButton variant="primary" disabled>
              Refreshing…
            </HudButton>
          ) : undefined
        }
      />
    );
  }

  const spentPct =
    xp.budget > 0
      ? Math.min(100, Math.max(0, (xp.spent / xp.budget) * 100))
      : 0;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {remoteVersion !== null &&
        remoteVersion > snapshot.version &&
        remoteVersion > (dismissedRemoteVersion ?? 0) && (
          <RemoteChangeBanner
            onReload={() => finishEditing(true)}
            onDismiss={() => setDismissedRemoteVersion(remoteVersion)}
          />
        )}
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-hud-text">Edit character</h1>
        <div className="flex gap-2">
          <HudButton
            type="button"
            variant="ghost"
            onClick={() => finishEditing(false)}
            disabled={isPending}
          >
            Cancel
          </HudButton>
          <HudButton type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </HudButton>
        </div>
      </header>

      {serverError && <p className="text-sm text-hud-red">{serverError}</p>}
      <CatalogWarningBanner warnings={warnings} />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <Panel title="Experience">
            <div className="flex items-baseline justify-between font-mono text-sm">
              <span className="text-hud-text">
                {xp.spent.toLocaleString()} spent
              </span>
              <span className="text-hud-muted">
                {xp.remaining.toLocaleString()} left
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hud-raised">
              <div
                className="h-full bg-hud-amber"
                style={{ width: `${spentPct}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-xs text-hud-muted">
              attributes {xp.byCategory.attributes} · skills{" "}
              {xp.byCategory.skills} · traits {xp.byCategory.traits}
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
              <Labeled label="Campaign">
                <select
                  aria-label="Campaign"
                  className={hudInput}
                  disabled={campaignLocked}
                  value={selectedCampaign ?? ""}
                  onChange={(e) => setSelectedCampaign(e.target.value || null)}
                >
                  <option value="">No campaign</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                {!isOwner && (
                  <p className="mt-1 text-xs text-hud-muted">
                    Only the character&rsquo;s owner can change its campaign.
                  </p>
                )}
                {isOwner && campaignUnreadable && (
                  <p className="mt-1 text-xs text-hud-muted">
                    You&rsquo;re no longer in this character&rsquo;s campaign.
                  </p>
                )}
              </Labeled>
            </div>
          </Panel>

          <Panel title="Attributes">
            <p className="mb-3 text-xs text-hud-muted">
              Raw attribute XP (100 XP per level).
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ATTRIBUTE_KEYS.map((key) => (
                <Controller
                  key={key}
                  control={control}
                  name={`attributes.${key}`}
                  render={({ field }) => (
                    <Stepper
                      label={key}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              ))}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel
            title="Skills"
            count={`${skills.fields.length} total`}
            action={
              <HudButton
                type="button"
                onClick={() => skills.append({ name: "", xp: 0 })}
              >
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
              levels={liveDraft.skills.map((row) =>
                skillLevel(row.xp, liveDraft.traits),
              )}
            />
          </Panel>

          <Panel
            title="Traits"
            count={`${traits.fields.length} total`}
            action={
              <HudButton
                type="button"
                onClick={() => traits.append({ name: "", xp: 0 })}
              >
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
                <input
                  type="number"
                  className={hudInput}
                  {...register("scalars.age", { valueAsNumber: true })}
                />
              </Labeled>
              <Labeled label="Height (cm)">
                <input
                  type="number"
                  className={hudInput}
                  {...register("scalars.height", { valueAsNumber: true })}
                />
              </Labeled>
              <Labeled label="Weight (kg)">
                <input
                  type="number"
                  className={hudInput}
                  {...register("scalars.weight", { valueAsNumber: true })}
                />
              </Labeled>
              <Labeled label="Hair">
                <input
                  className={hudInput}
                  {...register("scalars.haircolor")}
                />
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
        </div>
      </div>

      {conflict && (
        <ConflictDialog
          onReload={() => finishEditing(true)}
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
  levels?: number[];
};

function RowList({
  fields,
  remove,
  register,
  name,
  datalistId,
  options,
  errors,
  levels,
}: RowListProps) {
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
        <div key={field.id} className="flex flex-wrap items-center gap-2">
          <input
            list={datalistId}
            placeholder="Name"
            className={cn(hudInput, "min-w-0 flex-1 basis-32")}
            {...register(`${name}.${index}.name`)}
          />
          <input
            type="number"
            aria-label="XP"
            className={cn(hudInput, "w-24")}
            {...register(`${name}.${index}.xp`, { valueAsNumber: true })}
          />
          {levels && (
            <span className="whitespace-nowrap font-mono text-sm text-hud-muted">
              Level {levels[index]}
            </span>
          )}
          <button
            type="button"
            aria-label="Remove"
            onClick={() => remove(index)}
            className="h-9 w-9 shrink-0 rounded border border-hud-line text-hud-muted hover:border-hud-red hover:text-hud-red"
          >
            ✕
          </button>
          {errors?.[index]?.name?.message && (
            <span className="text-xs text-hud-red">
              {errors[index]?.name?.message}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
