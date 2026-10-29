import type { SupabaseClient } from "@supabase/supabase-js";
import { GROUPS, fetchArticle, isOffTopic, type WikiImage } from "@/lib/wiki";
import { summarize, gistOf } from "@/lib/summarize";
import { BLOCKED_TITLE } from "@/lib/article";

export type Picked = {
  grp: string;
  title: string;
  url: string;
  lead: string;
  summary: string;
  gist: string[] | null;
  images: WikiImage[];
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
 * everything has been seen. Fast: no summarizing. Returns null if the pool is empty.
 */
export async function pickTitle(
  supabase: SupabaseClient,
): Promise<{ grp: string; title: string; skipped: string[] } | null> {
  const { data: groups, error } = await supabase
    .from("pool_groups")
    .select("grp")
    .gt("article_count", 0);
  if (error) throw error;
  if (!groups?.length) return null;
  const names = groups.map((r) => r.grp as string).filter((g) => g in GROUPS);
  if (!names.length) return null;

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
    if (BLOCKED_TITLE.test(candidate.title) || (await isOffTopic(candidate.title))) {
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
  return { ...picked, skipped };
}

/** pickTitle, then fetch and summarize it (the daily job). Saves nothing. */
export async function pickAndSummarize(supabase: SupabaseClient): Promise<Picked | null> {
  const picked = await pickTitle(supabase);
  if (!picked) return null;
  const { skipped } = picked;
  const article = await fetchArticle(picked.title);
  // Summary and The Gist in parallel.
  const [summary, gist] = await Promise.all([
    summarize(article.title, article.body, article.lead),
    gistOf(article.title, article.body || article.lead),
  ]);
  return {
    grp: picked.grp,
    title: article.title,
    url: article.url,
    lead: article.lead,
    summary,
    gist,
    images: article.images,
    skipped,
  };
}
