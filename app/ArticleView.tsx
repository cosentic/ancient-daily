"use client";

import { createContext, useContext, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { articleHref } from "@/lib/paras";

export type Img = { src: string; width?: number; height?: number; caption: string; credit: string };

export type ArticleHeader = {
  day?: string;
  grp: string;
  title: string;
  url: string;
  images?: Img[] | null;
};

/** Lets the summary's links (rendered separately) open articles through this view. */
const NavContext = createContext<(title: string, e: React.MouseEvent<HTMLAnchorElement>) => void>(
  () => {},
);
export const useOpenArticle = () => useContext(NavContext);

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

/** Same layout as app/a/[...slug]/loading.tsx: shown between tapping a link and the new page arriving. */
function OpeningView({ title }: { title: string }) {
  return (
    <>
      <p className="kicker">Ancient Daily</p>
      <h1>{title}</h1>
      <p className="loading-status">Loading article…</p>
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

export default function ArticleView({
  article,
  isToday,
  gist,
  body,
}: {
  article: ArticleHeader;
  isToday: boolean;
  /** "The Gist" box; streamed in by the server. */
  gist: React.ReactNode;
  /** The summary; streamed in by the server after the rest of the page. */
  body: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null); // title being opened
  const [finding, setFinding] = useState(false); // "Try another" is picking a title

  function go(title: string) {
    setOpening(title);
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

  // TEMPORARY: "Try another" picks a random title (~1s), then opens it.
  async function tryAnother() {
    setError(null);
    setFinding(true);
    try {
      const res = await fetch("/api/random", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      go(data.title as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setFinding(false);
    }
  }

  // Coming back via the browser's back button: drop the in-between state.
  useEffect(() => {
    const reset = () => {
      setOpening(null);
      setFinding(false);
    };
    window.addEventListener("pageshow", reset);
    window.addEventListener("popstate", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      window.removeEventListener("popstate", reset);
    };
  }, []);

  if (opening) return <OpeningView title={opening} />;

  const images = article.images ?? [];
  const [hero, ...gallery] = images;

  return (
    <NavContext.Provider value={openArticle}>
      <div className="preview-bar">
        <button onClick={tryAnother} disabled={finding}>
          {finding ? "Opening…" : "Try another article"}
        </button>
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
      {gist}
      {hero && <Figure img={hero} className="hero" />}
      {body}
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
    </NavContext.Provider>
  );
}
