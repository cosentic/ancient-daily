import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadArticle } from "@/lib/article";
import { linkify } from "@/lib/links";
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${titleFrom(slug)} · Ancient Daily`,
    // Don't let crawlers walk every link and trigger summaries.
    robots: { index: false, follow: false },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const title = titleFrom(slug);
  const article = await loadArticle(title);
  if (!article) notFound();
  const linked = await linkify(article.summary, article.title);

  return (
    <main>
      <ArticleView key={title} initial={{ ...article, linked }} mode="article" />
    </main>
  );
}
