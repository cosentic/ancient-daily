// Loads any pool article for /a/[title]: cached summary if we have one,
// otherwise fetch + summarize once and cache it.

import { cache } from "react";
import { db } from "@/lib/db";
import { GROUPS, fetchArticle, fetchImages } from "@/lib/wiki";
import { summarize, SELF_REFERENCE } from "@/lib/summarize";
import type { WikiImage } from "@/lib/wiki";

export type Loaded = {
  grp: string;
  title: string;
  url: string;
  summary: string;
  images: WikiImage[];
  /** Set when this article was a daily pick (most recent date). */
  day?: string;
};

export async function saveToCache(a: Omit<Loaded, "day">) {
  const { error } = await db()
    .from("article_cache")
    .upsert({ ...a, created_at: new Date().toISOString() });
  if (error) console.warn("[article_cache] save failed:", error.message);
}

/** Title of the most recent daily pick, or null if there isn't one yet. */
export async function todaysTitle(): Promise<string | null> {
  const { data } = await db()
    .from("daily_articles")
    .select("title")
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.title as string) ?? null;
}

/** The last few daily picks, newest first. */
export async function recentDaily(limit = 8) {
  const { data } = await db()
    .from("daily_articles")
    .select("day, title")
    .order("day", { ascending: false })
    .limit(limit);
  return (data ?? []) as { day: string; title: string }[];
}

async function load(title: string): Promise<Loaded | null> {
  const supabase = db();

  const [{ data: daily }, { data: cached }] = await Promise.all([
    supabase
      .from("daily_articles")
      .select("day, grp, title, url, summary, images")
      .eq("title", title)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("article_cache")
      .select("grp, title, url, summary, images")
      .eq("title", title)
      .maybeSingle(),
  ]);
  const day = (daily?.day as string) ?? undefined;

  // Summaries that talk about "the article" instead of the subject get regenerated.
  if (cached?.summary && !SELF_REFERENCE.test(cached.summary)) {
    return { ...cached, images: cached.images ?? [], day } as Loaded;
  }
  if (daily?.summary && !SELF_REFERENCE.test(daily.summary)) {
    // Daily picks saved before images existed: fetch them now.
    const images =
      daily.images ?? (await fetchImages(daily.title).catch(() => [] as WikiImage[]));
    return { ...daily, images, day } as Loaded;
  }

  // Only summarize titles that are in the pool, so the route can't be used
  // to run Claude on arbitrary Wikipedia pages.
  const { data: groups } = await supabase.from("pool").select("grp").eq("title", title);
  if (!groups?.length && !daily) return null;
  // An article can sit in several groups (Caracalla: Greece & Rome and Ancient
  // Britain); label it with the first one in GROUPS order.
  const order = Object.keys(GROUPS);
  const rank = (g: string) => (order.indexOf(g) === -1 ? 99 : order.indexOf(g));
  const grp =
    (groups ?? []).map((g) => g.grp as string).sort((a, b) => rank(a) - rank(b))[0] ??
    (daily?.grp as string);

  const article = await fetchArticle(title);
  if (!article.body && !article.lead) return null;
  const summary = await summarize(article.title, article.body, article.lead);
  const loaded = {
    grp,
    // Keep the requested title as the key so links resolve to this cache row.
    title,
    url: article.url,
    summary,
    images: article.images,
  };
  await saveToCache(loaded);
  return { ...loaded, title: article.title, day };
}

/** Deduplicated per request, so the page and its metadata share one load. */
export const loadArticle = cache(load);
