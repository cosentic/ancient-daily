import { NextResponse } from "next/server";
import { db, isAuthorized } from "@/lib/db";
import { GROUPS, buildGroup } from "@/lib/wiki";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Rebuilds ONE group's pool per call, choosing the one refreshed longest ago
 * (never-built groups first). Run daily, each of the 7 groups refreshes about
 * weekly, and every run stays well under the function time limit.
 * Override with ?group=Celts.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = db();

  // Make sure every configured group has a row.
  const names = Object.keys(GROUPS);
  const { error: seedErr } = await supabase
    .from("pool_groups")
    .upsert(names.map((grp) => ({ grp })), { onConflict: "grp", ignoreDuplicates: true });
  if (seedErr) throw seedErr;

  let group: string = new URL(req.url).searchParams.get("group") ?? "";
  if (!group) {
    const { data, error } = await supabase
      .from("pool_groups")
      .select("grp, refreshed_at")
      .in("grp", names)
      .order("refreshed_at", { ascending: true, nullsFirst: true })
      .limit(1);
    if (error) throw error;
    group = data?.[0]?.grp ?? names[0];
  }
  if (!GROUPS[group]) {
    return NextResponse.json({ error: `unknown group ${group}` }, { status: 400 });
  }

  const { titles, log } = await buildGroup(group);

  // Don't wipe a working pool if Wikipedia returned nothing.
  if (titles.length === 0) {
    return NextResponse.json({ group, count: 0, log, kept: "previous pool" }, { status: 502 });
  }

  const { error: delErr } = await supabase.from("pool").delete().eq("grp", group);
  if (delErr) throw delErr;
  for (let i = 0; i < titles.length; i += 500) {
    const rows = titles.slice(i, i + 500).map((title) => ({ grp: group, title }));
    const { error } = await supabase.from("pool").insert(rows);
    if (error) throw error;
  }
  const { error: updErr } = await supabase
    .from("pool_groups")
    .update({ refreshed_at: new Date().toISOString(), article_count: titles.length })
    .eq("grp", group);
  if (updErr) throw updErr;

  return NextResponse.json({ group, count: titles.length, log });
}
