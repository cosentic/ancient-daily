"use client";

import { usePathname } from "next/navigation";

/** Shown while an article loads: its title, then a "Loading article…" status. */
export default function Loading() {
  const path = usePathname() ?? "";
  const raw = path.replace(/^\/a\//, "");
  let title = raw;
  try {
    title = decodeURIComponent(raw);
  } catch {}

  return (
    <main>
      <p className="kicker">Ancient Daily</p>
      <h1>{title || "Ancient Daily"}</h1>
      <p className="loading-status">Loading article…</p>
    </main>
  );
}
