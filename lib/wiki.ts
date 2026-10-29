// Wikipedia helpers: building the pool and fetching an article.

const API = "https://en.wikipedia.org/w/api.php";
const REST = "https://en.wikipedia.org/api/rest_v1";
// Wikipedia asks every client for a descriptive User-Agent with a contact point.
export const HEADERS = {
  "User-Agent": "AncientDaily/1.0 (https://github.com/cosentic/ancient-daily)",
};

type GroupSource = {
  projects?: string[]; // WikiProject names (quality-rated lists)
  categories?: Record<string, number>; // content category -> subcategory depth
};

export const GROUPS: Record<string, GroupSource> = {
  "Greece & Rome": {
    projects: ["Classical Greece and Rome"],
    categories: { "Ancient Rome": 1 },
  },
  "Ancient Egypt": { projects: ["Ancient Egypt"] },
  "Ancient Near East": { projects: ["Ancient Near East"] },
  Mesoamerica: {
    categories: {
      "Maya civilization": 2,
      Aztec: 1,
      Olmec: 1,
      Teotihuacan: 1,
      "Mesoamerican cultures": 0,
      "Mesoamerican mythology": 1,
    },
  },
  Celts: {
    categories: {
      Celts: 1,
      "Celtic mythology": 1,
      Gauls: 1,
      "La Tène culture": 1,
      "Hallstatt culture": 1,
      "Ancient Celtic peoples": 1,
    },
  },
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

export async function api(params: Record<string, string | number>): Promise<any> {
  const url = new URL(API);
  const all = { ...params, format: "json", formatversion: 2 };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, String(v));
  // Retry on rate limits / temporary errors, honoring Retry-After.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (res.ok) {
      await sleep(200); // be polite
      return res.json();
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
      console.warn(`[wiki] ${res.status}, retrying in ${wait}ms`);
      await sleep(Math.min(wait, 30000));
      continue;
    }
    throw new Error(`Wikipedia API ${res.status} for ${url}`);
  }
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
  return isModern(cats);
}

/** True if a page's categories mark it as a modern person or modern work. */
export function isModern(cats: string[]) {
  return cats.some((c) => {
    if (c === "Category:Living people") return true;
    // Modern people: "1952 births"
    const born = c.match(/^Category:(\d{3,4}) births$/);
    if (born) return Number(born[1]) >= 1500;
    // Modern works and media: "1894 novels", "1987 manga", "2004 films", "1999 comics debuts"…
    const work = c.match(
      /^Category:(\d{4}) (novels|novellas|short stories|books|poems|plays|films|manga|comics|anime|songs|albums|video games|television|operas|paintings|sculptures)\b/,
    );
    if (work) return Number(work[1]) >= 1500;
    // Modern buildings and foundations: "Houses completed in 1925",
    // "Buildings and structures completed in 1923", "1994 establishments in Mexico".
    // Skipped for places with ancient roots (e.g. a temple rebuilt in 1975).
    if (hasAncientRoots(cats)) return false;
    const built = c.match(/ completed in (\d{4})$/);
    if (built) return Number(built[1]) >= 1500;
    const founded = c.match(/^Category:(\d{4}) establishments\b/);
    if (founded) return Number(founded[1]) >= 1500;
    return false;
  });
}

/**
 * True if any category ties the page to antiquity: archaeology, ancient/former/
 * prehistoric places, BC or 1st–14th-century categories, historical regions,
 * biblical/Phoenician/Philistine cities, Greek colonies.
 */
export function hasAncientRoots(cats: string[]) {
  return cats.some((c) =>
    /archaeolog|ancient|former |ruins|prehistoric|pre-columbian|iron age|bronze age|classical antiquity|historical region|historic region|hebrew bible|biblical|philistine|phoenician|greek colon|roman (towns|cities|sites|forts|settlements|temples|colonies)|\bBC\b|\b(1st|2nd|3rd|[4-9]th|1[0-4]th)[- ]century\b/i.test(
      c,
    ),
  );
}

/**
 * True for present-day places (countries, cities, states, communes) as opposed
 * to ancient sites. "Cities in France" → modern, unless the page also has
 * ancient roots (see hasAncientRoots).
 */
