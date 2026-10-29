// Shared by server and client: how a summary splits into paragraphs.

/** A run of text, or a link to another article in the pool. */
export type Seg = string | { text: string; title: string };

export function splitParas(summary: string): string[] {
  return summary.split(/\n+/).map((p) => p.trim()).filter(Boolean);
}

export function articleHref(title: string) {
  return `/a/${encodeURIComponent(title)}`;
}
