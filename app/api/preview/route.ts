import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickAndSummarize } from "@/lib/pick";
import { saveToCache } from "@/lib/article";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * TEMPORARY: for the "Try another" button. Picks and summarizes a random
 * article, caches it, and returns its title; the page then opens it at
 * /a/<title>. Doesn't change today's pick or mark anything as seen.
 */
export async function POST() {
  const picked = await pickAndSummarize(db());
  if (!picked) return NextResponse.json({ error: "no article found" }, { status: 503 });
  await saveToCache({
    grp: picked.grp,
    title: picked.title,
    url: picked.url,
    summary: picked.summary,
    images: picked.images,
  });
  return NextResponse.json({ title: picked.title });
}
