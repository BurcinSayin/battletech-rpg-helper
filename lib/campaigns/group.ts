import type { Database } from "@/lib/supabase/database.types";

export type CampaignRole = Database["public"]["Enums"]["campaign_role"];

/**
 * `profiles.display_name` is nullable (20260629145000_profiles.sql:7) and
 * `auth.users` is not reachable from the client, so a member who skipped the
 * optional display name still needs a label.
 */
export const MEMBER_FALLBACK_NAME = "Unnamed player";

export interface MemberLike {
  user_id: string;
  role: CampaignRole;
}
export interface ProfileLike {
  id: string;
  display_name: string | null;
}
export interface OwnedLike {
  owner_id: string;
}

export interface MemberGroup<C extends OwnedLike> {
  userId: string;
  label: string;
  role: CampaignRole;
  characters: C[];
}

/**
 * Group a campaign's characters under their owner. Every member appears, including
 * those with no characters yet (AC 11), and a character whose owner is missing from
 * the member list is still surfaced rather than silently dropped — that can happen
 * legitimately, e.g. a row read by a GM in the window before a membership is visible.
 */
export function groupCharactersByMember<C extends OwnedLike>(
  members: MemberLike[],
  profiles: ProfileLike[],
  characters: C[],
): MemberGroup<C>[] {
  const labelFor = new Map(profiles.map((p) => [p.id, p.display_name]));
  const groups = new Map<string, MemberGroup<C>>();

  for (const member of members) {
    groups.set(member.user_id, {
      userId: member.user_id,
      label: labelFor.get(member.user_id)?.trim() || MEMBER_FALLBACK_NAME,
      role: member.role,
      characters: [],
    });
  }

  for (const character of characters) {
    let group = groups.get(character.owner_id);
    if (!group) {
      group = {
        userId: character.owner_id,
        label: labelFor.get(character.owner_id)?.trim() || MEMBER_FALLBACK_NAME,
        role: "player",
        characters: [],
      };
      groups.set(character.owner_id, group);
    }
    group.characters.push(character);
  }

  return [...groups.values()];
}
