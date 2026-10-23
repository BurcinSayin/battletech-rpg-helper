"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
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
import type { MechData } from "@/lib/mech/types";
import {
  emptyMechDamage,
  hasMechSpecificDamage,
  resetMechDamage,
  sameMechDamage,
  type MechDamage,
} from "@/lib/mech/damage";
import { saveCharacter } from "@/app/(app)/characters/actions";
import { CharacterSheet } from "@/components/characters/character-sheet";
import { MechTab, MechView } from "@/components/characters/mech-tab";
import { EquipmentTab } from "@/components/characters/equipment-tab";
import { CombatLoadout } from "@/components/characters/combat-loadout";
import {
  MechDamageBar,
  MechDamageResetWarning,
} from "@/components/characters/mech-damage-bar";
import { applyMechDamage } from "./mech-damage-actions";
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
  mech: MechData | null;
  damage: MechDamage;
};

type DamageDraft = {
  baseVersion: number;
  mech: MechData | null;
  base: MechDamage;
  value: MechDamage;
};

function pendingDamage(draft: DamageDraft): boolean {
  return !sameMechDamage(draft.base, draft.value);
}

type TabId = "sheet" | "equipment" | "mech";

const EMPTY_DAMAGE = emptyMechDamage();

export function CharacterEditor({
  id,
  version,
  draft,
  mech,
  mechDamage = EMPTY_DAMAGE,
  campaigns,
  campaignId,
  isOwner,
}: {
  id: string;
  version: number;
  draft: BtccDraft;
  mech: MechData | null;
  mechDamage?: MechDamage;
  campaigns: { id: string; name: string }[];
  campaignId: string | null;
  isOwner: boolean;
}) {
  const router = useRouter();
  const baseId = useId();
  const [snapshot, setSnapshot] = useState<CharacterSnapshot>({
    version,
    draft,
    campaignId,
    mech,
    damage: mechDamage,
  });
  const latestSnapshotRef = useRef(snapshot);
  const [isEditing, setIsEditing] = useState(false);
  const [tab, setTab] = useState<TabId>("sheet");
  // The unsaved mech draft. Lives outside RHF because MechTab is a controlled
  // component; it is re-seeded from the snapshot on every beginEdit.
  const [mechDraft, setMechDraft] = useState<MechData | null>(mech);
  const [isPending, startTransition] = useTransition();
  const [damageDraft, setDamageDraft] = useState<DamageDraft | null>(null);
  const [damageError, setDamageError] = useState<string | null>(null);
  const [damageConflict, setDamageConflict] = useState(false);
  const [isApplying, startDamageTransition] = useTransition();
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
  const damagePending = damageDraft !== null && pendingDamage(damageDraft);
  const damageStale =
    damagePending &&
    !isApplying &&
    (damageConflict ||
      Math.max(snapshot.version, remoteVersion ?? 0) > damageDraft.baseVersion);
  const viewMech = damageDraft ? damageDraft.mech : snapshot.mech;
  const viewDamage = damageDraft ? damageDraft.value : snapshot.damage;
  const damageControlsDisabled = isApplying || damageStale || isPending;

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
    setValue,
    formState: { errors },
  } = form;

  const adoptSnapshot = useCallback(
    (next: CharacterSnapshot): void => {
      setSnapshot(next);
      // A pending batch stays pinned to its original version and mech. Only an
      // acknowledged, non-pending placeholder can be replaced by fresh props.
      setDamageDraft((current) =>
        current &&
        !pendingDamage(current) &&
        next.version >= current.baseVersion
          ? null
          : current,
      );
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
      latestSnapshotRef.current = {
        version,
        draft,
        campaignId,
        mech,
        damage: mechDamage,
      };
    }
    const next = latestSnapshotRef.current;
    if (isEditing) {
      if (next.version > snapshot.version && next.version > knownVersion) {
        setRemoteVersion((current) => Math.max(current ?? 0, next.version));
      }
    } else if (
      next.version > snapshot.version &&
      next.version >= knownVersion
    ) {
      adoptSnapshot(next);
    }
  }, [
    version,
    draft,
    campaignId,
    mech,
    mechDamage,
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

  const onSubmit = handleSubmit(
    (values) => {
      const baseVersion = snapshot.version;
      const submittedCampaign = selectedCampaign;
      // Send the mech only when the draft differs from the snapshot it was based
      // on. Unchanged (including "no mech, no mech edits") omits the key entirely,
      // so the stored mech is left alone by the RPC.
      const mechChanged = !sameMech(mechDraft, snapshot.mech);
      const submittedMech = mechDraft;
      setServerError(null);
      startTransition(async () => {
        const campaignArg = campaignLocked
          ? undefined
          : { id: submittedCampaign };
        const result = mechChanged
          ? await saveCharacter(
              id,
              baseVersion,
              values,
              campaignArg,
              submittedMech,
            )
          : campaignLocked
            ? await saveCharacter(id, baseVersion, values)
            : await saveCharacter(id, baseVersion, values, campaignArg);
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
          // The saved mech arrives with the refreshed row (page props), exactly
          // like the saved fields; it is adopted with the snapshot below or by
          // the layout effect when the props land.
          const next = latestSnapshotRef.current;
          if (next.version >= result.version) adoptSnapshot(next);
          router.refresh();
        } else if (result.kind === "conflict") {
          setConflict(true);
        } else {
          setServerError(result.message);
        }
      });
    },
    (invalid) =>
      setTab(
        invalid.equip ||
          invalid.weapons ||
          invalid.equipLoc ||
          invalid.chrWeapons
          ? "equipment"
          : "sheet",
      ),
  );

  function openEquipment(): void {
    setTab("equipment");
    document.getElementById(tabIds(baseId, "equipment").tab)?.focus();
  }

  function beginEdit(): void {
    if (
      isPending ||
      knownVersion > snapshot.version ||
      damagePending ||
      isApplying
    )
      return;
    reset(draftToForm(snapshot.draft));
    setSelectedCampaign(snapshot.campaignId);
    setMechDraft(snapshot.mech);
    setServerError(null);
    setConflict(false);
    setDismissedRemoteVersion(null);
    isEditingRef.current = true;
    setIsEditing(true);
  }

  function changeDamage(value: MechDamage): void {
    if (damageControlsDisabled || isEditing || viewMech === null) return;
    setDamageError(null);
    setDamageDraft((current) => ({
      ...(current ?? {
        baseVersion: snapshot.version,
        mech: snapshot.mech,
        base: snapshot.damage,
      }),
      value,
    }));
  }

  function applyDamage(): void {
    if (!damageDraft || !damagePending || damageControlsDisabled) return;
    const submitted = damageDraft;
    setDamageError(null);
    startDamageTransition(async () => {
      const result = await applyMechDamage(
        id,
        submitted.baseVersion,
        submitted.value,
      );
      if (result.ok) {
        setKnownVersion((current) => Math.max(current, result.version));
        setRemoteVersion((current) =>
          current !== null && current > result.version ? current : null,
        );
        setDamageDraft({
          baseVersion: result.version,
          mech: submitted.mech,
          base: result.damage,
          value: result.damage,
        });
        setDamageError(null);
        setDamageConflict(false);
        const next = latestSnapshotRef.current;
        if (next.version >= result.version) adoptSnapshot(next);
        router.refresh();
      } else if (result.kind === "conflict") {
        setDamageConflict(true);
      } else {
        setDamageError(result.message);
      }
    });
  }

  function discardDamage(): void {
    if (isApplying) return;
    setDamageDraft(null);
    setDamageError(null);
    setDamageConflict(false);
    if ((remoteVersion ?? 0) > snapshot.version || damageConflict)
      router.refresh();
  }

  function finishEditing(reload: boolean): void {
    if (isPending) return;
    const latest = latestSnapshotRef.current;
    const next =
      latest.version > snapshot.version && latest.version >= knownVersion
        ? latest
        : snapshot;
    adoptSnapshot(next);
    setMechDraft(next.mech);
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabList baseId={baseId} value={tab} onChange={setTab} />
          <div className="flex items-center gap-2">
            {(damagePending || isApplying) && (
              <span
                id={`${baseId}-damage-edit-hint`}
                className="font-mono text-xs text-hud-amber"
              >
                Apply or discard damage first
              </span>
            )}
            {knownVersion > snapshot.version || isPending ? (
              <HudButton variant="primary" disabled>
                Refreshing…
              </HudButton>
            ) : (
              <HudButton
                variant="primary"
                onClick={beginEdit}
                disabled={damagePending || isApplying}
                aria-describedby={
                  damagePending || isApplying
                    ? `${baseId}-damage-edit-hint`
                    : undefined
                }
              >
                Edit
              </HudButton>
            )}
          </div>
        </div>
        {/* Wrappers carry no display class so the `hidden` attribute applies. */}
        <div
          role="tabpanel"
          id={tabIds(baseId, "sheet").panel}
          aria-labelledby={tabIds(baseId, "sheet").tab}
          hidden={tab !== "sheet"}
        >
          <CharacterSheet
            draft={snapshot.draft}
            xp={xp}
            warnings={warnings}
            onOpenEquipment={openEquipment}
            // The header action lives in the tab bar so Edit stays reachable on
            // the Mech tab; an empty fragment suppresses the sheet's own button.
            actions={<></>}
          />
        </div>
        <div
          role="tabpanel"
          id={tabIds(baseId, "equipment").panel}
          aria-labelledby={tabIds(baseId, "equipment").tab}
          hidden={tab !== "equipment"}
        >
          <EquipmentTab value={snapshot.draft} />
        </div>
        <div
          role="tabpanel"
          id={tabIds(baseId, "mech").panel}
          aria-labelledby={tabIds(baseId, "mech").tab}
          hidden={tab !== "mech"}
        >
          <MechView
            mech={viewMech}
            pilot={snapshot.draft}
            damage={viewDamage}
            onDamageChange={viewMech === null ? undefined : changeDamage}
            controlsDisabled={damageControlsDisabled}
          />
          {viewMech !== null && (
            <MechDamageBar
              pending={damagePending}
              applying={isApplying}
              stale={damageStale}
              error={damageError}
              canReset={
                !sameMechDamage(resetMechDamage(viewDamage), viewDamage)
              }
              onApply={applyDamage}
              onDiscard={discardDamage}
              onReset={() => changeDamage(resetMechDamage(viewDamage))}
            />
          )}
        </div>
      </div>
    );
  }

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

      <TabList baseId={baseId} value={tab} onChange={setTab} />

      {/*
        Hidden, not unmounted: RHF fields and staged inventory inputs survive
        tab switches without committing or canceling the draft.
      */}
      <div
        role="tabpanel"
        id={tabIds(baseId, "sheet").panel}
        aria-labelledby={tabIds(baseId, "sheet").tab}
        hidden={tab !== "sheet"}
      >
        <div className="mb-4">
          <CombatLoadout value={liveDraft} onOpenEquipment={openEquipment} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-4">
            <Panel title="Experience">
              <dl className="flex items-baseline justify-between font-mono text-sm">
                <div className="flex items-baseline gap-2">
                  <dt className="text-xs text-hud-muted">Remaining XP</dt>
                  <dd className="text-hud-text">
                    {xp.remaining.toLocaleString()}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2">
                  <dt className="text-xs text-hud-muted">Total XP</dt>
                  <dd className="text-hud-text">
                    {xp.budget.toLocaleString()}
                  </dd>
                </div>
              </dl>
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
                    onChange={(e) =>
                      setSelectedCampaign(e.target.value || null)
                    }
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
                  <input
                    className={hudInput}
                    {...register("scalars.eyecolor")}
                  />
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
      </div>

      <div
        role="tabpanel"
        id={tabIds(baseId, "equipment").panel}
        aria-labelledby={tabIds(baseId, "equipment").tab}
        hidden={tab !== "equipment"}
      >
        {(errors.equip ||
          errors.weapons ||
          errors.equipLoc ||
          errors.chrWeapons) && (
          <p role="alert" className="mb-3 text-sm text-hud-red">
            Inventory fields are invalid. Reload the character or correct the
            inventory before saving.
          </p>
        )}
        <EquipmentTab
          value={liveDraft}
          disabled={isPending}
          onChange={(next) => {
            const options = { shouldDirty: true, shouldValidate: true };
            setValue("equip", next.equip, options);
            setValue("weapons", next.weapons, options);
            setValue("equipLoc", next.equipLoc, options);
            setValue("chrWeapons", next.chrWeapons, options);
          }}
        />
      </div>

      <div
        role="tabpanel"
        id={tabIds(baseId, "mech").panel}
        aria-labelledby={tabIds(baseId, "mech").tab}
        hidden={tab !== "mech"}
      >
        {snapshot.mech !== null &&
          !sameMech(mechDraft, snapshot.mech) &&
          hasMechSpecificDamage(snapshot.damage) && <MechDamageResetWarning />}
        <MechTab
          value={mechDraft}
          onChange={setMechDraft}
          disabled={isPending}
        />
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

