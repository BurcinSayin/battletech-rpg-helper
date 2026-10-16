import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client, type QueryResult } from "pg";
import { describe, expect, it } from "vitest";

const connectionString = process.env.SUPABASE_TEST_DB_URL;
if (!connectionString)
  throw new Error("Set SUPABASE_TEST_DB_URL to the direct local DB URL.");
const databaseUrl = new URL(connectionString);
if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  !["localhost", "127.0.0.1", "[::1]", "::1"].includes(databaseUrl.hostname)
) {
  throw new Error(
    "SUPABASE_TEST_DB_URL must target loopback; this suite writes fixtures.",
  );
}

function client() {
  return new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
}
async function authenticate(db: Client, userId: string) {
  await db.query("BEGIN");
  await db.query("SET LOCAL ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId }),
  ]);
}
type Outcome =
  { result: QueryResult; error?: never } | { error: unknown; result?: never };
interface PendingQuery {
  outcome?: Outcome;
  settled: Promise<Outcome>;
}
function track(query: Promise<QueryResult>) {
  const pending: PendingQuery = {
    settled: query.then(
      (result) => (pending.outcome = { result }),
      (error: unknown) => (pending.outcome = { error }),
    ),
  };
  return pending;
}
async function waitForBlocker(
  observer: Client,
  blockedPid: number,
  blockerPid: number,
  pending: PendingQuery,
) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (pending.outcome)
      throw new Error(
        "Loser completed before overlapping row lock was observed",
      );
    const { rows } = await observer.query<{ blockers: number[] }>(
      "SELECT pg_blocking_pids($1) AS blockers",
      [blockedPid],
    );
    if (rows[0].blockers.includes(blockerPid)) return;
    await delay(20);
  }
  throw new Error(
    "Required overlapping row lock was not observed within 5 seconds",
  );
}

const baseMech = {
  model: "Base",
  armor: [{ location: "LA", value: 10 }],
  criticalSlots: [{ location: "LA", slots: ["Laser"] }],
};
const initialDamage = {
  armor: [{ index: 0, lost: 1 }],
  structure: [{ index: 0, max: 10, lost: 2 }],
  criticals: [{ section: 0, slot: 0 }],
  heat: 4,
  pilotHits: 2,
};
const nextDamage = {
  ...initialDamage,
  armor: [{ index: 0, lost: 3 }],
  heat: 6,
};
const changedMech = { ...baseMech, model: "Changed" };
const pilotOnly = {
  armor: [],
  structure: [],
  criticals: [],
  heat: 0,
  pilotHits: 2,
};
type Writer = "damage" | "base";
function write(db: Client, id: string, kind: Writer, damage = nextDamage) {
  return kind === "damage"
    ? db.query(
        "SELECT * FROM public.update_character_mech_damage($1, 1, $2::jsonb)",
        [id, JSON.stringify(damage)],
      )
    : db.query("SELECT * FROM public.update_character($1, 1, $2::jsonb)", [
        id,
        JSON.stringify({ mech: changedMech, name: "Base winner" }),
      ]);
}

describe("character mech damage optimistic concurrency", () => {
  it.each<[Writer, Writer]>([
    ["damage", "damage"],
    ["damage", "base"],
    ["base", "damage"],
  ])(
    "%s wins against %s at the same version: one success, one PT409, no silent loss",
    async (winner, loser) => {
      const observer = client();
      const first = client();
      const second = client();
      const ownerId = randomUUID();
      const characterId = randomUUID();
      let pending: PendingQuery | undefined;
      let secondPid: number | undefined;
      try {
        await Promise.all([
          observer.connect(),
          first.connect(),
          second.connect(),
        ]);
        const firstPid = (await first.query("SELECT pg_backend_pid() AS pid"))
          .rows[0].pid as number;
        secondPid = (await second.query("SELECT pg_backend_pid() AS pid"))
          .rows[0].pid as number;
        await observer.query(
          "INSERT INTO auth.users(id,email) VALUES ($1,$2)",
          [ownerId, `${ownerId}@damage-concurrency.local`],
        );
        await observer.query(
          "INSERT INTO public.characters(id,owner_id,name,mech,mech_damage) VALUES ($1,$2,$3,$4,$5)",
          [characterId, ownerId, "Damage race", baseMech, initialDamage],
        );

        await authenticate(first, ownerId);
        const success = await write(first, characterId, winner);
        expect(success.rows[0].version).toBe(2);
        await authenticate(second, ownerId);
        // Damage-vs-damage uses distinct documents so a lost update cannot pass.
        pending = track(
          write(second, characterId, loser, { ...nextDamage, heat: 9 }),
        );
        await waitForBlocker(observer, secondPid, firstPid, pending);
        await first.query("COMMIT");
        const outcome = await pending.settled;
        expect(outcome.error).toMatchObject({ code: "PT409" });
        expect(outcome.result).toBeUndefined();
        await second.query("ROLLBACK");
        const { rows } = await observer.query(
          "SELECT name,mech,mech_damage,version FROM public.characters WHERE id = $1",
          [characterId],
        );
        expect(rows[0]).toEqual({
          name: winner === "base" ? "Base winner" : "Damage race",
          mech: winner === "base" ? changedMech : baseMech,
          mech_damage: winner === "base" ? pilotOnly : nextDamage,
          version: 2,
        });
      } finally {
        try {
          if (pending && !pending.outcome && secondPid)
            await observer.query("SELECT pg_cancel_backend($1)", [secondPid]);
          await Promise.allSettled([
            first.query("ROLLBACK"),
            second.query("ROLLBACK"),
          ]);
          if (pending) await pending.settled;
          await observer.query("DELETE FROM public.characters WHERE id = $1", [
            characterId,
          ]);
          await observer.query("DELETE FROM auth.users WHERE id = $1", [
            ownerId,
          ]);
        } finally {
          await Promise.allSettled([observer.end(), first.end(), second.end()]);
        }
      }
    },
  );
});
