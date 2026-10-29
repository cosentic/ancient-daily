// Loads articles for /a/[title] in two stages so the page can render fast:
//   loadHeader:  title, group, date, URL, images (+ summary if already saved)  ~0.5s
//   loadSummary: the Claude summary, generated and cached on first visit       ~10s

import { cache } from "react";
import { db } from "@/lib/db";
import { GROUPS, fetchBody, fetchHeader, fetchImages } from "@/lib/wiki";
import { summarize, SELF_REFERENCE } from "@/lib/summarize";
import type { WikiImage } from "@/lib/wiki";

export type Header = {
  grp: string;
  title: string; // display title
  url: string;
  lead: string; // Wikipedia's intro paragraph (fallback text, link previews)
  images: WikiImage[];
  /** Set when this article was a daily pick (most recent date). */
  day?: string;
  /** Present when a usable summary is already saved. */
  summary?: string;
};

export async function saveToCache(a: {
  title: string;
  grp: string;
  url: string;
  summary: string;
  images: WikiImage[];
}) {
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

const usable = (s?: string | null) => !!s && !SELF_REFERENCE.test(s);

async function header(title: string): Promise<Header | null> {
  const supabase = db();
  const [{ data: daily }, { data: cached }] = await Promise.all([
    supabase
      .from("daily_articles")
      .select("day, grp, title, url, lead, summary, images")
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

  // Already summarized: everything comes from the database.
  if (cached && usable(cached.summary)) {
    return {
      grp: cached.grp,
      title: cached.title,
      url: cached.url,
      lead: "",
      images: cached.images ?? [],
      day,
      summary: cached.summary,
    };
  }
  if (daily && usable(daily.summary)) {
    const images =
      daily.images ?? (await fetchImages(daily.title).catch(() => [] as WikiImage[]));
    return { ...daily, lead: daily.lead ?? "", images, day } as Header;
  }

  // New article: only titles in the pool, so the route can't be used to run
  // Claude on arbitrary Wikipedia pages.
  const { data: groups } = await supabase.from("pool").select("grp").eq("title", title);
  if (!groups?.length && !daily) return null;
  // An article can sit in several groups (Caracalla: Greece & Rome and Ancient
  // Britain); label it with the first one in GROUPS order.
  const order = Object.keys(GROUPS);
  const rank = (g: string) => (order.indexOf(g) === -1 ? 99 : order.indexOf(g));
  const grp =
    (groups ?? []).map((g) => g.grp as string).sort((a, b) => rank(a) - rank(b))[0] ??
    (daily?.grp as string);

  const h = await fetchHeader(title);
  return { grp, ...h, day };
}

async function summary(title: string): Promise<string> {
  const h = await loadHeader(title);
  if (!h) return "";
  if (h.summary) return h.summary;
  const body = await fetchBody(title).catch(() => "");
  if (!body && !h.lead) return "";
  const text = await summarize(h.title, body, h.lead);
  // Cache under the requested title so links to it resolve here next time.
  await saveToCache({ title, grp: h.grp, url: h.url, summary: text, images: h.images });
  return text;
}

/** Deduplicated per request, so the page, its metadata and the summary share one load. */
export const loadHeader = cache(header);
export const loadSummary = cache(summary);