function tabIds(baseId: string, tab: TabId) {
  return { tab: `${baseId}-tab-${tab}`, panel: `${baseId}-panel-${tab}` };
}

const TAB_IDS: readonly TabId[] = ["sheet", "equipment", "mech"];
const TAB_LABELS: Record<TabId, string> = {
  sheet: "Sheet",
  equipment: "Equipment",
  mech: "Mech",
};

/** Roving tabindex with arrow/Home/End keys (WAI-ARIA tabs). */
function TabList({
  baseId,
  value,
  onChange,
}: {
  baseId: string;
  value: TabId;
  onChange: (next: TabId) => void;
}) {
  const buttons = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const last = TAB_IDS.length - 1;
    const current = TAB_IDS.indexOf(value);
    let target: number;
    switch (event.key) {
      case "ArrowRight":
        target = current === last ? 0 : current + 1;
        break;
      case "ArrowLeft":
        target = current === 0 ? last : current - 1;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = TAB_IDS[target];
    if (next === undefined) return;
    onChange(next);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Character sections"
      onKeyDown={onKeyDown}
      className="flex w-full min-w-0 flex-1 gap-1 border-b border-hud-line sm:w-auto sm:flex-none"
    >
      {TAB_IDS.map((tab) => {
        const selected = tab === value;
        return (
          <button
            key={tab}
            ref={(element) => {
              buttons.current[tab] = element;
            }}
            type="button"
            role="tab"
            id={tabIds(baseId, tab).tab}
            aria-controls={tabIds(baseId, tab).panel}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            className={cn(
              "-mb-px min-h-11 flex-1 border-b-2 px-4 font-mono text-xs uppercase tracking-[0.2em] transition sm:flex-none",
              selected
                ? "border-hud-amber text-hud-amber"
                : "border-transparent text-hud-muted hover:text-hud-text",
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Structural equality for the mech draft vs. its snapshot. Object keys whose
 * value is `undefined` count as absent (an optional field left unset).
 */
function sameMech(a: MechData | null, b: MechData | null): boolean {
  return jsonEqual(a, b);
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left).filter((k) => left[k] !== undefined);
  const rightKeys = Object.keys(right).filter((k) => right[k] !== undefined);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((k) => jsonEqual(left[k], right[k]))
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
