"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { classifyUpdateError, rowToPersonalCombat } from "@/lib/characters";
import {
  personalCombatSchema,
  type PersonalCombat,
} from "@/lib/characters/personal-combat";
import { createClient } from "@/lib/supabase/server";

export type ApplyPersonalCombatResult =
  | { ok: true; version: number; status: PersonalCombat }
  | { ok: false; kind: "conflict" }
  | { ok: false; kind: "invalid" | "error"; message: string };

const versionSchema = z.number().int().positive().max(2_147_483_647);
const inputSchema = z.object({
  id: z.string().uuid(),
  expectedVersion: versionSchema,
  status: personalCombatSchema,
});

const invalid = {
  ok: false,
  kind: "invalid",
  message: "Personal combat status is invalid.",
} as const;

const failure = {
  ok: false,
  kind: "error",
  message:
    "Could not confirm the personal status update. Reload to check the latest status.",
} as const;

export async function applyPersonalCombat(
  id: unknown,
  expectedVersion: unknown,
  status: unknown,
): Promise<ApplyPersonalCombatResult> {
  const parsed = inputSchema.safeParse({ id, expectedVersion, status });
  if (!parsed.success) return invalid;
  const input = parsed.data;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "update_character_personal_combat",
      {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_status: input.status,
      },
    );
    if (error) {
      const kind = classifyUpdateError(error);
      if (kind === "conflict") return { ok: false, kind };
      if (kind === "invalid") return invalid;
      console.error("[characters] personal combat RPC failed", input.id);
      return failure;
    }
    if (!data || !versionSchema.safeParse(data.version).success) {
      console.error(
        "[characters] missing personal combat acknowledgment",
        input.id,
      );
      return failure;
    }
    const stored = rowToPersonalCombat(data);
    if (stored === null) return failure;
    revalidatePath(`/characters/${input.id}`);
    return { ok: true, version: data.version, status: stored };
  } catch {
    console.error("[characters] personal combat apply failed", input.id);
    return failure;
  }
}
