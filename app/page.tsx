import { db } from "@/lib/db";
import { fetchImages } from "@/lib/wiki";
import { linkify } from "@/lib/links";
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
      .select("day, grp, title, url, summary, images")
      .order("day", { ascending: false })
      .limit(8);
    rows = (data as Row[]) ?? [];
  } catch {
    rows = [];
  }

  // Articles saved before images were added: fetch them live for today's.
  const today = rows[0];
  if (today && !today.images) {
    today.images = await fetchImages(today.title).catch(() => []);
  }
  if (today) today.linked = await linkify(today.summary, today.title);

  return (
    <main>
      <ArticleView initial={today ?? null} />

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
