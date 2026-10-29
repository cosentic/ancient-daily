/** "The Gist": a boxed 2–3 bullet summary at the top of an article. */
export function GistBox({ bullets }: { bullets: string[] }) {
  return (
    <aside className="gist" aria-labelledby="gist-heading">
      <h2 id="gist-heading">The Gist</h2>
      <ul>
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </aside>
  );
}

/** Shown while the bullets are being written. */
export function GistPlaceholder() {
  return (
    <aside className="gist gist-loading" aria-busy="true" aria-label="The Gist, loading">
      <h2>The Gist</h2>
      <ul>
        <li><span className="bar" style={{ width: "92%" }} /></li>
        <li><span className="bar" style={{ width: "78%" }} /></li>
        <li><span className="bar" style={{ width: "64%" }} /></li>
      </ul>
    </aside>
  );
}
