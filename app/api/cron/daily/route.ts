import { NextResponse } from "next/server";
import { db, isAuthorized, todayET } from "@/lib/db";
import { fetchArticle, isOffTopic } from "@/lib/wiki";
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

  // Pick a random group, then a random unseen title in it. Skip (and exclude for
  // good) modern biographies and list pages. If everything's been seen, allow repeats.
  async function pickOnce(): Promise<{ grp: string; title: string } | null> {
    for (const allowRepeat of [false, true]) {
      for (const g of shuffle(groups!.map((r) => r.grp as string))) {
        const { data } = await supabase.rpc("pick_random_title", {
          p_grp: g,
          p_allow_repeat: allowRepeat,
        });
        if (data) return { grp: g, title: data as string };
      }
    }
    return null;
  }

  let picked: { grp: string; title: string } | null = null;
  const skipped: string[] = [];
  for (let attempt = 0; attempt < 10 && !picked; attempt++) {
    const candidate = await pickOnce();
    if (!candidate) break;
    if (await isOffTopic(candidate.title)) {
      skipped.push(candidate.title);
      await supabase
        .from("pool_excluded")
        .upsert({ title: candidate.title, reason: "modern biography or list" });
      continue;
    }
    picked = candidate;
  }
  if (skipped.length) console.log(`[daily] skipped off-topic: ${skipped.join(", ")}`);
  if (!picked) return NextResponse.json({ error: "no title found", skipped }, { status: 500 });
  const { grp, title } = picked;

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

  return NextResponse.json({ status: "picked", article: row, skipped });
}
