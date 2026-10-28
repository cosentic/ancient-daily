import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchArticle, isOffTopic } from "@/lib/wiki";
import { summarize } from "@/lib/summarize";

export type Picked = {
  grp: string;
  title: string;
  url: string;
  lead: string;
  summary: string;
  skipped: string[];
};

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Random group, then a random unseen title in it. Skips (and permanently
 * excludes) modern biographies and list pages; allows repeats only once
 * everything has been seen. Fetches and summarizes the winner.
 * Returns null if the pool is empty. Does NOT save anything to daily_articles.
 */
export async function pickAndSummarize(supabase: SupabaseClient): Promise<Picked | null> {
  const { data: groups, error } = await supabase
    .from("pool_groups")
    .select("grp")
    .gt("article_count", 0);
  if (error) throw error;
  if (!groups?.length) return null;
  const names = groups.map((r) => r.grp as string);

  async function pickOnce(): Promise<{ grp: string; title: string } | null> {
    for (const allowRepeat of [false, true]) {
      for (const g of shuffle([...names])) {
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
  if (skipped.length) console.log(`[pick] skipped off-topic: ${skipped.join(", ")}`);
  if (!picked) return null;

  const article = await fetchArticle(picked.title);
  const summary = await summarize(article.title, article.body, article.lead);
  return {
    grp: picked.grp,
    title: article.title,
    url: article.url,
    lead: article.lead,
    summary,
    skipped,
  };
}
