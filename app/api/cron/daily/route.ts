import { NextResponse } from "next/server";
import { db, isAuthorized, todayET } from "@/lib/db";
import { fetchArticle } from "@/lib/wiki";
import { summarize } from "@/lib/summarize";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Picks today's article: random group, then a random unseen title in it. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = db();
  const day = todayET();

  // Already picked today? Return it (safe to re-run).
  const { data: existing } = await supabase
    .from("daily_articles")
    .select("*")
    .eq("day", day)
    .maybeSingle();
  if (existing) return NextResponse.json({ status: "already picked", article: existing });

  const { data: groups, error } = await supabase
    .from("pool_groups")
    .select("grp")
    .gt("article_count", 0);
  if (error) throw error;
  if (!groups?.length) {
    return NextResponse.json(
      { error: "pool is empty; run /api/cron/refresh-pool first" },
      { status: 503 },
    );
  }

  // Try groups in random order; if everything has been seen, allow repeats.
  let grp = "";
  let title: string | null = null;
  for (const allowRepeat of [false, true]) {
    for (const g of shuffle(groups.map((r) => r.grp as string))) {
      const { data } = await supabase.rpc("pick_random_title", {
        p_grp: g,
        p_allow_repeat: allowRepeat,
      });
      if (data) {
        grp = g;
        title = data as string;
        break;
      }
    }
    if (title) break;
  }
  if (!title) return NextResponse.json({ error: "no title found" }, { status: 500 });

  const article = await fetchArticle(title);
  const summary = await summarize(article.title, article.body, article.lead);

  const row = {
    day,
    grp,
    title: article.title,
    url: article.url,
    lead: article.lead,
    summary,
  };
  const { error: insErr } = await supabase
    .from("daily_articles")
    .upsert(row, { onConflict: "day", ignoreDuplicates: true });
  if (insErr) throw insErr;

  return NextResponse.json({ status: "picked", article: row });
}
