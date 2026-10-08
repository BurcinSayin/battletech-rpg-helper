import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Client, type QueryResult } from "pg";
import { describe, expect, it } from "vitest";

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
    // Both handlers are registered immediately: a failed query never goes unhandled.
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

const schedules = [
  ["insert", "writer first"],
  ["rpc", "writer first"],
  ["insert", "remover first"],
  ["rpc", "remover first"],
] as const;

describe("atomic campaign-membership revocation", () => {
  it.each(schedules)("%s attachment, %s", async (kind, order) => {
    const observer = client();
    const writer = client();
    const remover = client();
    const gmId = randomUUID();
    const ownerId = randomUUID();
    const campaignId = randomUUID();
    const characterId = randomUUID();
    const name = `Preserved ${randomUUID()}`;
    const info = { marker: randomUUID(), equip: [{ name: "kept" }] };
    const notes = "Keep owner data";
    let pending: PendingQuery | undefined;
    let pendingPid: number | undefined;
    let before: Record<string, unknown> | undefined;

    try {
      await Promise.all([
        observer.connect(),
        writer.connect(),
        remover.connect(),
      ]);
      const writerPid = (await writer.query("SELECT pg_backend_pid() AS pid"))
        .rows[0].pid as number;
      const removerPid = (await remover.query("SELECT pg_backend_pid() AS pid"))
        .rows[0].pid as number;
      await observer.query("BEGIN");
      await observer.query(
        "INSERT INTO auth.users(id, email) VALUES ($1, $3), ($2, $4)",
        [
          gmId,
          ownerId,
          `${gmId}@concurrency.local`,
          `${ownerId}@concurrency.local`,
        ],
      );
      await observer.query(
        "INSERT INTO public.campaigns(id, gm_id, name, invite_code) VALUES ($1, $2, 'Concurrency fixture', $3)",
        [
          campaignId,
          gmId,
          randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(),
        ],
      );
      await observer.query(
        "INSERT INTO public.campaign_members(campaign_id, user_id) VALUES ($1, $2)",
        [campaignId, ownerId],
      );
      if (kind === "rpc") {
        before = (
          await observer.query(
            "INSERT INTO public.characters(id, owner_id, name, info, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [characterId, ownerId, name, info, notes],
          )
        ).rows[0];
      }
      await observer.query("COMMIT");

      const attachSql =
        kind === "insert"
          ? "INSERT INTO public.characters(id, owner_id, campaign_id, name, info, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *"
          : "SELECT * FROM public.update_character($1, 1, $2::jsonb)";
      const attachParams =
        kind === "insert"
          ? [characterId, ownerId, campaignId, name, info, notes]
          : [characterId, JSON.stringify({ campaign_id: campaignId })];
      const removeSql =
        "DELETE FROM public.campaign_members WHERE campaign_id = $1 AND user_id = $2 RETURNING *";
      const removeParams = [campaignId, ownerId];

      if (order === "writer first") {
        await authenticate(writer, ownerId);
        const attached = (await writer.query(attachSql, attachParams)).rows[0];
        expect(attached.campaign_id).toBe(campaignId);
        expect(attached.version).toBe(kind === "insert" ? 1 : 2);
        before = attached;
        await authenticate(remover, gmId);
        pendingPid = removerPid;
        pending = track(remover.query(removeSql, removeParams));
        await waitForBlocker(observer, removerPid, writerPid, pending);
        await writer.query("COMMIT");
        const outcome = await pending.settled;
        if (outcome.error) throw outcome.error;
        expect(outcome.result?.rowCount).toBe(1);
        await remover.query("COMMIT");
      } else {
        await authenticate(remover, ownerId);
        expect((await remover.query(removeSql, removeParams)).rowCount).toBe(1);
        await authenticate(writer, ownerId);
        pendingPid = writerPid;
        pending = track(writer.query(attachSql, attachParams));
        await waitForBlocker(observer, writerPid, removerPid, pending);
        await remover.query("COMMIT");
        const outcome = await pending.settled;
        expect(outcome.error).toMatchObject({
          code: kind === "insert" ? "23503" : "PT403",
        });
        await writer.query("ROLLBACK");
      }

      expect(
        (
          await observer.query(
            "SELECT * FROM public.campaign_members WHERE campaign_id = $1 AND user_id = $2",
            [campaignId, ownerId],
          )
        ).rows,
      ).toEqual([]);
      const { rows } = await observer.query(
        "SELECT * FROM public.characters WHERE id = $1",
        [characterId],
      );
      if (order === "remover first" && kind === "insert") {
        expect(rows).toEqual([]);
      } else {
        const row = rows[0] as Record<string, unknown>;
        expect(row).toMatchObject({
          owner_id: ownerId,
          campaign_id: null,
          name,
          info,
          notes,
          version: order === "remover first" ? 1 : kind === "insert" ? 2 : 3,
        });
        if (order === "remover first") {
          expect(row).toEqual(before);
        } else {
          const {
            campaign_id: _newCampaign,
            version: _newVersion,
            updated_at: _newTime,
            ...afterData
          } = row;
          const {
            campaign_id: _oldCampaign,
            version: _oldVersion,
            updated_at: _oldTime,
            ...beforeData
          } = before!;
          expect(afterData).toEqual(beforeData);
        }
        // Actual current version prevents staleness from masquerading as authorization denial.
        await authenticate(remover, gmId);
        expect(
          (
            await remover.query(
              "SELECT * FROM public.characters WHERE id = $1",
              [characterId],
            )
          ).rows,
        ).toEqual([]);
        await expect(
          remover.query(
            'SELECT * FROM public.update_character($1, $2, \'{"name":"forbidden"}\'::jsonb)',
            [characterId, row.version],
          ),
        ).rejects.toMatchObject({ code: "PT409" });
        await remover.query("ROLLBACK");
        await authenticate(remover, gmId);
        expect(
          (
            await remover.query(
              "DELETE FROM public.characters WHERE id = $1 RETURNING *",
              [characterId],
            )
          ).rows,
        ).toEqual([]);
        await remover.query("COMMIT");
        expect(
          (
            await observer.query(
              "SELECT * FROM public.characters WHERE id = $1",
              [characterId],
            )
          ).rows[0],
        ).toEqual(row);
      }
      expect(
        (
          await observer.query(
            `SELECT c.id FROM public.characters c
         WHERE c.owner_id = $1 AND c.campaign_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.campaign_members m
                           WHERE m.campaign_id = c.campaign_id AND m.user_id = c.owner_id)`,
            [ownerId],
          )
        ).rows,
      ).toEqual([]);
    } finally {
      try {
        // Cancel an outstanding blocked statement before queuing rollback behind it.
        if (pending && !pending.outcome && pendingPid) {
          await observer.query("SELECT pg_cancel_backend($1)", [pendingPid]);
        }
        await Promise.allSettled([
          writer.query("ROLLBACK"),
          remover.query("ROLLBACK"),
        ]);
        if (pending) await pending.settled;
        await observer.query("ROLLBACK");
        await observer.query("DELETE FROM public.characters WHERE id = $1", [
          characterId,
        ]);
        await observer.query("DELETE FROM public.campaigns WHERE id = $1", [
          campaignId,
        ]);
        await observer.query(
          "DELETE FROM auth.users WHERE id = ANY($1::uuid[])",
          [[gmId, ownerId]],
        );
        expect(
          (
            await observer.query(
              "SELECT id FROM auth.users WHERE id = ANY($1::uuid[])",
              [[gmId, ownerId]],
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await observer.query(
              "SELECT id FROM public.characters WHERE id = $1",
              [characterId],
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await observer.query(
              "SELECT id FROM public.campaigns WHERE id = $1",
              [campaignId],
            )
          ).rows,
        ).toEqual([]);
      } finally {
        await Promise.allSettled([observer.end(), writer.end(), remover.end()]);
      }
    }
  });
});
