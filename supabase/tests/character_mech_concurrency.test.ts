import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client, type QueryResult } from "pg";
import { describe, expect, it } from "vitest";

// Issue #65: optimistic concurrency for the mech column. Two writers that both
// read version 1 race to set mech; the loser must be PT409 and must not overwrite
// the winner's mech (no lost update).

const connectionString = process.env.SUPABASE_TEST_DB_URL;
if (!connectionString) {
  throw new Error(
    "Set SUPABASE_TEST_DB_URL to the direct local DB_URL from `npx supabase status -o env` before running npm run test:db:concurrency.",
  );
}
const databaseUrl = new URL(connectionString);
if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  !["localhost", "127.0.0.1", "[::1]", "::1"].includes(databaseUrl.hostname)
) {
  throw new Error(
    "SUPABASE_TEST_DB_URL must target a loopback PostgreSQL host; this suite writes fixtures.",
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
  const tracked: PendingQuery = {
    settled: query.then(
      (result) => (tracked.outcome = { result }),
      (error: unknown) => (tracked.outcome = { error }),
    ),
  };
  return tracked;
}

async function waitForBlocker(
  observer: Client,
  blockedPid: number,
  blockerPid: number,
  pending: PendingQuery,
) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (pending.outcome) {
      if (pending.outcome.error) throw pending.outcome.error;
      throw new Error(
        "Query completed before the required overlapping lock was observed",
      );
    }
    const { rows } = await observer.query<{ blockers: number[] }>(
      "SELECT pg_blocking_pids($1) AS blockers",
      [blockedPid],
    );
    if (rows[0].blockers.includes(blockerPid)) return;
    await delay(20);
  }
  throw new Error(
    `Backend ${blockedPid} did not block on ${blockerPid} within 5 seconds`,
  );
}

describe("character mech optimistic concurrency", () => {
  it("a stale same-version mech write is PT409 after the winner commits, with no lost update", async () => {
    const observer = client();
    const first = client();
    const second = client();
    const ownerId = randomUUID();
    const characterId = randomUUID();
    let pending: PendingQuery | undefined;
    let secondPid: number | undefined;

    const writeSql =
      "SELECT * FROM public.update_character($1, 1, $2::jsonb)";

    try {
      await Promise.all([observer.connect(), first.connect(), second.connect()]);
      const firstPid = (await first.query("SELECT pg_backend_pid() AS pid"))
        .rows[0].pid as number;
      secondPid = (await second.query("SELECT pg_backend_pid() AS pid"))
        .rows[0].pid as number;

      await observer.query(
        "INSERT INTO auth.users(id, email) VALUES ($1, $2)",
        [ownerId, `${ownerId}@mech-concurrency.local`],
      );
      await observer.query(
        "INSERT INTO public.characters(id, owner_id, name, mech) VALUES ($1, $2, $3, $4)",
        [characterId, ownerId, `Mech ${randomUUID()}`, { model: "Base" }],
      );

      // Winner: takes the row lock at version 1 and holds it uncommitted.
      await authenticate(first, ownerId);
      await first.query(writeSql, [
        characterId,
        JSON.stringify({ mech: { model: "First" } }),
      ]);

      // Loser: also read version 1; blocks on the winner's row lock.
      await authenticate(second, ownerId);
      pending = track(
        second.query(writeSql, [
          characterId,
          JSON.stringify({ mech: { model: "Second" } }),
        ]),
      );
      await waitForBlocker(observer, secondPid, firstPid, pending);

      await first.query("COMMIT");
      const outcome = await pending.settled;
      expect(outcome.error).toMatchObject({ code: "PT409" });
      await second.query("ROLLBACK");

      const { rows } = await observer.query(
        "SELECT mech, version FROM public.characters WHERE id = $1",
        [characterId],
      );
      expect(rows[0]).toMatchObject({ mech: { model: "First" }, version: 2 });
    } finally {
      try {
        if (pending && !pending.outcome && secondPid) {
          await observer.query("SELECT pg_cancel_backend($1)", [secondPid]);
        }
        await Promise.allSettled([first.query("ROLLBACK"), second.query("ROLLBACK")]);
        if (pending) await pending.settled;
        await observer.query("DELETE FROM public.characters WHERE id = $1", [
          characterId,
        ]);
        await observer.query("DELETE FROM auth.users WHERE id = $1", [ownerId]);
      } finally {
        await Promise.allSettled([observer.end(), first.end(), second.end()]);
      }
    }
  });
});
