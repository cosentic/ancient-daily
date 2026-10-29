import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickAndSummarize } from "@/lib/pick";
import { saveToCache } from "@/lib/article";
import { linkify } from "@/lib/links";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * TEMPORARY: picks and summarizes a random article for the "Try another"
 * button. Doesn't change today's pick or mark anything as seen; the summary
 * is cached so links to this article later load instantly.
 */
export async function POST() {
  const picked = await pickAndSummarize(db());
  if (!picked) return NextResponse.json({ error: "no article found" }, { status: 503 });
  const { skipped, lead, ...article } = picked;
  await saveToCache({
    grp: article.grp,
    title: article.title,
    url: article.url,
    summary: article.summary,
    images: article.images,
  });
  const linked = await linkify(article.summary, article.title);
  return NextResponse.json({ ...article, linked });
}
