"use client";

import Link from "next/link";
import { articleHref, type Seg } from "@/lib/paras";
import { useOpenArticle } from "./ArticleView";

function Para({ segs, className }: { segs: Seg[]; className?: string }) {
  const open = useOpenArticle();
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
            onClick={(e) => open(s.title, e)}
          >
            {s.text}
          </Link>
        ),
      )}
    </p>
  );
}

/** The summary paragraphs with links, then the "Surprising fact" line. */
export default function SummaryBody({ paras }: { paras: Seg[][] }) {
  const text = (segs: Seg[]) => segs.map((s) => (typeof s === "string" ? s : s.text)).join("");
  const factIndex = paras.findIndex((segs) => text(segs).startsWith("Surprising fact:"));
  return (
    <div className="summary">
      {paras.map((segs, i) => (i === factIndex ? null : <Para key={i} segs={segs} />))}
      {factIndex >= 0 && <Para segs={paras[factIndex]} className="fact" />}
    </div>
  );
}
