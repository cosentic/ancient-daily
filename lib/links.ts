// Finds mentions of other pool articles in a summary and turns them into links.

import { selectAll } from "@/lib/db";
import { splitParas, type Seg } from "@/lib/paras";

type Matcher = { re: RegExp; byLabel: Map<string, string> };
let cached: { at: number; matcher: Matcher | null } | null = null;
const TTL_MS = 60 * 60 * 1000;

/** Display label for matching: "Alesia (city)" → "Alesia". */
function labelOf(title: string) {
  return title.replace(/\s*\([^)]*\)$/, "").trim();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Titles that pass the filter (and aren't excluded), built into one regex. Cached for an hour. */
async function getMatcher(): Promise<Matcher | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.matcher;
  const [kept, excluded] = await Promise.all([
    selectAll<{ title: string }>("pool_kept", "title"),
    selectAll<{ title: string }>("pool_excluded", "title"),
  ]);
  const skip = new Set(excluded.map((r) => r.title));
  const byLabel = new Map<string, string>();
  for (const { title } of kept) {
    if (skip.has(title)) continue;
    const label = labelOf(title);
    // Too short or not a proper name: too many false matches ("Ys", "goy").
    if (label.length < 4 || !/^\p{Lu}/u.test(label)) continue;
    // Prefer the plain title when two share a label ("Alesia" vs "Alesia (city)").
    const existing = byLabel.get(label);
    if (!existing || existing.length > title.length) byLabel.set(label, title);
  }
  const labels = [...byLabel.keys()].sort((a, b) => b.length - a.length); // longest first
  const matcher = labels.length
    ? {
        re: new RegExp(`(?<![\\p{L}\\p{N}])(${labels.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "gu"),
        byLabel,
      }
    : null;
  cached = { at: Date.now(), matcher };
  return matcher;
}

/**
 * Splits a summary into paragraphs of text and links. Each target is linked
 * once (its first mention), and the article never links to itself.
 */
export async function linkify(summary: string, selfTitle: string): Promise<Seg[][]> {
  const paras = splitParas(summary);
  const matcher = await getMatcher().catch((e) => {
    console.warn("[links] matcher unavailable:", e);
    return null;
  });
  if (!matcher) return paras.map((p) => [p]);

  const used = new Set<string>([selfTitle, labelOf(selfTitle)]);
  return paras.map((para) => {
    const segs: Seg[] = [];
    let last = 0;
    for (const m of para.matchAll(matcher.re)) {
      const label = m[1];
      const title = matcher.byLabel.get(label);
      if (!title || used.has(title) || used.has(label)) continue;
      used.add(title);
      if (m.index! > last) segs.push(para.slice(last, m.index));
      segs.push({ text: label, title });
      last = m.index! + label.length;
    }
    if (last < para.length) segs.push(para.slice(last));
    return segs;
  });
}
