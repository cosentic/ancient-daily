import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pickTitle } from "@/lib/pick";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY: for the "Try another article" button. Picks a random title from
 * the filtered pool (no summarizing, ~1s) and returns it; the page then opens
 * /a/<title>, which shows the title and images right away and fills in the
 * summary. Doesn't change today's pick or mark anything as seen.
 */
export async function POST() {
  const picked = await pickTitle(db());
  if (!picked) return NextResponse.json({ error: "no article found" }, { status: 503 });
  return NextResponse.json({ title: picked.title });
}
