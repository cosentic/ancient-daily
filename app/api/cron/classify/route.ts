import { NextResponse } from "next/server";
import { db, isAdmin } from "@/lib/db";
import { classifyBatch } from "@/lib/classify";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BATCH = 50;
const CONCURRENCY = 3;
const TIME_BUDGET_MS = 230_000; // stop well before the 300s limit
const STALE_DAYS = 30; // re-check views/types monthly

/**
 * Classifies pool titles that have no metadata yet (or stale metadata), as
 * many as fit in the time budget. Run repeatedly until `remaining` is 0.
 */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const supabase = db();

  // ?before=<ISO time> also treats anything classified before then as stale
  // (used to re-run everything after changing the classification rules).
  const monthAgo = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
  const before = new URL(req.url).searchParams.get("before");
  const staleBefore = before && before > monthAgo ? new Date(before).toISOString() : monthAgo;
  const [{ data: poolRows, error: pErr }, { data: metaRows, error: mErr }] = await Promise.all([
    supabase.from("pool").select("title").limit(20000),
    supabase.from("pool_meta").select("title, classified_at").limit(20000),
  ]);
  if (pErr) throw pErr;
  if (mErr) throw mErr;
  const fresh = new Set(
    (metaRows ?? []).filter((m) => m.classified_at >= staleBefore).map((m) => m.title),
  );
  const todo = [...new Set((poolRows ?? []).map((r) => r.title as string))].filter(
    (t) => !fresh.has(t),
  );

  let done = 0;
  const tally: Record<string, number> = {};
  const errors: string[] = [];
  async function runBatch(i: number) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const rows = await classifyBatch(batch);
      const { error } = await supabase
        .from("pool_meta")
        .upsert(rows.map((r) => ({ ...r, classified_at: new Date().toISOString() })));
      if (error) throw error;
      done += rows.length;
      for (const r of rows) tally[r.kind] = (tally[r.kind] ?? 0) + 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`batch at ${i}: ${msg}`);
      console.error(`[classify] batch at ${i}: ${msg}`);
    }
  }

  // A few batches at a time (Wikidata allows ~5 concurrent queries per client).
  for (let i = 0; i < todo.length; i += BATCH * CONCURRENCY) {
    if (Date.now() - started > TIME_BUDGET_MS || errors.length >= 3) break;
    const starts = [];
    for (let j = 0; j < CONCURRENCY && i + j * BATCH < todo.length; j++) starts.push(i + j * BATCH);
    await Promise.all(starts.map(runBatch));
  }

  const result = {
    classified: done,
    remaining: todo.length - done,
    kinds: tally,
    seconds: Math.round((Date.now() - started) / 1000),
    errors,
  };
  console.log(`[classify] ${JSON.stringify(result)}`);
  return NextResponse.json(result);
}
