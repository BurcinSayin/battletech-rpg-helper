"use client";

import { useState, useTransition } from "react";
import { HudButton, hudInput } from "@/components/characters/ui";
import { deleteCampaign, leaveCampaign } from "@/app/(app)/campaigns/actions";

/**
 * GM and player controls for a campaign. `isGm` is a *display* decision only —
 * `campaigns_delete_gm` (init.sql:185-187) and the server action's own GM refusal
 * are the authority (P1). Both destructive controls use a two-step in-page
 * confirmation rather than `window.confirm`, which does not match the HUD kit and
 * would need a Playwright dialog handler.
 */
export function CampaignControls({
  campaignId,
  inviteCode,
  isGm,
}: {
  campaignId: string;
  inviteCode: string;
  isGm: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: false; message: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result) {
        setError(result.message);
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {isGm && (
        <div className="flex items-center gap-2">
          <label htmlFor="invite-code-display" className="text-xs uppercase tracking-wider text-hud-muted">
            Invite code
          </label>
          <input
            id="invite-code-display"
            readOnly
            value={inviteCode}
            className={`${hudInput} w-32 font-mono tracking-widest`}
          />
        </div>
      )}

      {!confirming ? (
        <HudButton type="button" onClick={() => setConfirming(true)} disabled={isPending}>
          {isGm ? "Delete campaign" : "Leave campaign"}
        </HudButton>
      ) : (
        <div className="rounded-lg border border-hud-red/40 bg-hud-red/10 p-3 text-sm">
          <p className="text-hud-text">
            {isGm ? (
              <>
                Deleting removes the campaign. Members&rsquo; characters are{" "}
                <strong>detached, not deleted</strong>.
              </>
            ) : (
              <>
                Leaving detaches your characters from this campaign first, so the GM
                loses access to them.
              </>
            )}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <HudButton
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Cancel
            </HudButton>
            <HudButton
              type="button"
              variant="primary"
              disabled={isPending}
              onClick={() =>
                run(() => (isGm ? deleteCampaign(campaignId) : leaveCampaign(campaignId)))
              }
            >
              {isGm ? "Confirm delete" : "Confirm leave"}
            </HudButton>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-hud-red">
          {error}
        </p>
      )}
    </div>
  );
}
