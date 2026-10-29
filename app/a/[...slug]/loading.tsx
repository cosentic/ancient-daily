export default function Loading() {
  return (
    <main>
      <p className="kicker">Ancient Daily</p>
      <h1 className="loading-title">Summarizing…</h1>
      <p className="loading-note">
        The first visit to an article takes about ten seconds while it’s fetched from Wikipedia
        and summarized. After that it loads instantly.
      </p>
    </main>
  );
}
