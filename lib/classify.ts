// Classifies pool titles by what they are (Wikidata "instance of", following
// subclasses) and how popular they are (Wikipedia page views).

import { api, HEADERS } from "@/lib/wiki";

export type Kind = "person" | "place" | "event" | "object" | "peoples" | "other";

// Wikidata classes. An item counts if it's an instance of the class or any subclass.
// EXCLUDE wins over everything; then the first matching kind in KIND_ORDER.
const EXCLUDE: Record<string, string> = {
  Q34770: "language",
  Q25295: "language family",
  Q33506: "museum",
  Q5398426: "television series",
  Q11424: "film",
  Q7889: "video game",
  Q13406463: "Wikimedia list",
  Q4167410: "disambiguation page",
};
// Museums are dropped unless they're also an ancient site (e.g. Roman Baths).
const MUSEUM_EXCEPT = new Set(["Q839954"]);

const KINDS: Record<Exclude<Kind, "other">, Record<string, string>> = {
  person: {
    Q5: "human",
    Q21070568: "human whose existence is disputed", // Homer, Ambrosius Aurelianus…
    Q178885: "deity",
    Q4271324: "mythological character",
    Q13002315: "legendary figure",
    Q2239243: "legendary creature",
    Q95074: "fictional character", // Wikidata tags many biblical/mythic figures this way
  },
  event: {
    Q1190554: "occurrence",
    Q178561: "battle",
    Q198: "war",
    Q188055: "siege",
  },
  place: {
    Q2221906: "geographic location",
    Q839954: "archaeological site",
    Q486972: "human settlement",
    Q15661340: "ancient city",
    Q811979: "architectural structure",
    Q82794: "geographic region",
    Q7075: "library",
  },
  peoples: {
    Q41710: "ethnic group",
    Q465299: "archaeological culture",
    Q8432: "civilization",
    Q133311: "tribe",
  },
  object: {
    Q220659: "archaeological artifact",
    Q386724: "work",
    Q80071: "symbol",
  },
};
const KIND_ORDER: Exclude<Kind, "other">[] = ["person", "event", "place", "peoples", "object"];

const ALL_CLASSES = [
  ...Object.keys(EXCLUDE),
  ...KIND_ORDER.flatMap((k) => Object.keys(KINDS[k])),
];

export type Meta = {
  title: string;
  qid: string | null;
  kind: Kind;
  classes: string[];
  views_per_day: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wikidata IDs + 60-day average views for up to 50 titles, keyed by the original title. */
async function wikiInfo(titles: string[]) {
  const params: Record<string, string | number> = {
    action: "query",
    titles: titles.join("|"),
    redirects: 1,
    prop: "pageprops|pageviews",
    ppprop: "wikibase_item",
    pvipdays: 60,
  };
  // Follow continuations: pageviews may be returned across several responses.
  const pages = new Map<string, { qid?: string; views: Record<string, number | null> }>();
  const normalized = new Map<string, string>();
  const redirects = new Map<string, string>();
  for (let i = 0; i < 10; i++) {
    const data = await api(params);
    for (const n of data.query?.normalized ?? []) normalized.set(n.from, n.to);
    for (const r of data.query?.redirects ?? []) redirects.set(r.from, r.to);
    for (const p of data.query?.pages ?? []) {
      const prev = pages.get(p.title) ?? { views: {} };
      if (p.pageprops?.wikibase_item) prev.qid = p.pageprops.wikibase_item;
      if (p.pageviews) Object.assign(prev.views, p.pageviews);
      pages.set(p.title, prev);
    }
    if (!data.continue) break;
    Object.assign(params, data.continue);
  }

  const out = new Map<string, { qid: string | null; views: number }>();
  for (const t of titles) {
    const norm = normalized.get(t) ?? t;
    const final = redirects.get(norm) ?? norm;
    const p = pages.get(final);
    const counts = Object.values(p?.views ?? {}).filter((v): v is number => typeof v === "number");
    const views = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    out.set(t, { qid: p?.qid ?? null, views: Math.round(views * 10) / 10 });
  }
  return out;
}

/** For each Wikidata item, which of our classes it belongs to (via P31/P279*). */
async function wikidataClasses(qids: string[]) {
  const result = new Map<string, Set<string>>();
  if (!qids.length) return result;
  const query = `
SELECT ?item ?cls WHERE {
  VALUES ?item { ${qids.map((q) => `wd:${q}`).join(" ")} }
  VALUES ?cls { ${ALL_CLASSES.map((c) => `wd:${c}`).join(" ")} }
  ?item wdt:P31/wdt:P279* ?cls .
}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        ...HEADERS,
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }),
      cache: "no-store",
    });
    if (res.ok) {
      const data: any = await res.json();
      for (const b of data.results?.bindings ?? []) {
        const item = String(b.item.value).split("/").pop()!;
        const cls = String(b.cls.value).split("/").pop()!;
        if (!result.has(item)) result.set(item, new Set());
        result.get(item)!.add(cls);
      }
      return result;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep(Math.min(ra > 0 ? ra * 1000 : 3000 * 2 ** attempt, 30000));
      continue;
    }
    throw new Error(`Wikidata SPARQL ${res.status}`);
  }
}

function kindOf(classes: Set<string> | undefined): { kind: Kind; labels: string[] } {
  if (!classes?.size) return { kind: "other", labels: [] };
  const excluded = [...classes]
    .filter((c) => EXCLUDE[c])
    .filter((c) => !(c === "Q33506" && [...classes].some((x) => MUSEUM_EXCEPT.has(x))))
    .map((c) => EXCLUDE[c]);
  if (excluded.length) return { kind: "other", labels: excluded };
  for (const k of KIND_ORDER) {
    const hits = [...classes].filter((c) => KINDS[k][c]).map((c) => KINDS[k][c]);
    if (hits.length) return { kind: k, labels: hits };
  }
  return { kind: "other", labels: [] };
}

/** Classifies up to 50 titles. */
export async function classifyBatch(titles: string[]): Promise<Meta[]> {
  const info = await wikiInfo(titles);
  const qids = [...new Set([...info.values()].map((i) => i.qid).filter((q): q is string => !!q))];
  const classes = await wikidataClasses(qids);
  return titles.map((title) => {
    const i = info.get(title)!;
    const { kind, labels } = kindOf(i.qid ? classes.get(i.qid) : undefined);
    return { title, qid: i.qid, kind, classes: labels, views_per_day: i.views };
  });
}
