import { db } from "@/lib/db";
import ArticleView, { type Article } from "./ArticleView";

export const dynamic = "force-dynamic";

type Row = Article & { day: string };

function formatDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function Home() {
  let rows: Row[] = [];
  try {
    const { data } = await db()
      .from("daily_articles")
      .select("day, grp, title, url, summary")
      .order("day", { ascending: false })
      .limit(8);
    rows = (data as Row[]) ?? [];
  } catch {
    rows = [];
  }

  return (
    <main>
      <ArticleView initial={rows[0] ?? null} />

      {rows.length > 1 && (
        <section className="past">
          <h2>Previously</h2>
          <ul>
            {rows.slice(1).map((r) => (
              <li key={r.day}>
                <time>{formatDay(r.day)}</time>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
