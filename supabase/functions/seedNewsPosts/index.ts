import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

// Live news ingestion from public RSS/Atom feeds. Each story becomes a news
// tile (headline + image + link back to the publisher) that expires after a
// few hours. Runs on a schedule (Supabase Cron) and when the app's grid runs low.

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
];

const NEWS_LIFETIME_MS = 6 * 60 * 60 * 1000; // a news tile lives 6 hours
const MAX_STORY_AGE_MS = 24 * 60 * 60 * 1000; // ignore stories older than a day
const MAX_LIVE_NEWS = 30; // never let news crowd out member posts
const PER_FEED_PER_RUN = 1; // spread each run across topics
const MIN_RUN_GAP_MS = 10 * 60 * 1000; // throttle repeat calls while the grid is healthy
const DELETE_AFTER_MS = 2 * 24 * 60 * 60 * 1000; // purge expired news after 2 days

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  htmlEntities: true,
  isArray: (name) =>
    ["item", "entry", "link", "media:content", "media:thumbnail", "enclosure"].includes(name),
});

type Story = {
  title: string;
  link: string;
  image: string;
  published: number;
  source: string;
  topic: string;
};

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

// deno-lint-ignore no-explicit-any
function linkOf(item: any): string {
  const links = item.link || [];
  for (const l of links) {
    if (typeof l === "string") return l.trim();
    if (l?.["@_href"] && (!l["@_rel"] || l["@_rel"] === "alternate")) return l["@_href"];
  }
  return "";
}

async function fetchFeed(feed: (typeof FEEDS)[number]): Promise<Story[]> {
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
    const published = Date.parse(text(item.pubDate) || text(item.published) || text(item.updated));
    if (!title || !link.startsWith("https://") || !image.startsWith("https://")) continue;
    stories.push({ title, link, image, published: published || Date.now(), source: feed.source, topic: feed.topic });
  }
  return stories.sort((a, b) => b.published - a.published);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const minActive = Math.min(Math.max(Number(body.min_active) || 8, 1), 50);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Housekeeping: drop news tiles that expired long ago
    await admin
      .from("posts")
      .delete()
      .eq("isNews", true)
      .lt("expires_at", new Date(now - DELETE_AFTER_MS).toISOString());

    const { data: live, error } = await admin
      .from("posts")
      .select("id, isNews, created_date")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1000);
    if (error) throw error;

    const liveNews = live.filter((p) => p.isNews);
    const lastNewsAt = Math.max(0, ...liveNews.map((p) => Date.parse(p.created_date)));
    const gridLow = live.length < minActive;
    if (liveNews.length >= MAX_LIVE_NEWS || (!gridLow && now - lastNewsAt < MIN_RUN_GAP_MS)) {
      return json({ success: true, seeded: 0, active: live.length, reason: "up to date" });
    }

    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const failed = results
      .map((r, i) => (r.status === "rejected" ? `${FEEDS[i].url}: ${r.reason}` : null))
      .filter(Boolean);
    const perFeed = results.map((r) => (r.status === "fulfilled" ? r.value : []))
      .map((stories) => stories.filter((s) => now - s.published < MAX_STORY_AGE_MS));

    // Skip stories we've already posted (live or recently expired)
    const candidateLinks = perFeed.flat().map((s) => s.link);
    const { data: seen, error: seenError } = candidateLinks.length
      ? await admin.from("posts").select("source_url").in("source_url", candidateLinks)
      : { data: [], error: null };
    if (seenError) throw seenError;
    const seenLinks = new Set((seen || []).map((p) => p.source_url));

    const budget = MAX_LIVE_NEWS - liveNews.length;
    const picked: Story[] = [];
    for (const stories of perFeed) {
      picked.push(...stories.filter((s) => !seenLinks.has(s.link)).slice(0, PER_FEED_PER_RUN));
    }
    const fresh = [...new Map(picked.map((s) => [s.link, s])).values()]
      .sort((a, b) => b.published - a.published)
      .slice(0, budget);

    const expiresAt = new Date(now + NEWS_LIFETIME_MS).toISOString();
    const rows = fresh.map((s) => ({
      title: s.title,
      media_url: s.image,
      thumbnail_url: s.image,
      media_type: "image",
      // category drives the grid's topic filter (#Tech, #Sports…); isNews marks it as news
      category: s.topic,
      hashtags: ["#News", `#${s.topic}`],
      guest_author_id: s.source,
      source_url: s.link,
      isNews: true,
      expires_at: expiresAt,
    }));

    if (rows.length > 0) {
      const { error: insertError } = await admin.from("posts").insert(rows);
      if (insertError) throw insertError;
    }

    return json({ success: true, seeded: rows.length, active: live.length + rows.length, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
