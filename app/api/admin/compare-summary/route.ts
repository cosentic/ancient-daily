import { NextResponse } from "next/server";
import { db, isAdmin } from "@/lib/db";
import { fetchBody, fetchHeader } from "@/lib/wiki";
import { summarize, SYSTEM_SHORT } from "@/lib/summarize";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * TEMPORARY (admin only): returns an article's saved summary next to a fresh
 * shorter one written with SYSTEM_SHORT. Saves nothing.
 *   /api/admin/compare-summary?title=Battle%20of%20Cannae&key=...
 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const title = new URL(req.url).searchParams.get("title");
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const supabase = db();
  const [{ data: cached }, { data: daily }] = await Promise.all([
    supabase.from("article_cache").select("summary").eq("title", title).maybeSingle(),
    supabase.from("daily_articles").select("summary").eq("title", title).limit(1).maybeSingle(),
  ]);
  const current = (cached?.summary ?? daily?.summary ?? "") as string;

  const [header, body] = await Promise.all([fetchHeader(title), fetchBody(title)]);
  const shorter = await summarize(header.title, body, header.lead, SYSTEM_SHORT);

  return NextResponse.json({
    title: header.title,
    current: { words: words(current), text: current },
    shorter: { words: words(shorter), text: shorter },
  });
}
