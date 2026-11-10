// Previews sources the way the admin's 预览抓取 does (listing, detail pages, filters), storing nothing.
// node --env-file=.env scripts/preview-sources.ts [source id ...]   (default: every source in industry/sources.json)
import { readFileSync } from "node:fs";
import { previewSource } from "@aihot/backend/admin/sources";
import { closeDb } from "@aihot/backend/db";

const all: { id: string; kind: string; config: Record<string, unknown> }[] = JSON.parse(readFileSync("industry/sources.json", "utf8")).sources;
const ids = process.argv.slice(2);
let failed = 0;
try {
  for (const source of ids.length ? all.filter((s) => ids.includes(s.id)) : all) {
    try {
      const r = await previewSource(source as never);
      console.log(`ok   ${source.id}  ${r.count} items, ${r.ms} ms`);
      for (const item of r.items.slice(0, 5)) console.log(`     ${item.publishedAt?.slice(0, 10) ?? "no date   "}  ${item.title.slice(0, 60)}  ${item.url}`);
      if (r.count === 0) failed++;
    } catch (error) {
      failed++;
      console.log(`FAIL ${source.id}  ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  await closeDb();
}
process.exitCode = failed ? 1 : 0;
