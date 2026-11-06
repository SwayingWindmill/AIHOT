// A paused external source must not accept new reports or look healthy after a rejected push.
import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { IngestError, ingestItems } from "@aihot/backend/ingest/items";
import { QUEUES, stopBoss } from "@aihot/backend/jobs/queue";
import { tag } from "./setup.ts";

after(async () => {
  await stopBoss();
  await closeDb();
});

test("a paused external source rejects pushed items without recording a successful fetch", async () => {
  const sourceId = `test-paused-ingest-${tag()}`;
  const lastOkAt = new Date("2026-09-01T00:00:00Z");
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health, last_ok_at)
    VALUES (${sourceId}, 'Paused external source', 'external', '{}'::jsonb, 'T2', 'editorial', false, 'paused', ${lastOkAt})`;

  await assert.rejects(
    ingestItems({ sourceId, items: [{ title: "New report", url: `https://example.org/${sourceId}` }] }),
    (error: unknown) => error instanceof IngestError && error.status === 409,
  );

  const [source] = await sql<{ last_ok_at: Date }[]>`SELECT last_ok_at FROM sources WHERE id = ${sourceId}`;
  const [articles] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(source!.last_ok_at.toISOString(), lastOkAt.toISOString());
  assert.equal(articles!.count, 0);

  await sql`UPDATE sources SET enabled = true WHERE id = ${sourceId}`;
  assert.deepEqual(await ingestItems({ sourceId, items: [{ title: "New report", url: `https://example.org/${sourceId}` }] }), { ok: true, created: 1 });
});

test("an externally reported calendar day stays date-only through storage", async () => {
  const sourceId = `test-date-ingest-${tag()}`;
  await ingestItems({ sourceId, items: [{ title: "Calendar day", url: `https://example.org/${sourceId}`, publishedAt: "2026-10-13" }] });
  const [row] = await sql`SELECT publication_time, published_at_claim FROM articles WHERE source_id=${sourceId}`;
  assert.equal(row!.publication_time, "2026-10-13");
  assert.equal(row!.published_at_claim.toISOString(), "2026-10-13T00:00:00.000Z");
});

async function editorialSource(id: string) {
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health)
    VALUES (${id}, 'Editorial external source', 'external', '{}'::jsonb, 'T2', 'editorial', true, 'ok')`;
}

async function stored(sourceId: string) {
  const [row] = await sql<{ id: string; body_text: string | null; body_status: string; excerpt: string | null; media: unknown[] }[]>`
    SELECT id, body_text, body_status, excerpt, media FROM articles WHERE source_id = ${sourceId}`;
  const jobs = await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${row!.id}`;
  return { ...row!, jobs: jobs.map((j) => j.name) };
}

test("a pushed item without a body still waits for its page to be fetched", async () => {
  const sourceId = `test-nobody-ingest-${tag()}`;
  await editorialSource(sourceId);
  await ingestItems({ sourceId, items: [{ title: "Title only", url: `https://example.org/${sourceId}` }] });
  const row = await stored(sourceId);
  assert.deepEqual([row.body_text, row.body_status, row.media, row.jobs], [null, "pending", [], [QUEUES.extractBody]]);
});

test("a pushed body, excerpt and media are stored and the item goes straight to analysis", async () => {
  const sourceId = `test-body-ingest-${tag()}`;
  await editorialSource(sourceId);
  await ingestItems({
    sourceId,
    items: [{
      title: "Social post",
      url: `https://example.org/${sourceId}`,
      bodyText: "  The whole post text.  ",
      excerpt: " Short version ",
      media: [
        { kind: "image", url: "https://img.example.org/a.jpg", width: 800, height: 600, alt: "a panda" },
        { kind: "video", url: "https://video.example.org/b.mp4", poster: "https://img.example.org/b.jpg" },
      ],
    }],
  });
  const row = await stored(sourceId);
  assert.deepEqual([row.body_text, row.excerpt, row.body_status, row.jobs], ["The whole post text.", "Short version", "ok", [QUEUES.analyze]]);
  assert.deepEqual(row.media, [
    { kind: "image", url: "https://img.example.org/a.jpg", width: 800, height: 600, alt: "a panda" },
    { kind: "video", url: "https://video.example.org/b.mp4", poster: "https://img.example.org/b.jpg" },
  ]);
});

test("invalid media entries and blank bodies are dropped without rejecting the item", async () => {
  const sourceId = `test-badmedia-ingest-${tag()}`;
  await editorialSource(sourceId);
  const media = [
    { kind: "image", url: "https://img.example.org/ok.jpg", width: -5, poster: "javascript:alert(1)" },
    { kind: "audio", url: "https://img.example.org/a.mp3" },
    { kind: "image", url: "ftp://img.example.org/a.jpg" },
    { kind: "image", url: "not a url" },
    { kind: "image" },
    "https://img.example.org/bare.jpg",
    null,
  ];
  assert.deepEqual(await ingestItems({ sourceId, items: [{ title: "Messy", url: `https://example.org/${sourceId}`, bodyText: "   ", excerpt: 7, media }] }), { ok: true, created: 1 });
  const row = await stored(sourceId);
  assert.deepEqual(row.media, [{ kind: "image", url: "https://img.example.org/ok.jpg" }]);
  assert.deepEqual([row.body_text, row.body_status], [null, "pending"]);
});

test("pushed fields are capped: 20 media, 2000 excerpt chars, 200000 body chars", async () => {
  const sourceId = `test-caps-ingest-${tag()}`;
  await editorialSource(sourceId);
  const media = Array.from({ length: 30 }, (_, i) => ({ kind: "image", url: `https://img.example.org/${i}.jpg` }));
  await ingestItems({ sourceId, items: [{ title: "Big", url: `https://example.org/${sourceId}`, bodyText: "b".repeat(250_000), excerpt: "e".repeat(5_000), media }] });
  const row = await stored(sourceId);
  assert.deepEqual([row.body_text!.length, row.excerpt!.length, row.media.length], [200_000, 2_000, 20]);
});
