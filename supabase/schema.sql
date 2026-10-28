-- Ancient Daily schema

-- One row per civilization group; tracks when its pool was last rebuilt.
create table if not exists pool_groups (
  grp           text primary key,
  refreshed_at  timestamptz,
  article_count int not null default 0
);

-- The pool: article titles, tagged by group. A title can sit in two groups.
create table if not exists pool (
  grp   text not null references pool_groups (grp) on delete cascade,
  title text not null,
  primary key (grp, title)
);

-- One row per day: the pick, plus its summary. Doubles as the "seen" list.
create table if not exists daily_articles (
  id         bigint generated always as identity primary key,
  day        date unique not null,
  grp        text not null,
  title      text not null,
  url        text,
  lead       text,
  summary    text,
  created_at timestamptz not null default now()
);

create index if not exists daily_articles_title_idx on daily_articles (title);

-- Last refresh outcome per group (counts per source, or the error).
alter table pool_groups add column if not exists last_log text;

-- Titles never to pick (modern biographies, list pages), filled by the daily job.
create table if not exists pool_excluded (
  title      text primary key,
  reason     text,
  created_at timestamptz not null default now()
);

-- Random title from a group, skipping anything already used (unless allow_repeat).
create or replace function pick_random_title(p_grp text, p_allow_repeat boolean default false)
returns text
language sql
stable
set search_path = public
as $$
  select p.title
  from pool p
  where p.grp = p_grp
    and not exists (select 1 from pool_excluded x where x.title = p.title)
    and (p_allow_repeat or not exists (
      select 1 from daily_articles d where d.title = p.title
    ))
  order by random()
  limit 1;
$$;

revoke execute on function pick_random_title(text, boolean) from anon, authenticated, public;

-- Lock tables down. The app uses the service-role key server-side, which
-- bypasses RLS. Daily articles are readable publicly for a future frontend.
alter table pool_groups    enable row level security;
alter table pool           enable row level security;
alter table daily_articles enable row level security;
alter table pool_excluded  enable row level security;

drop policy if exists "public read daily" on daily_articles;
create policy "public read daily" on daily_articles for select using (true);
