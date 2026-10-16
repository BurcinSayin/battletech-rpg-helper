"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import {
  classifyUpdateError,
  rowToMech,
  rowToMechDamage,
} from "@/lib/characters";
import {
  isMechDamageEmpty,
  mechDamageSchema,
  type MechDamage,
} from "@/lib/mech/damage";

export type ApplyMechDamageResult =
  | { ok: true; version: number; damage: MechDamage }
  | { ok: false; kind: "conflict" }
  | { ok: false; kind: "invalid" | "error"; message: string };

const inputSchema = z.object({
  id: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  damage: mechDamageSchema,
});

export async function applyMechDamage(
  id: unknown,
  expectedVersion: unknown,
  damage: unknown,
): Promise<ApplyMechDamageResult> {
  const parsed = inputSchema.safeParse({ id, expectedVersion, damage });
  if (!parsed.success) {
    return {
      ok: false,
      kind: "invalid",
      message: "Damage values are invalid.",
    };
  }
  const input = parsed.data;
  // Valid input only needs sorting: cross-record validation belongs to the RPC.
  const canonical: MechDamage = {
    ...input.damage,
    armor: [...input.damage.armor].sort((a, b) => a.index - b.index),
    structure: [...input.damage.structure].sort((a, b) => a.index - b.index),
    criticals: [...input.damage.criticals].sort(
      (a, b) => a.section - b.section || a.slot - b.slot,
    ),
  };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_character_mech_damage", {
      p_id: input.id,
      p_expected_version: input.expectedVersion,
      p_damage: isMechDamageEmpty(canonical)
        ? null
        : (canonical as unknown as Json),
    });
    if (error) {
      const kind = classifyUpdateError(error);
      if (kind === "conflict") return { ok: false, kind };
      if (kind === "invalid") {
        return {
          ok: false,
          kind,
          message: "Damage no longer matches this mech. Discard and reload.",
        };
      }
      console.error(
        "[characters] mech damage apply failed:",
        error.code,
        error.message,
      );
      return failure();
    }
    if (!data) {
      console.error(
        "[characters] mech damage apply failed:",
        undefined,
        "RPC returned no row.",
      );
      return failure();
    }
    revalidatePath(`/characters/${input.id}`);
    return {
      ok: true,
      version: data.version,
      damage: rowToMechDamage(data, rowToMech(data)),
    };
  } catch (error) {
    const detail = error as { code?: string; message?: string } | null;
    console.error(
      "[characters] mech damage apply failed:",
      detail?.code,
      detail?.message,
    );
    return failure();
  }
}

function failure(): ApplyMechDamageResult {
  return {
    ok: false,
    kind: "error",
    message: "Could not apply damage. Please try again.",
  };
}
