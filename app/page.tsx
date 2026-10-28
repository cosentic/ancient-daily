import { db } from "@/lib/db";

export const revalidate = 300;

type Row = { day: string; grp: string; title: string; url: string; summary: string };

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

  const today = rows[0];
  if (!today) {
    return (
      <main>
        <p className="kicker">Ancient Daily</p>
        <h1>No article yet</h1>
        <p>The first one arrives after the daily job runs.</p>
      </main>
    );
  }

  const paras = today.summary.split(/\n+/).filter(Boolean);
  const fact = paras.find((p) => p.startsWith("Surprising fact:"));
  const body = paras.filter((p) => p !== fact);

  return (
    <main>
      <p className="kicker">
        {formatDay(today.day)} · <span>{today.grp}</span>
      </p>
      <h1>{today.title}</h1>
      {body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {fact && <p className="fact">{fact}</p>}
      <p className="more">
        <a href={today.url} target="_blank" rel="noreferrer">
          Read the full article on Wikipedia →
        </a>
      </p>

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
