// Vercel Routing Middleware: when a shared post link (/p/<id>) is opened —
// usually by a link-preview bot from WhatsApp, iMessage, X, etc. — serve the
// app's index.html with that post's title and picture in the preview tags.
// Anything unexpected falls through to the normal static page.
export const config = { matcher: "/p/:id*" };

const POST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_IMAGE = "https://www.pixsup.com/og.png";

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export default async function middleware(request) {
  try {
    const url = new URL(request.url);
    const id = url.pathname.split("/")[2];
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!POST_ID.test(id || "") || !supabaseUrl || !anonKey) return;

    const [pageRes, postRes] = await Promise.all([
      fetch(new URL("/index.html", url)),
      fetch(
        `${supabaseUrl}/rest/v1/posts?id=eq.${id}&select=title,thumbnail_url,media_url,media_type,isNews,guest_author_id`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
      ),
    ]);
    if (!pageRes.ok || !postRes.ok) return;
    const [html, rows] = await Promise.all([pageRes.text(), postRes.json()]);
    const post = rows[0];
    if (!post || !html.includes("<!-- og:end -->")) return;

    const title = post.title || "A post on Pixsup";
    const description = post.isNews
      ? `Via ${post.guest_author_id || "the news"} — live on Pixsup. Hit it to keep it alive.`
      : "Live on Pixsup — this post only survives while people keep hitting it.";
    const image =
      post.media_type === "image" ? post.thumbnail_url || post.media_url || DEFAULT_IMAGE : DEFAULT_IMAGE;

    const tags = [
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<meta property="og:type" content="article" />`,
      `<meta property="og:site_name" content="Pixsup" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta property="og:url" content="https://www.pixsup.com/p/${id}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    ].join("\n    ");

    const page = html.replace(/<!-- og:start[\s\S]*?<!-- og:end -->/, tags);
    return new Response(page, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=0, s-maxage=60",
      },
    });
  } catch {
    return; // never break the page over a preview
  }
}
