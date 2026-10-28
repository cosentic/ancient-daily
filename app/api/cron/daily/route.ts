import { NextResponse } from "next/server";
import { db, isAuthorized, todayET } from "@/lib/db";
import { pickAndSummarize } from "@/lib/pick";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Picks and saves today's article (safe to re-run: keeps an existing pick). */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = db();
  const day = todayET();

  const { data: existing } = await supabase
    .from("daily_articles")
    .select("*")
    .eq("day", day)
    .maybeSingle();
  if (existing) return NextResponse.json({ status: "already picked", article: existing });

  const picked = await pickAndSummarize(supabase);
  if (!picked) {
    return NextResponse.json(
      { error: "no title found; is the pool empty? run /api/cron/refresh-pool" },
      { status: 503 },
    );
  }

  const { skipped, ...article } = picked;
  const row = { day, ...article };
  const { error: insErr } = await supabase
    .from("daily_articles")
    .upsert(row, { onConflict: "day", ignoreDuplicates: true });
  if (insErr) throw insErr;

  return NextResponse.json({ status: "picked", article: row, skipped });
}
