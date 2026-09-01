"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  classifyJoinError,
  createCampaignSchema,
  joinCampaignSchema,
} from "@/lib/campaigns";

// Expected failures come back as a typed union so the forms can render them;
// only unexpected ones are logged with a bracketed prefix and generalized
// (app/(app)/AGENTS.md:78).
export type CampaignActionResult = { ok: false; message: string };

/** How many detach passes `leaveCampaign` will make before giving up. */
const DETACH_ATTEMPTS = 2;

/**
 * Create a campaign owned by the current user and open it. The `on_campaign_created`
 * trigger (init.sql:87-90) adds the GM membership, so nothing here inserts one.
 */
export async function createCampaign(values: unknown): Promise<CampaignActionResult | void> {
  const parsed = createCampaignSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Enter a campaign name." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("campaigns")
    .insert({ gm_id: user.id, name: parsed.data.name })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[campaigns] create failed:", error?.code, error?.message);
    return { ok: false, message: "Could not create the campaign. Please try again." };
  }

  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
  redirect(`/campaigns/${data.id}`);
}

/**
 * Self-join by invite code. `join_campaign` (init.sql:303-332) only ever inserts the
 * caller as 'player', and raises PT404 for a code that matches no campaign.
 */
export async function joinCampaign(values: unknown): Promise<CampaignActionResult | void> {
  const parsed = joinCampaignSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Invite codes are 8 characters." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // `join_campaign` RETURNS public.campaigns — a single composite, already typed as
  // one object (database.types.ts:174-184), so no `.single()` here.
  const { data, error } = await supabase.rpc("join_campaign", {
    p_invite_code: parsed.data.inviteCode,
  });

  if (error) {
    if (classifyJoinError(error) === "not-found") {
      return { ok: false, message: "That invite code doesn't match a campaign." };
    }
    console.error("[campaigns] join failed:", error.code, error.message);
    return { ok: false, message: "Could not join. Please try again." };
  }

  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
  redirect(`/campaigns/${data.id}`);
}

/**
 * Delete a campaign. Authorization is `campaigns_delete_gm` (init.sql:185-187) — the
 * absence of a UI control is an affordance, not the security boundary. Members'
 * characters survive and detach via the FK's `on delete set null` (init.sql:54).
 */
export async function deleteCampaign(campaignId: string): Promise<CampaignActionResult | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);
  if (error) {
    console.error("[campaigns] delete failed:", error.code, error.message);
    return { ok: false, message: "Could not delete the campaign. Please try again." };
  }

  revalidatePath("/campaigns");
  revalidatePath("/dashboard");
  redirect("/campaigns");
}

/**
 * Leave a campaign: detach the leaver's characters FIRST, verify none remain, and
 * only then drop the membership row.
 *
 * Ordering is the whole point. `campaign_members` deletion does not touch
 * `characters.campaign_id` — `on delete set null` (init.sql:54) fires only when the
 * *campaign* is deleted — so dropping the membership first would leave the GM holding
 * write access to a departed player's character via `is_campaign_gm(campaign_id)`.
 * Every partial state this function can reach is "still a member, still attached":
 * consistent, retryable, and never orphaned.
 */
export async function leaveCampaign(campaignId: string): Promise<CampaignActionResult | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Guard 0: a GM must not leave their own campaign. `members_delete_self_or_gm`
  // (init.sql:198-200) would permit it and the on_campaign_created trigger only
  // fires on insert, so the membership would never come back — breaking
  // `shares_campaign` (init.sql:148-160) and with it every peer profile read.
  // The DB allows this, so the refusal has to live here, not only in the view.
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("gm_id")
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaign) {
    console.error("[campaigns] leave: campaign lookup failed:", campaignError?.code, campaignError?.message);
    return { ok: false, message: "Could not leave the campaign. Please try again." };
  }
  if (campaign.gm_id === user.id) {
    return {
      ok: false,
      message: "You're the GM of this campaign. Delete it instead of leaving.",
    };
  }

  // Detach every character this user has in the campaign, re-reading between passes
  // so a concurrent GM save (PT409) can be retried rather than lost.
  for (let attempt = 0; attempt < DETACH_ATTEMPTS; attempt += 1) {
    const { data: rows, error: readError } = await supabase
      .from("characters")
      .select("id, version")
      .eq("owner_id", user.id)
      .eq("campaign_id", campaignId);

    if (readError) {
      console.error("[campaigns] leave: read failed:", readError.code, readError.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const { error } = await supabase.rpc("update_character", {
        p_id: row.id,
        p_expected_version: row.version,
        p_payload: { campaign_id: null },
      });
      if (error) {
        console.error("[campaigns] leave: detach retryable:", row.id, error.code, error.message);
      }
    }
  }

  // Gate. `count !== 0` and not `if (count)`: PostgREST types count as
  // `number | null`, and a null count is falsy — writing `if (count)` would fall
  // through to the membership delete and produce the orphan state this exists to
  // prevent. Treating null as failure is the correct bias.
  const { count, error: countError } = await supabase
    .from("characters")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("campaign_id", campaignId);

  if (countError || count !== 0) {
    console.error(
      "[campaigns] leave: detach incomplete, membership kept:",
      campaignId,
      count,
      countError?.code,
      countError?.message,
    );
    return {
      ok: false,
      message: "Couldn't detach all your characters. Nothing was changed — please try again.",
    };
  }

  const { error: deleteError } = await supabase
    .from("campaign_members")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("[campaigns] leave: membership delete failed:", deleteError.code, deleteError.message);
    return { ok: false, message: "Could not leave the campaign. Please try again." };
  }

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/dashboard");
  redirect("/campaigns");
}
