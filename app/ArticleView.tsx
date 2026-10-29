"use client";

import { useState } from "react";

export type Img = { src: string; width?: number; height?: number; caption: string; credit: string };

export type Article = {
  day?: string;
  grp: string;
  title: string;
  url: string;
  summary: string;
  images?: Img[] | null;
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

function formatDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function ArticleView({ initial }: { initial: Article | null }) {
  const [article, setArticle] = useState<Article | null>(initial);
  const [isPreview, setIsPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TEMPORARY: "Try another" cycles random articles without saving them.
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

  const button = (
    <div className="preview-bar">
      <button onClick={tryAnother} disabled={loading}>
        {loading ? "Finding an article…" : "Try another article"}
      </button>
      {isPreview && initial && (
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
      {error && <span className="err">{error}</span>}
    </div>
  );

  if (!article) {
    return (
      <>
        {button}
        <p className="kicker">Ancient Daily</p>
        <h1>No article yet</h1>
        <p>The first one arrives after the daily job runs.</p>
      </>
    );
  }

  const paras = article.summary.split(/\n+/).filter(Boolean);
  const fact = paras.find((p) => p.startsWith("Surprising fact:"));
  const body = paras.filter((p) => p !== fact);
  const images = article.images ?? [];
  const [hero, ...gallery] = images;

  return (
    <div className={loading ? "dim" : undefined}>
      {button}
      <p className="kicker">
        {isPreview || !article.day ? "Preview" : formatDay(article.day)} · <span>{article.grp}</span>
      </p>
      <h1>{article.title}</h1>
      {hero && <Figure img={hero} className="hero" />}
      {body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {fact && <p className="fact">{fact}</p>}
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
