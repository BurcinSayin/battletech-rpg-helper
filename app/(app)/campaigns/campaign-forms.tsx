"use client";

import { useState, useTransition } from "react";
import { HudButton, hudInput } from "@/components/characters/ui";
import { createCampaign, joinCampaign } from "@/app/(app)/campaigns/actions";

/**
 * Create and join forms. A client component because the join form renders the
 * PT404 miss inline (AC 3) rather than navigating to an error page; the actions
 * themselves redirect on success and so never return.
 */
export function CampaignForms() {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    startTransition(async () => {
      const result = await createCampaign({ name });
      if (result) setCreateError(result.message);
    });
  }

  function onJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError(null);
    startTransition(async () => {
      const result = await joinCampaign({ inviteCode });
      if (result) setJoinError(result.message);
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <form
        onSubmit={onCreate}
        className="rounded-lg border border-hud-line bg-hud-panel p-4"
      >
        <label htmlFor="campaign-name" className="text-sm font-medium text-hud-text">
          Create a campaign
        </label>
        <p className="mt-1 text-xs text-hud-muted">You&rsquo;ll be its GM.</p>
        <div className="mt-3 flex gap-2">
          <input
            id="campaign-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Wolf's Dragoons"
            maxLength={100}
            className={hudInput}
          />
          <HudButton type="submit" variant="primary" disabled={isPending}>
            Create
          </HudButton>
        </div>
        {createError && (
          <p role="alert" className="mt-2 text-sm text-hud-red">
            {createError}
          </p>
        )}
      </form>

      <form
        onSubmit={onJoin}
        className="rounded-lg border border-hud-line bg-hud-panel p-4"
      >
        <label htmlFor="invite-code" className="text-sm font-medium text-hud-text">
          Join a campaign
        </label>
        <p className="mt-1 text-xs text-hud-muted">
          Ask your GM for the 8-character invite code.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            id="invite-code"
            name="inviteCode"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="A1B2C3D4"
            maxLength={8}
            className={`${hudInput} font-mono uppercase tracking-widest`}
          />
          <HudButton type="submit" disabled={isPending}>
            Join
          </HudButton>
        </div>
        {joinError && (
          <p role="alert" className="mt-2 text-sm text-hud-red">
            {joinError}
          </p>
        )}
      </form>
    </div>
  );
}