export function isPresentDayPlace(cats: string[]) {
  if (hasAncientRoots(cats)) return false;
  return cats.some((c) =>
    /^Category:(Communes|Municipalities|Cities|Towns|Prefectures|Capitals|Countries|Member states|States|Regions|Provinces|Departments|Counties|Populated places)( and [a-z ]+)? (of|in) /.test(
      c,
    ),
  );
}

/**
 * The fast part of an article (~0.5s): display title, URL, Wikipedia's intro
 * paragraph and images. Enough to render the page before the summary exists.
 */
export async function fetchHeader(title: string) {
  const slug = encodeURIComponent(title.replace(/ /g, "_"));
  const [summary, images] = await Promise.all([
    fetch(`${REST}/page/summary/${slug}`, { headers: HEADERS, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})) as Promise<any>,
    fetchImages(title).catch((e) => {
      console.warn(`[images] ${title}: ${e instanceof Error ? e.message : e}`);
      return [] as WikiImage[];
    }),
  ]);
  // Fall back to the summary's lead image if the media list had nothing usable.
  if (!images.length && summary.originalimage?.source) {
    images.push({
      src: summary.thumbnail?.source ?? summary.originalimage.source,
      width: summary.thumbnail?.width ?? summary.originalimage.width,
      height: summary.thumbnail?.height ?? summary.originalimage.height,
      caption: "",
      credit: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${slug}`,
    });
  }
  return {
    title: (summary.title as string) ?? title,
    url:
      (summary.content_urls?.desktop?.page as string) ??
      `https://en.wikipedia.org/wiki/${slug}`,
    lead: (summary.extract as string) ?? "",
    images,
  };
}

/** The full plain-text article, for summarizing. */
export async function fetchBody(title: string) {
  const full = await api({
    action: "query",
    prop: "extracts",
    explaintext: 1,
    redirects: 1,
    titles: title,
  });
  return (full.query?.pages?.[0]?.extract as string) ?? "";
}

/** Header + full text together (used by the daily job). */
export async function fetchArticle(title: string) {
  const [header, body] = await Promise.all([fetchHeader(title), fetchBody(title)]);
  return { ...header, body };
}

export type WikiImage = {
  src: string; // ~640px-wide thumbnail on upload.wikimedia.org
  width?: number;
  height?: number;
  caption: string;
  credit: string; // file page with author and license
};

const MAX_IMAGES = 5;
// Skip maps, flags, icons, logos, diagrams: mostly SVGs or obviously named files.
const SKIP_FILE = /\.svg$|icon|logo|flag|commons-|wiki(media|pedia)|question_book|ambox|edit-clear|padlock|symbol_support|locator|location_map|_map\b|blank/i;

/** Up to MAX_IMAGES photos from the article, in article order, with captions. */
export async function fetchImages(title: string): Promise<WikiImage[]> {
  const slug = encodeURIComponent(title.replace(/ /g, "_"));
  const res = await fetch(`${REST}/page/media-list/${slug}`, {
    headers: HEADERS,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`media-list ${res.status}`);
  const data: any = await res.json();
  const out: WikiImage[] = [];
  const seen = new Set<string>();
  for (const item of data.items ?? []) {
    if (out.length >= MAX_IMAGES) break;
    if (item.type !== "image" || item.showInGallery === false) continue;
    const file = String(item.title ?? "");
    if (!file || seen.has(file) || SKIP_FILE.test(file)) continue;
    const srcset: { src: string; scale: string }[] = item.srcset ?? [];
    // Prefer the 2x rendition (~640px) for sharp display on phones.
    const pick =
      srcset.find((s) => s.scale === "2x") ?? srcset[srcset.length - 1] ?? srcset[0];
    if (!pick?.src) continue;
    seen.add(file);
    out.push({
      src: pick.src.startsWith("//") ? `https:${pick.src}` : pick.src,
      caption: String(item.caption?.text ?? "").trim(),
      credit: `https://en.wikipedia.org/wiki/${encodeURIComponent(file.replace(/ /g, "_"))}`,
    });
  }
  return out;
}
