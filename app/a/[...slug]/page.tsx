import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadHeader, loadSummary, recentDaily, todaysTitle } from "@/lib/article";
import { linkify } from "@/lib/links";
import { articleHref, splitParas } from "@/lib/paras";
import ArticleView from "../../ArticleView";
import SummaryBody from "../../SummaryBody";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // first visit summarizes the article

type Props = { params: Promise<{ slug: string[] }> };

function titleFrom(slug: string[]) {
  const joined = slug.join("/");
  try {
    return decodeURIComponent(joined);
  } catch {
    return joined;
  }
}

function formatDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** Title, opening line and lead image, so shared links preview nicely. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const title = titleFrom(slug);
  const h = await loadHeader(title).catch(() => null);
  // Use the saved summary's first paragraph if there is one, else Wikipedia's intro.
  const first = h?.summary ? (splitParas(h.summary)[0] ?? "") : (h?.lead ?? "");
  const description = first.length > 200 ? `${first.slice(0, 197).trimEnd()}…` : first;
  const image = h?.images?.[0]?.src;
  return {
    title: `${h?.title ?? title} · Ancient Daily`,
    description: description || undefined,
    alternates: { canonical: articleHref(title) },
    openGraph: {
      title: h?.title ?? title,
      description: description || undefined,
      url: articleHref(title),
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
    // Shareable, but keep crawlers from walking every link and triggering summaries.
    robots: { index: false, follow: false },
  };
}

/** Streams in after the rest of the page: instant if saved, ~10s on a first visit. */
async function Summary({ title }: { title: string }) {
  const [h, text] = await Promise.all([loadHeader(title), loadSummary(title)]);
  if (!text) {
    return <p className="loading-status">This article couldn’t be summarized right now.</p>;
  }
  const paras = await linkify(text, h?.title ?? title);
  return <SummaryBody paras={paras} />;
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const title = titleFrom(slug);
  const [h, today, recent] = await Promise.all([
    loadHeader(title),
    todaysTitle().catch(() => null),
    recentDaily(8).catch(() => []),
  ]);
  if (!h) notFound();
  const isToday = today === title || today === h.title;
  const previously = recent.filter((r) => r.title !== title && r.title !== h.title).slice(0, 7);

  return (
    <main>
      <ArticleView
        key={title}
        article={{ grp: h.grp, title: h.title, url: h.url, images: h.images, day: h.day }}
        isToday={isToday}
        body={
          <Suspense fallback={<p className="loading-status">Loading article…</p>}>
            <Summary title={title} />
          </Suspense>
        }
      />

      {previously.length > 0 && (
        <section className="past">
          <h2>Previously</h2>
          <ul>
            {previously.map((r) => (
              <li key={r.day}>
                <time>{formatDay(r.day)}</time>
                <a href={articleHref(r.title)}>{r.title}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
