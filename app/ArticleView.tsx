"use client";

import { useState } from "react";
import Link from "next/link";
import { articleHref, splitParas, type Seg } from "@/lib/paras";

export type Img = { src: string; width?: number; height?: number; caption: string; credit: string };

export type Article = {
  day?: string;
  grp: string;
  title: string;
  url: string;
  summary: string;
  images?: Img[] | null;
  /** Summary paragraphs with links to other pool articles (computed on the server). */
  linked?: Seg[][];
};

function Figure({ img, className }: { img: Img; className: string }) {
  return (
    <figure className={className}>
      <a href={img.credit} target="_blank" rel="noreferrer" title="Image credit and license">
        <img src={img.src} alt={img.caption || ""} loading="lazy" decoding="async" />
      </a>
      {img.caption && <figcaption>{img.caption}</figcaption>}
    </figure>
  );
}

function Para({ segs, className }: { segs: Seg[]; className?: string }) {
  return (
    <p className={className}>
      {segs.map((s, i) =>
        typeof s === "string" ? (
          s
        ) : (
          <Link key={i} href={articleHref(s.title)} className="xref" rel="nofollow">
            {s.text}
          </Link>
        ),
      )}
    </p>
  );
}

function formatDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function ArticleView({
  initial,
  mode = "home",
}: {
  initial: Article | null;
  mode?: "home" | "article";
}) {
  const [article, setArticle] = useState<Article | null>(initial);
  const [isPreview, setIsPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TEMPORARY: "Try another" cycles random articles without changing today's pick.
  async function tryAnother() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/preview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setArticle(data);
      setIsPreview(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const bar = (
    <div className="preview-bar">
      <button onClick={tryAnother} disabled={loading}>
        {loading ? "Finding an article…" : "Try another article"}
      </button>
      {mode === "home" && isPreview && initial && (
        <button
          className="link"
          onClick={() => {
            setArticle(initial);
            setIsPreview(false);
          }}
        >
          Back to today’s
        </button>
      )}
      {mode === "article" && (
        <Link href="/" className="home-link">
          ← Today’s article
        </Link>
      )}
      {error && <span className="err">{error}</span>}
    </div>
  );

  if (!article) {
    return (
      <>
        {bar}
        <p className="kicker">Ancient Daily</p>
        <h1>No article yet</h1>
        <p>The first one arrives after the daily job runs.</p>
      </>
    );
  }

  const paras: Seg[][] = article.linked ?? splitParas(article.summary).map((p) => [p]);
  const text = (segs: Seg[]) => segs.map((s) => (typeof s === "string" ? s : s.text)).join("");
  const factIndex = paras.findIndex((segs) => text(segs).startsWith("Surprising fact:"));
  const images = article.images ?? [];
  const [hero, ...gallery] = images;
  const label = isPreview ? "Preview" : article.day ? formatDay(article.day) : null;

  return (
    <div className={loading ? "dim" : undefined}>
      {bar}
      <p className="kicker">
        {label && <>{label} · </>}
        <span>{article.grp}</span>
      </p>
      <h1>{article.title}</h1>
      {hero && <Figure img={hero} className="hero" />}
      {paras.map((segs, i) =>
        i === factIndex ? null : <Para key={i} segs={segs} />,
      )}
      {factIndex >= 0 && <Para segs={paras[factIndex]} className="fact" />}
      {gallery.length > 0 && (
        <div className="gallery">
          {gallery.map((img) => (
            <Figure key={img.src} img={img} className="thumb" />
          ))}
        </div>
      )}
      {images.length > 0 && (
        <p className="credit">
          Images from Wikipedia and Wikimedia Commons. Tap an image for its author and license.
        </p>
      )}
      <p className="more">
        <a href={article.url} target="_blank" rel="noreferrer">
          Read the full article on Wikipedia →
        </a>
      </p>
    </div>
  );
}
