# Ancient Daily

One Wikipedia article about the ancient world each day, summarized by Claude.

## How it works

- **`/api/cron/refresh-pool`** (daily, ~5am ET): rebuilds the article pool for the
  one civilization group refreshed longest ago. With 7 groups, each refreshes about
  weekly. Override with `?group=Celts`.
- **`/api/cron/daily`** (daily, ~6am ET): picks a random group, then a random
  unseen title, fetches it, summarizes it, saves it to `daily_articles`.
- **`/api/today`**: public JSON of the latest pick (`?days=7` for the last N).
- **`/`**: a simple page showing today's article and the last week.

Groups and their sources live in `lib/wiki.ts` (`GROUPS`).

## Database (Supabase)

Run `supabase/schema.sql` once. Tables:

| table | what it holds |
|---|---|
| `pool_groups` | one row per group: last refresh time and article count |
| `pool` | `(grp, title)` — every eligible article title |
| `daily_articles` | one row per day: title, group, URL, summary |

## Environment variables (Vercel → Settings → Environment Variables)

| name | value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server only) |
| `ANTHROPIC_API_KEY` | for summaries; without it, Wikipedia's lead is used |
| `CRON_SECRET` | any long random string; Vercel Cron sends it automatically |

## First run

The pool starts empty. Trigger the refresh once per group (7 times), then the daily pick:

```bash
URL=https://<your-app>.vercel.app
for i in 1 2 3 4 5 6 7; do
  curl -s -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/refresh-pool; echo
done
curl -s -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/daily
```

Each refresh response includes a per-source count; a line ending in
"check the name" means that Wikipedia category came back empty.
