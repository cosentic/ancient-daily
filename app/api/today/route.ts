import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public: the most recent daily article. ?days=7 returns the last N. */
export async function GET(req: Request) {
  const n = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 1, 1), 60);
  const { data, error } = await db()
    .from("daily_articles")
    .select("day, grp, title, url, summary, images")
    .order("day", { ascending: false })
    .limit(n);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(n === 1 ? (data?.[0] ?? null) : data, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=3600" },
  });
}
