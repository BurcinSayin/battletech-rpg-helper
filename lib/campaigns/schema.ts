import { z } from "zod";

// Campaign form shapes. Both mirror a database constraint so the client rejects
// what the DB would reject anyway — the DB remains authoritative (CLAUDE.md).

/** `campaigns.name` is `char_length(name) between 1 and 100` (init.sql:32). */
export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
});

/**
 * `generate_invite_code()` emits 8 uppercase hex characters (init.sql:19-27), so
 * a code is normalized (trimmed, upper-cased) before the shape is checked — users
 * paste them in whatever case they were given.
 */
export const joinCampaignSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-F]{8}$/, "Invite codes are 8 characters"),
});

export type CreateCampaignValues = z.infer<typeof createCampaignSchema>;
export type JoinCampaignValues = z.infer<typeof joinCampaignSchema>;
