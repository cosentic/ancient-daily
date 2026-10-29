// Loads articles for /a/[title] in stages so the page can render fast:
//   loadHeader:  title, group, date, URL, images (+ saved summary/gist)   ~0.5s
//   loadContent: the summary and The Gist, generated in parallel and cached
//                on a first visit (~10s), instant afterwards

import { cache } from "react";
import { db } from "@/lib/db";
import { GROUPS, fetchBody, fetchHeader, fetchImages } from "@/lib/wiki";
import { summarize, gistOf, SELF_REFERENCE } from "@/lib/summarize";
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
  gist?: string[] | null;
  /** Where the saved summary lives, so a missing gist can be added to the same row. */
  savedIn?: "cache" | "daily";
};

export async function saveToCache(a: {
  title: string;
  grp: string;
  url: string;
  summary: string;
  images: WikiImage[];
  gist?: string[] | null;
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
      .select("day, grp, title, url, lead, summary, images, gist")
      .eq("title", title)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("article_cache")
      .select("grp, title, url, summary, images, gist")
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
      gist: cached.gist,
      savedIn: "cache",
    };
  }
  if (daily && usable(daily.summary)) {
    const images =
      daily.images ?? (await fetchImages(daily.title).catch(() => [] as WikiImage[]));
    return { ...daily, lead: daily.lead ?? "", images, day, savedIn: "daily" } as Header;
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

export const loadHeader = cache(header);

/**
 * The summary and The Gist as two separate promises, so each part of the page
 * can render as soon as its own piece is ready. Generated in parallel and
 * saved on a first visit; a gist missing from an older saved article is
 * generated from its summary and added to that row.
 */
function content(title: string): { summary: Promise<string>; gist: Promise<string[] | null> } {
  const h = loadHeader(title);

  const body = h.then(async (hd) => {
    if (!hd || hd.summary) return "";
    return fetchBody(title).catch(() => "");
  });

  const summary = Promise.all([h, body]).then(async ([hd, text]) => {
    if (!hd) return "";
    if (hd.summary) return hd.summary;
    if (!text && !hd.lead) return "";
    return summarize(hd.title, text, hd.lead);
  });

  const gist = Promise.all([h, body]).then(async ([hd, text]) => {
    if (!hd) return null;
    if (hd.gist?.length) return hd.gist;
    // Older saved article: write the gist from its summary (short, cheap).
    if (hd.summary) return gistOf(hd.title, hd.summary);
    if (!text && !hd.lead) return null;
    return gistOf(hd.title, text || hd.lead);
  });

  // Save once both are done (not awaited by the gist, so it can show first).
  const saved = Promise.all([h, summary, gist]).then(async ([hd, s, g]) => {
    if (!hd || !s) return;
    const supabase = db();
    if (hd.savedIn === "cache" && !hd.gist?.length && g) {
      await supabase.from("article_cache").update({ gist: g }).eq("title", title);
    } else if (hd.savedIn === "daily" && !hd.gist?.length && g) {
      await supabase.from("daily_articles").update({ gist: g }).eq("title", hd.title).eq("day", hd.day!);
    } else if (!hd.savedIn) {
      // Cache under the requested title so links to it resolve here next time.
      await saveToCache({ title, grp: hd.grp, url: hd.url, summary: s, images: hd.images, gist: g });
    }
  });

  return {
    // The summary waits for the save so the response doesn't end before it's stored.
    summary: summary.then(async (s) => {
      await saved.catch((e) => console.warn("[content] save failed:", e));
      return s;
    }),
    gist,
  };
}

/** Deduplicated per request, so the page, metadata, summary and gist share one load. */
export const loadContent = cache(content);
