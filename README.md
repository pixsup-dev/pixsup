# Pixsup

A fast-moving social photo grid: posts live for a limited time, and hits,
reactions and comments keep them alive. Built with React + Vite on Supabase
(Postgres, Auth, Storage, Realtime, Edge Functions).

## Run locally

1. Install Node.js 20+.
2. `npm install`
3. Copy `.env.example` to `.env` and fill in your Supabase project URL and anon key.
4. `npm run dev` (on Windows PowerShell, `npm.cmd run dev` if scripts are blocked)

## Backend layout

- `supabase/migrations/`: database schema, row level security, storage bucket.
  Apply new files in order via the Supabase SQL Editor (or `supabase db push`).
- `supabase/functions/`: Edge Functions.
  - `seedNewsPosts` pulls live news from RSS feeds (also run every 30 min by Supabase Cron)
  - `analyzePostMedia` runs OpenAI image moderation, titles and tags (needs `OPENAI_API_KEY`)
  - `deleteAccount` permanently deletes the signed-in user

  Deploy: `npx supabase functions deploy --project-ref <ref> --use-api`
- `src/api/base44Client.js`: the app's data client. It keeps the old Base44
  call shape (`base44.entities.Post.list(...)` etc.) but talks to Supabase.

## Secrets

Only public values go in `VITE_` variables (they ship in the browser bundle).
Server secrets such as `OPENAI_API_KEY` are set with `npx supabase secrets set`.
