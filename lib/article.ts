// Loads any pool article for /a/[title]: cached summary if we have one,
// otherwise fetch + summarize once and cache it.

import { db } from "@/lib/db";
import { GROUPS, fetchArticle } from "@/lib/wiki";
import { summarize, SELF_REFERENCE } from "@/lib/summarize";
import type { WikiImage } from "@/lib/wiki";

export type Loaded = {
  grp: string;
  title: string;
  url: string;
  summary: string;
  images: WikiImage[];
};

export async function saveToCache(a: Loaded) {
  const { error } = await db()
    .from("article_cache")
    .upsert({ ...a, created_at: new Date().toISOString() });
  if (error) console.warn("[article_cache] save failed:", error.message);
}

export async function loadArticle(title: string): Promise<Loaded | null> {
  const supabase = db();

  const { data: cached } = await supabase
    .from("article_cache")
    .select("grp, title, url, summary, images")
    .eq("title", title)
    .maybeSingle();
  // Summaries that talk about "the article" instead of the subject get regenerated.
  if (cached?.summary && !SELF_REFERENCE.test(cached.summary)) {
    return { ...cached, images: cached.images ?? [] } as Loaded;
  }

  const { data: daily } = await supabase
    .from("daily_articles")
    .select("grp, title, url, summary, images")
    .eq("title", title)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (daily?.summary && !SELF_REFERENCE.test(daily.summary)) {
    return { ...daily, images: daily.images ?? [] } as Loaded;
  }

  // Only summarize titles that are in the pool, so the route can't be used
  // to run Claude on arbitrary Wikipedia pages.
  const { data: groups } = await supabase.from("pool").select("grp").eq("title", title);
  if (!groups?.length) return null;
  // An article can sit in several groups (Caracalla: Greece & Rome and Ancient
  // Britain); label it with the first one in GROUPS order.
  const order = Object.keys(GROUPS);
  const rank = (g: string) => (order.indexOf(g) === -1 ? 99 : order.indexOf(g));
  const grp = groups.map((g) => g.grp as string).sort((a, b) => rank(a) - rank(b))[0];

  const article = await fetchArticle(title);
  if (!article.body && !article.lead) return null;
  const summary = await summarize(article.title, article.body, article.lead);
  const loaded: Loaded = {
    grp,
    // Keep the pool's title as the key so links resolve to this cache row.
    title,
    url: article.url,
    summary,
    images: article.images,
  };
  await saveToCache(loaded);
  return { ...loaded, title: article.title };
}
