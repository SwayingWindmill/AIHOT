// Topic pages: which articles a topic takes, and their counts.
// Written before the code, from the ways it can go wrong:
// - a company topic takes an article about another company that only mentions it (several subjects,
//   its name nowhere in the title), or drops one about it whose title names it in English, in another
//   case, next to Chinese text, or only by a product (it is the article's only subject);
// - a Latin name matches inside another word ("Metadata" is not Meta); a headline naming a company
//   that is not a subject of the article gets in;
// - a technical-direction topic stops taking its tags;
// - withdrawn or not yet released articles appear in a list or a count;
// - an article or story page names a topic its reports do not belong to;
// - a topic without content has no page, or an unknown slug or a page past the end has one.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { TOPICS, loadTopicPage, listTopicSummaries, topicsOfStory } from "@aihot/backend/publication/topics";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const OFFICIAL = `test-topics-official-${T}`;
const MEDIA = `test-topics-media-${T}`;
const app = await buildApp();

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, first_party, next_fetch_at) VALUES
    (${OFFICIAL}, 'Official', 'rss', 'T1', 'editorial', true, '2100-01-01'),
    (${MEDIA}, 'Media', 'rss', 'T2', 'editorial', false, '2100-01-01')`;
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

let n = 0;
interface Report {
  source?: string;
  at: Date;
  title: string;
  originalTitle?: string;
  subjects?: string[];
  tags?: string[];
  score?: number;
  selected?: boolean;
  fact?: number;
  category?: string;
}

/** A published report; `fact` links it to a fact before publishing, as grouping would. */
async function report(r: Report): Promise<string> {
  n += 1;
  const { articleId } = await upsertMaterial({
    sourceId: r.source ?? MEDIA, url: `https://example.com/topics-${T}-${n}`, title: r.originalTitle ?? r.title, bodyText: "body", bodyHtml: "<p>body</p>", bodyStatus: "ok", via: "fetch", publishedAt: r.at,
  });
  await sql`UPDATE articles SET discovered_at = ${r.at}, timeline_at = ${r.at}, grouped_at = now() WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected, subjects, tags)
            VALUES (${articleId}, 1, 'rule', 'pass', ${r.category ?? "breeding"}, ${r.title}, ${`摘要 ${n}`}, ${r.score ?? 80}, ${r.selected ?? true}, ${r.subjects ?? []}, ${[r.category === "venue" ? "场馆公告" : r.category === "conservation" ? "科研" : r.category === "daily" ? "日常" : r.category === "moves" ? "迁移" : "出生", ...(r.tags ?? [])]})`;
  if (r.fact) await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${r.fact}, ${articleId}, 'report')`;
  await publishArticle(articleId, { releasedAt: new Date(r.at.getTime() + 60_000) });
  return articleId;
}

async function story(title: string): Promise<{ id: number; publicId: string }> {
  const publicId = randomUUID();
  const [s] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES (${publicId}, ${title}, now(), now()) RETURNING id`;
  return { id: s!.id, publicId };
}

