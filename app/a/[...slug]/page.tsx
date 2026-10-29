import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadArticle, recentDaily, todaysTitle } from "@/lib/article";
import { linkify } from "@/lib/links";
import { articleHref, splitParas } from "@/lib/paras";
import ArticleView from "../../ArticleView";

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
  const article = await loadArticle(title).catch(() => null);
  const first = article ? (splitParas(article.summary)[0] ?? "") : "";
  const description = first.length > 200 ? `${first.slice(0, 197).trimEnd()}…` : first;
  const image = article?.images?.[0]?.src;
  return {
    title: `${article?.title ?? title} · Ancient Daily`,
    description: description || undefined,
    alternates: { canonical: articleHref(title) },
    openGraph: {
      title: article?.title ?? title,
      description: description || undefined,
      url: articleHref(title),
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
    // Shareable, but keep crawlers from walking every link and triggering summaries.
    robots: { index: false, follow: false },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const title = titleFrom(slug);
  const [article, today, recent] = await Promise.all([
    loadArticle(title),
    todaysTitle().catch(() => null),
    recentDaily(8).catch(() => []),
  ]);
  if (!article) notFound();
  const linked = await linkify(article.summary, article.title);
  const isToday = today === title || today === article.title;
  const previously = recent.filter((r) => r.title !== title && r.title !== article.title).slice(0, 7);

  return (
    <main>
      <ArticleView key={title} article={{ ...article, linked }} isToday={isToday} />

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
