// External collection reports (POST /api/ingest/items). Same identity rules and timeline
// rule as every other entrance: old or future-dated items and explicit backfill never count as
// today's news and are never pushed. Unknown sources are created isolated, awaiting an operator.
import { sql } from "../db.ts";
import { upsertMaterial, type MediaItem } from "../content/materials.ts";
import { queueProcessing } from "../jobs/content.ts";
import { readPublicationDate } from "../sources/dates.ts";
import { normalizeUrl } from "../lib/url.ts";

export const MAX_ITEMS = 50;
export const MAX_BODY_CHARS = 200_000;
export const MAX_EXCERPT_CHARS = 2_000;
export const MAX_MEDIA = 20;

export class IngestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ItemIn {
  title?: unknown;
  url?: unknown;
  publishedAt?: unknown;
  author?: unknown;
  bodyText?: unknown;
  excerpt?: unknown;
  media?: unknown;
  raw?: { _aihot?: { backfill?: boolean; baseline?: boolean } } & Record<string, unknown>;
}

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

function httpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const url = v.trim();
  try {
    return /^https?:$/.test(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

const dimension = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);

/** Reported media: http(s) images and videos only; anything else is dropped. */
function readMedia(v: unknown): MediaItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MediaItem[] = [];
  for (const m of v) {
    if (out.length >= MAX_MEDIA) break;
    if (!m || typeof m !== "object") continue;
    const { kind, url, width, height, alt, poster } = m as Record<string, unknown>;
    const src = httpUrl(url);
    if ((kind !== "image" && kind !== "video") || !src) continue;
    out.push({
      kind, url: src,
      ...(dimension(width) && { width: dimension(width) }),
      ...(dimension(height) && { height: dimension(height) }),
      ...(text(alt, 500) && { alt: text(alt, 500) }),
      ...(httpUrl(poster) && { poster: httpUrl(poster) }),
    });
  }
  return out.length ? out : undefined;
}

export async function ingestItems(body: { sourceId?: unknown; sourceName?: unknown; items?: unknown }): Promise<{ ok: true; created: number }> {
  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  const items = Array.isArray(body.items) ? (body.items as ItemIn[]) : [];
  if (!sourceId || !items.length) throw new IngestError(400, "sourceId and items[] required");
  if (items.length > MAX_ITEMS) throw new IngestError(413, `items[] exceeds max ${MAX_ITEMS} per request`);

  const [source] = await sql<{ id: string; participation_mode: string; enabled: boolean }[]>`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, enabled, health, tags)
    VALUES (${sourceId.slice(0, 120)}, ${typeof body.sourceName === "string" && body.sourceName.trim() ? body.sourceName.trim().slice(0, 200) : sourceId.slice(0, 120)},
            'external', '{}'::jsonb, 'T2', 'isolated', 1440, true, 'ok', ${["ingest:auto-created"]})
    ON CONFLICT (id) DO UPDATE SET last_ok_at = now() WHERE sources.enabled
    RETURNING id, participation_mode, enabled`;
  if (!source) throw new IngestError(409, "source paused");

  const seen = new Set<string>();
  let created = 0;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const rawUrl = typeof it.url === "string" ? it.url.trim() : "";
    if (!title || !rawUrl) continue;
    const url = normalizeUrl(rawUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const publication = readPublicationDate(typeof it.publishedAt === "string" ? it.publishedAt : null, "+00:00");
    const flags = it.raw?._aihot ?? {};
    const res = await upsertMaterial({
      sourceId: source!.id,
      // Normalize only for deduplication. Ownership needs the reported origin (including www and
      // scheme), and upsertMaterial already applies the common normalized identity rule.
      url: rawUrl,
      title,
      author: typeof it.author === "string" ? it.author.slice(0, 200) : null,
      ...publication,
      bodyText: text(it.bodyText, MAX_BODY_CHARS),
      excerpt: text(it.excerpt, MAX_EXCERPT_CHARS),
      media: readMedia(it.media),
      raw: it.raw ?? null,
      via: "ingest",
      backfill: flags.backfill ? "reported-backfill" : flags.baseline ? "reported-baseline" : null,
    });
    if (res.created) created += 1;
    if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
  }
  await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id = ${source!.id}`;
  await sql`INSERT INTO ingest_events (client, kind, status, summary) VALUES ('ingest-items', 'items', 'ok', ${sql.json({ sourceId: source!.id, received: items.length, created })})`;
  return { ok: true, created };
}