async function fact(storyId: number | null, title: string): Promise<number> {
  const [f] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${`f-${T}-${randomUUID()}`}, ${storyId}, ${title}) RETURNING id`;
  return f!.id;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);
const page = async (slug: string, p = 1) => {
  const data = await loadTopicPage(slug, p, new Date());
  assert.ok(data, `${slug} page ${p}`);
  return data;
};
/** Every article of a topic, over all its pages. */
async function members(slug: string): Promise<string[]> {
  const first = await page(slug);
  const out = ids(first.items);
  for (let p = 2; p <= first.pageCount; p++) out.push(...ids((await page(slug, p)).items));
  return out;
}

test("an institution topic takes the articles about it, not the ones that only mention it", async () => {
  const about = await report({ at: hoursAgo(30), title: `卧龙神树坪基地迎来双胞胎 ${T}`, subjects: ["ccrcgp"] });
  const product = await report({ at: hoursAgo(31), title: `碧峰峡基地公布幼崽体重 ${T}`, subjects: ["ccrcgp"] });
  const english = await report({ at: hoursAgo(32), title: `双胞胎出生 ${T}`, originalTitle: `CCRCGP welcomes twins ${T}`, subjects: ["ccrcgp", "chengdu-research-base"] });
  const returned = await report({ at: hoursAgo(33), title: `成都大熊猫基地接收回国大熊猫 ${T}`, subjects: ["chengdu-research-base", "ccrcgp", "ueno-zoo"] });
  const lowerCase = await report({ at: hoursAgo(34), title: `chengdu panda base 公布新的开放时间 ${T}`, subjects: ["chengdu-research-base", "ccrcgp"] });
  const pact = await report({ at: hoursAgo(35), title: `多家机构签署保护协议 ${T}`, subjects: ["chengdu-research-base", "ccrcgp", "beijing-zoo"] });
  const berliner = await report({ at: hoursAgo(36), title: `Zoo Berliner 标准发布，成都大熊猫基地参与 ${T}`, subjects: ["zoo-berlin", "chengdu-research-base"] });
  const adjacent = await report({ at: hoursAgo(37), title: `发布Zoo Berlin的新消息 ${T}`, subjects: ["zoo-berlin", "chengdu-research-base"] });
  const headline = await report({ at: hoursAgo(38), title: `中国大熊猫保护研究中心被一篇盘点提到 ${T}`, subjects: ["beijing-zoo"] });
  const twins = await report({ at: hoursAgo(39), title: `双胞胎幼崽满月 ${T}`, tags: ["双胞胎"] });

  const ccrcgp = await members("ccrcgp");
  for (const id of [about, product, english]) assert.ok(ccrcgp.includes(id), "about CCRCGP");
  for (const id of [returned, lowerCase, pact, headline]) assert.ok(!ccrcgp.includes(id), "only mentions CCRCGP");
  const chengdu = await members("chengdu-research-base");
  for (const id of [returned, lowerCase, berliner]) assert.ok(chengdu.includes(id), "about the Chengdu base");
  for (const id of [english, pact]) assert.ok(!chengdu.includes(id), "only mentions the Chengdu base");
  const berlin = await members("zoo-berlin");
  assert.ok(berlin.includes(adjacent), "Zoo Berlin next to Chinese text");
  assert.ok(!berlin.includes(berliner), "Zoo Berliner is not Zoo Berlin");
  assert.ok((await members("twins")).includes(twins), "a field topic takes its tag");

  // The article page names the topics it belongs to.
  const topicsOf = async (id: string) => {
    const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
    return (JSON.parse(res.body) as { topics: Array<{ slug: string }> }).topics.map((t) => t.slug);
  };
  assert.deepEqual(await topicsOf(about), ["ccrcgp", "births"]);
  assert.deepEqual(await topicsOf(returned), ["chengdu-research-base", "births"]);
  assert.deepEqual(await topicsOf(pact), ["births"]);
  assert.deepEqual(await topicsOf(twins), ["twins", "births"]);
});

test("an institution topic's name and its search aliases find subject-tagged reports", async () => {
  const id = await report({at: hoursAgo(2), title: `双胞胎近况 ${T}`, subjects: ['ccrcgp'], selected: false});
  for (const query of ['中国大熊猫保护研究中心', '碧峰峡']) {
    const res = await app.inject({method: 'GET', url: `/api/site/pool?q=${encodeURIComponent(query)}`});
    assert.equal(res.statusCode, 200);
    assert.ok(ids(JSON.parse(res.body).items).includes(id), 'institution names must find subject-tagged reports');
  }
});

test("a story page names the topics of its reports", async () => {
  const birth = await story(`双胞胎出生 ${T}`);
  await report({ source: OFFICIAL, at: hoursAgo(26), title: `双胞胎出生 ${T}`, tags: ["双胞胎"], fact: await fact(birth.id, "产下双胞胎") });
  assert.deepEqual(await topicsOfStory(birth.id), [{ slug: "twins", name: "双胞胎" }, { slug: "births", name: "出生" }]);
});

test("withdrawn articles stay out of lists and counts", async () => {
  const kept = await report({ at: hoursAgo(5), title: `上野动物园发布公告 ${T}`, subjects: ["ueno-zoo"] });
  const withdrawn = await report({ at: hoursAgo(4), title: `上野动物园撤回的消息 ${T}`, subjects: ["ueno-zoo"] });
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${withdrawn}`;

  const data = await page("ueno-zoo");
  assert.deepEqual(ids(data.items), [kept]);
  assert.equal(data.topic.total, 1);
  const summary = (await listTopicSummaries()).topics.find((t) => t.slug === "ueno-zoo")!;
  assert.equal(summary.latest?.title, `上野动物园发布公告 ${T}`, "the index shows the newest public article");
});

test("every topic has a page; unknown topics and pages past the end have none", async () => {
  const empty = await page("san-diego-zoo");
  assert.equal(empty.topic.indexable, false, "a topic without content is not indexed");
  assert.deepEqual(empty.items, []);
  assert.equal(await loadTopicPage("not-a-topic", 1, new Date()), null);
  assert.equal(await loadTopicPage("san-diego-zoo", 2, new Date()), null);
  const index = await app.inject({ method: "GET", url: "/api/site/topics" });
  const body = JSON.parse(index.body) as { groups: Array<{ key: string }>; topics: Array<{ slug: string }> };
  assert.deepEqual(body.groups.map((g) => g.key), ["company", "field", "genre"]);
  assert.deepEqual(body.topics.map((t) => t.slug).sort(), TOPICS.map((t) => t.slug).sort(), "the index lists every topic");
});
