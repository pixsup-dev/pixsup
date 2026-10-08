import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, callerOf } from "../_shared/supabase.ts";
import { BOOSTS, type BoostProduct, SITE_URL } from "../_shared/boosts.ts";

// Starts a Stripe Checkout for a Boost on one of the caller's own posts and
// returns its URL. The boost is applied later by stripeWebhook, once Stripe
// confirms the payment. Needs the STRIPE_SECRET_KEY secret.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const { data: enabled } = await admin.rpc("boosts_enabled");
    if (!enabled || !stripeKey) return json({ error: "Boosts aren't available yet" }, 503);

    const user = await callerOf(req);
    if (!user) return json({ error: "Sign in to boost a post" }, 401);

    const { post_id, product } = await req.json().catch(() => ({}));
    const boost = BOOSTS[product as BoostProduct];
    if (!boost || typeof post_id !== "string") return json({ error: "Invalid boost" }, 400);

    const { data: post } = await admin
      .from("posts")
      .select("id, created_by_id, expires_at, hidden_at, isNews")
      .eq("id", post_id)
      .maybeSingle();
    if (!post || post.created_by_id !== user.id || post.isNews || post.hidden_at) {
      return json({ error: "You can only boost your own posts" }, 403);
    }
    if (post.expires_at && new Date(post.expires_at).getTime() <= Date.now()) {
      return json({ error: "This post has already expired" }, 409);
    }

    const form = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(boost.amount),
      "line_items[0][price_data][product_data][name]": boost.name,
      client_reference_id: user.id,
      "metadata[post_id]": post.id,
      "metadata[product]": product,
      success_url: `${SITE_URL}/p/${post.id}?boost=success`,
      cancel_url: `${SITE_URL}/p/${post.id}?boost=cancelled`,
      expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
    });
    if (user.email) form.set("customer_email", user.email);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const session = await res.json();
    if (!res.ok) throw new Error(session?.error?.message || "Stripe error");

    const { error } = await admin.from("boost_purchases").insert({
      user_id: user.id,
      post_id: post.id,
      product,
      amount_cents: boost.amount,
      stripe_session_id: session.id,
    });
    if (error) throw error;

    return json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
