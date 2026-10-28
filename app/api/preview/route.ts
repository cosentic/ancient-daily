import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickAndSummarize } from "@/lib/pick";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * TEMPORARY: picks and summarizes a random article for the "Try another"
 * button. Nothing is saved, so it doesn't change today's pick or mark
 * articles as seen. Remove this route (and PreviewButton) when done testing.
 */
export async function POST() {
  const picked = await pickAndSummarize(db());
  if (!picked) return NextResponse.json({ error: "no article found" }, { status: 503 });
  const { skipped, lead, ...article } = picked;
  return NextResponse.json(article);
}
