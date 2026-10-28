// Wikipedia helpers: building the pool and fetching an article.

const API = "https://en.wikipedia.org/w/api.php";
const REST = "https://en.wikipedia.org/api/rest_v1";
// Wikipedia asks every client for a descriptive User-Agent with a contact point.
const HEADERS = {
  "User-Agent": "AncientDaily/1.0 (https://github.com/cosentic/ancient-daily)",
};

type GroupSource = {
  projects?: string[]; // WikiProject names (quality-rated lists)
  categories?: Record<string, number>; // content category -> subcategory depth
};

export const GROUPS: Record<string, GroupSource> = {
  "Greece & Rome": { projects: ["Classical Greece and Rome"] },
  "Ancient Rome": { categories: { "Ancient Rome": 1 } },
  "Ancient Egypt": { projects: ["Ancient Egypt"] },
  "Ancient Near East": { projects: ["Ancient Near East"] },
  Mesoamerica: { projects: ["Mesoamerica"] },
  Celts: { projects: ["Celts"] },
  "Ancient Britain": {
    categories: {
      "Roman Britain": 2,
      "Iron Age Britain": 2,
      "Prehistoric Britain": 1,
      "Celtic Britons": 1,
    },
  },
};

const QUALITY = ["FA", "GA", "A", "B"];
const MIN_BYTES = 8000; // unrated content-category articles: skip stubs

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(params: Record<string, string | number>): Promise<any> {
  const url = new URL(API);
  const all = { ...params, format: "json", formatversion: 2 };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Wikipedia API ${res.status} for ${url}`);
  await sleep(100); // be polite
  return res.json();
}

/** Articles a WikiProject rates B-class or better. */
async function assessedArticles(project: string, log: string[]) {
  const titles = new Set<string>();
  for (const q of QUALITY) {
    const cat = `${q}-Class ${project} articles`;
    const params: Record<string, string | number> = {
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${cat}`,
      cmnamespace: 1, // assessment tags live on Talk: pages
      cmlimit: "max",
    };
    let found = 0;
    while (true) {
      const data = await api(params);
      const members: { title: string }[] = data.query?.categorymembers ?? [];
      found += members.length;
      for (const m of members) titles.add(m.title.replace(/^Talk:/, ""));
      if (!data.continue) break;
      Object.assign(params, data.continue);
    }
    log.push(`${cat}: ${found}${found ? "" : "  <-- empty, check the name"}`);
  }
  return titles;
}

/** Articles in a content category (and subcategories) above MIN_BYTES. */
async function categoryArticles(
  category: string,
  depth: number,
  seen = new Set<string>(),
): Promise<Set<string>> {
  const titles = new Set<string>();
  if (seen.has(category)) return titles;
  seen.add(category);
  const subcats: string[] = [];
  const params: Record<string, string | number> = {
    action: "query",
    generator: "categorymembers",
    gcmtitle: `Category:${category}`,
    gcmtype: "page|subcat",
    gcmlimit: "max",
    prop: "info",
  };
  while (true) {
    const data = await api(params);
    for (const p of data.query?.pages ?? []) {
      if (p.ns === 14) subcats.push(p.title.replace(/^Category:/, ""));
      else if (p.ns === 0 && (p.length ?? 0) >= MIN_BYTES) titles.add(p.title);
    }
    if (!data.continue) break;
    Object.assign(params, data.continue);
  }
  if (depth > 0) {
    for (const sub of subcats) {
      for (const t of await categoryArticles(sub, depth - 1, seen)) titles.add(t);
    }
  }
  return titles;
}

/** All titles for one group, plus a log of per-source counts. */
export async function buildGroup(name: string) {
  const src = GROUPS[name];
  if (!src) throw new Error(`Unknown group: ${name}`);
  const log: string[] = [];
  const titles = new Set<string>();
  for (const project of src.projects ?? []) {
    for (const t of await assessedArticles(project, log)) titles.add(t);
  }
  for (const [cat, depth] of Object.entries(src.categories ?? {})) {
    const found = await categoryArticles(cat, depth);
    log.push(
      `Category:${cat} (depth ${depth}): ${found.size}${found.size ? "" : "  <-- empty, check the name"}`,
    );
    for (const t of found) titles.add(t);
  }
  return { titles: [...titles].sort(), log };
}

/**
 * True for articles that aren't really "ancient world" reading: biographies of
 * modern people (e.g. Egyptologists tagged by WikiProjects) and list pages.
 */
export async function isOffTopic(title: string) {
  if (/^(List|Lists|Timeline|Index) of /i.test(title)) return true;
  const data = await api({
    action: "query",
    prop: "categories",
    clshow: "!hidden",
    cllimit: "max",
    redirects: 1,
    titles: title,
  });
  const cats: string[] = (data.query?.pages?.[0]?.categories ?? []).map(
    (c: { title: string }) => c.title,
  );
  return cats.some((c) => {
    if (c === "Category:Living people") return true;
    const m = c.match(/^Category:(\d{3,4}) births$/);
    return m ? Number(m[1]) >= 1500 : false;
  });
}

/** Short lead + URL from the REST API, plus the full plain-text body. */
export async function fetchArticle(title: string) {
  const slug = encodeURIComponent(title.replace(/ /g, "_"));
  const sumRes = await fetch(`${REST}/page/summary/${slug}`, {
    headers: HEADERS,
    cache: "no-store",
  });
  const summary: any = sumRes.ok ? await sumRes.json() : {};
  const full = await api({
    action: "query",
    prop: "extracts",
    explaintext: 1,
    redirects: 1,
    titles: title,
  });
  return {
    title: (summary.title as string) ?? title,
    url:
      (summary.content_urls?.desktop?.page as string) ??
      `https://en.wikipedia.org/wiki/${slug}`,
    lead: (summary.extract as string) ?? "",
    body: (full.query?.pages?.[0]?.extract as string) ?? "",
  };
}
