import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { ensureChallenges } from "../_shared/challenges.ts";

// Live news ingestion from public RSS/Atom feeds. Each story becomes a news
// tile (headline + summary + image + link back to the publisher) that expires
// after a few hours. Runs on a schedule (Supabase Cron) and when the app's
// grid runs low.
//
// Two kinds of feeds:
//  - topic feeds keep the grid varied (one fresh story per feed per run)
//  - top-story feeds supply the World Pulse belt: their first items are what
//    the editors rank as the biggest stories right now, so feed order matters

// Every feed here was checked to ship an image with each story
const FEEDS = [
  { source: "BBC News", topic: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "BBC News", topic: "Tech", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
  { source: "BBC News", topic: "Science", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
  { source: "BBC Sport", topic: "Sports", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
  { source: "The Verge", topic: "Tech", url: "https://www.theverge.com/rss/index.xml" },
  { source: "Polygon", topic: "Gaming", url: "https://www.polygon.com/rss/index.xml" },
  { source: "The Guardian", topic: "Nature", url: "https://www.theguardian.com/environment/rss" },
  { source: "The Guardian", topic: "Travel", url: "https://www.theguardian.com/travel/rss" },
  { source: "The Guardian", topic: "Food", url: "https://www.theguardian.com/food/rss" },
  { source: "The Guardian", topic: "Art", url: "https://www.theguardian.com/artanddesign/rss" },
  { source: "BBC News", topic: "Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "BBC News", topic: "Health", url: "https://feeds.bbci.co.uk/news/health/rss.xml" },
  { source: "BBC News", topic: "Entertainment", url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml" },
  { source: "BBC Sport", topic: "Sports", url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
  { source: "The Guardian", topic: "Sports", url: "https://www.theguardian.com/sport/rss" },
  { source: "Ars Technica", topic: "Tech", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { source: "The Guardian", topic: "Tech", url: "https://www.theguardian.com/technology/rss" },
  { source: "The Guardian", topic: "Science", url: "https://www.theguardian.com/science/rss" },
  { source: "The New York Times", topic: "Science", url: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml" },
  { source: "The New York Times", topic: "Health", url: "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml" },
  { source: "The Guardian", topic: "Health", url: "https://www.theguardian.com/society/health/rss" },
  { source: "The Guardian", topic: "Business", url: "https://www.theguardian.com/business/rss" },
  { source: "The New York Times", topic: "Business", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { source: "The Guardian", topic: "Entertainment", url: "https://www.theguardian.com/film/rss" },
  { source: "The Guardian", topic: "Entertainment", url: "https://www.theguardian.com/music/rss" },
  { source: "Variety", topic: "Entertainment", url: "https://variety.com/feed/" },
  { source: "The Guardian", topic: "Gaming", url: "https://www.theguardian.com/games/rss" },
  { source: "Kotaku", topic: "Gaming", url: "https://kotaku.com/rss" },
  { source: "The New York Times", topic: "Nature", url: "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml" },
  { source: "The New York Times", topic: "Travel", url: "https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml" },
  { source: "The New York Times", topic: "Food", url: "https://rss.nytimes.com/services/xml/rss/nyt/DiningandWine.xml" },
  { source: "The Guardian", topic: "Food", url: "https://www.theguardian.com/lifeandstyle/food-and-drink/rss" },
  { source: "The New York Times", topic: "Art", url: "https://rss.nytimes.com/services/xml/rss/nyt/ArtandDesign.xml" },
];

const TOP_FEEDS = [
  { source: "BBC News", topic: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", take: 5 },
  { source: "The Guardian", topic: "World", url: "https://www.theguardian.com/world/rss", take: 4 },
  { source: "NPR", topic: "World", url: "https://feeds.npr.org/1004/rss.xml", take: 3 },
];

const NEWS_LIFETIME_MS = 6 * 60 * 60 * 1000; // a news tile lives 6 hours
const MAX_STORY_AGE_MS = 24 * 60 * 60 * 1000; // ignore stories older than a day
const MAX_LIVE_NEWS = 70; // never let topic news crowd out member posts
const MAX_LIVE_TOP = 10; // World Pulse candidates alive at once
const PER_FEED_PER_RUN = 1; // spread each run across topics
const MIN_RUN_GAP_MS = 10 * 60 * 1000; // throttle repeat calls while the grid is healthy
const DELETE_AFTER_MS = 2 * 24 * 60 * 60 * 1000; // purge expired news after 2 days
const SUMMARY_MAX = 280;
// When the caps are full, fresh stories replace news nobody has engaged with
// that has been up at least this long (engaged news keeps its full life)
const RETIRE_AFTER_MS = 60 * 60 * 1000;
const BREAKING_WINDOW_MS = 90 * 60 * 1000; // how fresh a top story must be to count as breaking
// Two outlets covering the same event: headlines sharing most key words
const STOP_WORDS = new Set(
  "about after again against also amid been before being could from have into just more most over says said than that their them then there they this what when where which while will with would year years".split(" ")
);
const keyWords = (title: string) =>
  new Set(
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
  );
const sameStory = (a: Set<string>, b: Set<string>) => {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared >= 3 && shared / Math.min(a.size, b.size) >= 0.5;
};

const LINK_BATCH = 25; // links per "already posted?" query, keeps URLs short

type Feed = { source: string; topic: string; url: string };

type Story = {
  title: string;
  summary: string | null;
  link: string;
  image: string;
  published: number;
  source: string;
  topic: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  htmlEntities: true,
  isArray: (name) =>
    ["item", "entry", "link", "media:content", "media:thumbnail", "enclosure"].includes(name),
});

// deno-lint-ignore no-explicit-any
function text(value: any): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in value) return String(value["#text"]);
  return "";
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

// deno-lint-ignore no-explicit-any
function largest(list: any[] | undefined): string {
  if (!list?.length) return "";
  const withUrl = list.filter((m) => m?.["@_url"] && (!m["@_medium"] || m["@_medium"] === "image"));
  withUrl.sort((a, b) => Number(b["@_width"] || 0) - Number(a["@_width"] || 0));
  return withUrl[0]?.["@_url"] || "";
}

// deno-lint-ignore no-explicit-any
function imageOf(item: any): string {
  let url =
    largest(item["media:content"]) ||
    largest(item["media:thumbnail"]) ||
    // deno-lint-ignore no-explicit-any
    (item.enclosure || []).find((e: any) => String(e?.["@_type"] || "").startsWith("image/"))?.["@_url"] ||
    "";
  if (!url) {
    const html = text(item["content:encoded"]) || text(item.content) || text(item.description);
    url = html.match(/<img[^>]+src="([^"]+)"/i)?.[1] || "";
  }
  url = decode(url);
  // BBC feeds ship 240px thumbnails; their image CDN serves larger sizes on the same path
  return url.replace(/(ichef\.bbci\.co\.uk\/ace\/(?:standard|ws))\/\d+\//, "$1/976/");
}

// The publisher's own one- or two-sentence standfirst, as plain text
// deno-lint-ignore no-explicit-any
function summaryOf(item: any, title: string): string | null {
  const raw = text(item.description) || text(item.summary);
  const firstParagraph = raw.match(/<p>([\s\S]*?)<\/p>/i)?.[1] ?? raw;
  let s = decode(firstParagraph.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  if (s.length < 25 || s.toLowerCase() === title.toLowerCase()) return null;
  if (s.length > SUMMARY_MAX) s = s.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, "") + "…";
  return s;
}

// deno-lint-ignore no-explicit-any
function linkOf(item: any): string {
  const links = item.link || [];
  for (const l of links) {
    if (typeof l === "string") return l.trim();
    if (l?.["@_href"] && (!l["@_rel"] || l["@_rel"] === "alternate")) return l["@_href"];
  }
  return "";
}

// Stories in the feed's own order (editorial prominence), fresh ones only
async function fetchFeed(feed: Feed, now: number): Promise<Story[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "PixsupNewsBot/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${feed.url} → HTTP ${res.status}`);
  const doc = parser.parse(await res.text());
  const items = doc?.rss?.channel?.item || doc?.feed?.entry || [];
  const stories: Story[] = [];
  for (const item of items) {
    const title = decode(text(item.title)).slice(0, 200);
    const link = linkOf(item);
    const image = imageOf(item);
    const published = Date.parse(text(item.pubDate) || text(item.published) || text(item.updated)) || now;
    if (!title || !link.startsWith("https://") || !image.startsWith("https://")) continue;
    if (now - published > MAX_STORY_AGE_MS) continue;
    stories.push({ title, summary: summaryOf(item, title), link, image, published, source: feed.source, topic: feed.topic });
  }
  return stories;
}

async function fetchAll(feeds: Feed[], now: number) {
  const results = await Promise.allSettled(feeds.map((f) => fetchFeed(f, now)));
  const failed = results
    .map((r, i) => (r.status === "rejected" ? `${feeds[i].url}: ${r.reason}` : null))
    .filter(Boolean);
  return { perFeed: results.map((r) => (r.status === "fulfilled" ? r.value : [])), failed };
}

function toRow(s: Story, expiresAt: string, topStory: boolean) {
  return {
    title: s.title,
    summary: s.summary,
    media_url: s.image,
    thumbnail_url: s.image,
    media_type: "image",
    // category drives the grid's topic filter (#Tech, #Sports…); isNews marks it as news
    category: s.topic,
    // A top story the publisher released in the last 90 minutes is breaking news
    hashtags: [
      "#News",
      `#${s.topic}`,
      ...(topStory && Date.now() - s.published < BREAKING_WINDOW_MS ? ["#Breaking"] : []),
    ],
    guest_author_id: s.source,
    source_url: s.link,
    isNews: true,
    top_story: topStory,
    expires_at: expiresAt,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    // Piggybacks on this every-30-minutes job: keep the Daily Challenge
    // planned a week ahead (does nothing once the week is filled)
    let challengesPlanned = 0;
    try {
      challengesPlanned = await ensureChallenges();
    } catch (e) {
      console.error("challenge planning failed:", e);
    }

    const minActive = Math.min(Math.max(Number(body.min_active) || 8, 1), 50);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const expiresAt = new Date(now + NEWS_LIFETIME_MS).toISOString();

    // Housekeeping: drop news tiles that expired long ago
    await admin
      .from("posts")
      .delete()
      .eq("isNews", true)
      .lt("expires_at", new Date(now - DELETE_AFTER_MS).toISOString());

    const { data: live, error } = await admin
      .from("posts")
      .select("id, title, isNews, top_story, created_date, hits, reactions, comment_count, is_trending, boosted_at")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1000);
    if (error) throw error;

    const liveNews = live.filter((p) => p.isNews && !p.top_story);
    const liveTop = live.filter((p) => p.top_story);
    // Oldest first: untouched news that has had its hour, free to make room
    const retirable = (list: typeof live) =>
      list
        .filter(
          (p) =>
            !p.hits &&
            !p.comment_count &&
            !p.is_trending &&
            !p.boosted_at &&
            !Object.keys(p.reactions || {}).length &&
            now - Date.parse(p.created_date) > RETIRE_AFTER_MS
        )
        .sort((a, b) => Date.parse(a.created_date) - Date.parse(b.created_date));
    const retireIds: string[] = [];
    const makeRoom = (wanted: number, room: number, list: typeof live) => {
      const extra = retirable(list).slice(0, Math.max(0, wanted - room));
      retireIds.push(...extra.map((p) => p.id));
      return room + extra.length;
    };
    const lastNewsAt = Math.max(0, ...live.filter((p) => p.isNews).map((p) => Date.parse(p.created_date)));
    const gridLow = live.length < minActive;
    if (!gridLow && now - lastNewsAt < MIN_RUN_GAP_MS) {
      return json({ success: true, seeded: 0, active: live.length, reason: "up to date", challengesPlanned });
    }

    const [topic, top] = await Promise.all([fetchAll(FEEDS, now), fetchAll(TOP_FEEDS, now)]);

    // Which of these stories are already on Pixsup (live or recently expired)?
    // Checked in batches: one query with every link makes a URL too long to send.
    const candidateLinks = [...new Set([...topic.perFeed.flat(), ...top.perFeed.flat()].map((s) => s.link))];
    const seen: { id: string; source_url: string; top_story: boolean }[] = [];
    for (let i = 0; i < candidateLinks.length; i += LINK_BATCH) {
      const { data, error: seenError } = await admin
        .from("posts")
        .select("id, source_url, top_story")
        .in("source_url", candidateLinks.slice(i, i + LINK_BATCH));
      if (seenError) throw seenError;
      seen.push(...data);
    }
    const seenByLink = new Map(seen.map((p) => [p.source_url, p]));

    // 1) World Pulse: the editors' top items from each top-story feed
    const topPicks = new Map<string, Story>();
    TOP_FEEDS.forEach((feed, i) => {
      for (const s of top.perFeed[i].slice(0, feed.take)) topPicks.set(s.link, s);
    });
    // A top story we already posted as ordinary news gets promoted in place
    const promoteIds = [...topPicks.keys()]
      .map((link) => seenByLink.get(link))
      .filter((p) => p && !p.top_story)
      .map((p) => p!.id);
    if (promoteIds.length) {
      const { error: promoteError } = await admin.from("posts").update({ top_story: true }).in("id", promoteIds);
      if (promoteError) throw promoteError;
    }
    // Headlines already live (or picked this run), to skip the same story from another outlet
    const liveHeadlines = live.filter((p) => p.isNews && p.title).map((p) => keyWords(p.title!));
    const isRepeat = (s: Story) => {
      const k = keyWords(s.title);
      if (liveHeadlines.some((h) => sameStory(k, h))) return true;
      liveHeadlines.push(k);
      return false;
    };
    const freshTop = [...topPicks.values()].filter((s) => !seenByLink.has(s.link) && !isRepeat(s));
    const topRoom = makeRoom(
      freshTop.length,
      Math.max(0, MAX_LIVE_TOP - liveTop.length - promoteIds.length),
      liveTop
    );
    const newTop = freshTop.slice(0, topRoom);

    // 2) Topic news: one fresh story per feed, newest first, within the cap
    const takenLinks = new Set([...seenByLink.keys(), ...newTop.map((s) => s.link)]);
    const picked: Story[] = [];
    for (const stories of topic.perFeed) {
      picked.push(
        ...[...stories]
          .sort((a, b) => b.published - a.published)
          .filter((s) => !takenLinks.has(s.link))
          .slice(0, PER_FEED_PER_RUN)
      );
    }
    const freshTopic = [...new Map(picked.map((s) => [s.link, s])).values()]
      .sort((a, b) => b.published - a.published)
      .filter((s) => !isRepeat(s));
    const topicRoom = makeRoom(freshTopic.length, Math.max(0, MAX_LIVE_NEWS - liveNews.length), liveNews);
    const newTopic = freshTopic.slice(0, topicRoom);

    // Retire the replaced tiles (they expire now; cleanup deletes them later)
    if (retireIds.length) {
      const { error: retireError } = await admin
        .from("posts")
        .update({ expires_at: nowIso })
        .in("id", retireIds);
      if (retireError) throw retireError;
    }

    const rows = [
      ...newTop.map((s) => toRow(s, expiresAt, true)),
      ...newTopic.map((s) => toRow(s, expiresAt, false)),
    ];
    if (rows.length > 0) {
      const { error: insertError } = await admin.from("posts").insert(rows);
      if (insertError) throw insertError;
    }

    return json({
      success: true,
      seeded: rows.length,
      topStories: newTop.length,
      promoted: promoteIds.length,
      retired: retireIds.length,
      challengesPlanned,
      active: live.length - retireIds.length + rows.length,
      failed: [...topic.failed, ...top.failed],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
