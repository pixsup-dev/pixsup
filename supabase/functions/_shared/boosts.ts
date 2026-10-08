// Boost products and prices (US cents). Keep the labels in sync with
// src/lib/boosts.js, which shows them in the app.
export const BOOSTS = {
  extend_1h: { name: "Pixsup Boost: +1 hour of life", amount: 99 },
  spotlight: { name: "Pixsup Spotlight: top of the feed for 30 minutes", amount: 299 },
} as const;

export type BoostProduct = keyof typeof BOOSTS;

export const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.pixsup.com";
