import { NextResponse } from "next/server";
import { db, isAdmin } from "@/lib/db";
import { GROUPS, buildGroup } from "@/lib/wiki";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Rebuilds ONE group's pool per call, choosing the one refreshed longest ago
 * (never-built groups first). Run daily, each group refreshes about weekly,
 * and every run stays well under the function time limit.
 * Override with ?group=Celts.
 */
export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = db();

  // Drop groups that are no longer configured (their pool rows cascade),
  // and make sure every configured group has a row.
  const names = Object.keys(GROUPS);
  const { error: dropErr } = await supabase
    .from("pool_groups")
    .delete()
    .not("grp", "in", `(${names.map((n) => `"${n}"`).join(",")})`);
  if (dropErr) throw dropErr;
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

  // Record the outcome either way, so a failing group doesn't block the others
  // and the reason is visible in pool_groups.last_log.
  const note = async (lastLog: string) =>
    supabase
      .from("pool_groups")
      .update({ refreshed_at: new Date().toISOString(), last_log: lastLog })
      .eq("grp", group);

  let titles: string[];
  let log: string[];
  try {
    ({ titles, log } = await buildGroup(group));
  } catch (e) {
    const msg = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[refresh-pool] ${group}: ${msg}`);
    await note(msg);
    return NextResponse.json({ group, error: msg }, { status: 502 });
  }
  console.log(`[refresh-pool] ${group}: ${titles.length} titles\n${log.join("\n")}`);

  // Don't wipe a working pool if Wikipedia returned nothing.
  if (titles.length === 0) {
    await note(`0 titles; kept previous pool\n${log.join("\n")}`);
    return NextResponse.json({ group, count: 0, log, kept: "previous pool" });
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
    .update({
      refreshed_at: new Date().toISOString(),
      article_count: titles.length,
      last_log: log.join("\n"),
    })
    .eq("grp", group);
  if (updErr) throw updErr;

  return NextResponse.json({ group, count: titles.length, log });
}
