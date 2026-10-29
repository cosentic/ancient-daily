# Ancient Daily

One Wikipedia article about the ancient world each day, summarized by Claude.

## How it works

- **`/api/cron/refresh-pool`** (daily, ~4am ET): rebuilds the article pool for the
  one civilization group refreshed longest ago, so each group refreshes about
  weekly. Override with `?group=Celts`.
- **`/api/cron/classify`** (daily, ~5am ET): tags each pool title with a type
  (person, place, event, object, peoples, concept, other) from Wikidata and its
  60-day average page views. Re-checks each title monthly.
- **`/api/cron/daily`** (daily, ~6am ET): picks a random group, then a random
  unseen title that passes the filter, fetches it, summarizes it, and saves it to
  `daily_articles`.
- **`/api/today`**: public JSON of the latest pick (`?days=7` for the last N).
- **`/`**: redirects to today's article at `/a/<title>`. Every article has its own
  URL; the page shows title and images immediately and streams in the summary.
- **`/api/random`** (temporary, for "Try another article"): picks a random title fast.

Groups and their sources live in `lib/wiki.ts` (`GROUPS`). Type rules live in
`lib/classify.ts`.

## The filter

`settings` (one row) controls which titles can be picked:

| setting | meaning |
|---|---|
| `filter_enabled` | off = pick from the whole pool |
| `min_views_core` | views/day needed for people, places, events |
| `min_views_extra` | views/day needed for objects, peoples/cultures, concepts |

The `pool_kept` view shows what currently passes. Modern people and works,
films, TV, languages, museums, and lists are always excluded.

## Database (Supabase)

Run `supabase/schema.sql` once. Tables:

| table | what it holds |
|---|---|
| `pool_groups` | one row per group: last refresh time, article count, last log |
| `pool` | `(grp, title)`: every candidate article title |
| `pool_meta` | per title: Wikidata ID, type, views/day |
| `pool_excluded` | titles never to pick |
| `daily_articles` | one row per day: title, group, URL, summary |
| `settings` | filter on/off and thresholds |

## Environment variables (Vercel → Settings → Environment Variables)

| name | value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server only) |
| `ANTHROPIC_API_KEY` | for summaries; without it, Wikipedia's lead is used |
| `CRON_SECRET` | any long random string; Vercel Cron sends it automatically |
| `ADMIN_KEY` | optional; allows `?key=` to run refresh-pool and classify manually |
