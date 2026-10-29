"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function Para({
  segs,
  className,
  onOpen,
}: {
  segs: Seg[];
  className?: string;
  onOpen: (title: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <p className={className}>
      {segs.map((s, i) =>
        typeof s === "string" ? (
          s
        ) : (
          <Link
            key={i}
            href={articleHref(s.title)}
            className="xref"
            rel="nofollow"
            onClick={(e) => onOpen(s.title, e)}
          >
            {s.text}
          </Link>
        ),
      )}
    </p>
  );
}

/** Same layout as app/a/[...slug]/loading.tsx. */
function LoadingView({ title, status }: { title: string; status: string }) {
  return (
    <>
      <p className="kicker">Ancient Daily</p>
      <h1>{title}</h1>
      <p className="loading-status">{status}</p>
    </>
  );
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} · Ancient Daily`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // User dismissed the share sheet, or clipboard was blocked: nothing to do.
    }
  }
  return (
    <button className="share" onClick={share} aria-label={`Share ${title}`}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}

function formatDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function ArticleView({ article, isToday }: { article: Article; isToday: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // While navigating: what to show instead of the article (title + status line).
  const [pending, setPending] = useState<{ title: string; status: string } | null>(null);

  function go(title: string) {
    setPending({ title, status: "Loading article…" });
    window.scrollTo({ top: 0 });
    startTransition(() => router.push(articleHref(title)));
  }

  function openArticle(title: string, e: React.MouseEvent<HTMLAnchorElement>) {
    // Let modified clicks (new tab/window) behave normally.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    go(title);
  }

  // TEMPORARY: "Try another" opens a random article at its own URL.
  async function tryAnother() {
    setError(null);
    setPending({ title: "Finding an article…", status: "Picking something from the archive" });
    window.scrollTo({ top: 0 });
    try {
      const res = await fetch("/api/preview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      go(data.title as string); // already summarized and cached, so this loads instantly
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  // Coming back via the browser's back button: drop the loading state.
  useEffect(() => {
    const reset = () => setPending(null);
    window.addEventListener("pageshow", reset);
    window.addEventListener("popstate", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      window.removeEventListener("popstate", reset);
    };
  }, []);

  if (pending) return <LoadingView title={pending.title} status={pending.status} />;

  const paras: Seg[][] = article.linked ?? splitParas(article.summary).map((p) => [p]);
  const text = (segs: Seg[]) => segs.map((s) => (typeof s === "string" ? s : s.text)).join("");
  const factIndex = paras.findIndex((segs) => text(segs).startsWith("Surprising fact:"));
  const images = article.images ?? [];
  const [hero, ...gallery] = images;

  return (
    <div>
      <div className="preview-bar">
        <button onClick={tryAnother}>Try another article</button>
        {!isToday && (
          <Link href="/" className="home-link">
            ← Today’s article
          </Link>
        )}
        {error && <span className="err">{error}</span>}
      </div>
      <div className="kicker-row">
        <p className="kicker">
          {article.day && <>{formatDay(article.day)} · </>}
          <span>{article.grp}</span>
        </p>
        <ShareButton title={article.title} />
      </div>
      <h1>{article.title}</h1>
      {hero && <Figure img={hero} className="hero" />}
      {paras.map((segs, i) =>
        i === factIndex ? null : <Para key={i} segs={segs} onOpen={openArticle} />,
      )}
      {factIndex >= 0 && <Para segs={paras[factIndex]} className="fact" onOpen={openArticle} />}
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
