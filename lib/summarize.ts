import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `You write a short daily read about the ancient world for a curious general reader.

You will be given source material about one subject. Write directly about the subject itself, as if you were the author of a short encyclopedia entry on it.

Format:
- Exactly 3 short paragraphs of plain prose.
- Then one final line that starts with "Surprising fact:" and gives one specific, surprising detail.
- No headings, bullet points, or markdown.

Voice — this is the most important rule:
- Never refer to the source. Do not mention "the article", "this article", "the entry", "the text", "Wikipedia", or "the source", and do not describe what it says, explains, covers, notes, or leaves out.
- Never comment on gaps, missing information, or where the material ends. If something is uncertain, say so about the subject itself ("its origin is unknown"), not about the material.
- Never comment on the task or on whether the topic fits "the ancient world".

Bad: "The article explains that Hadrian's Wall was built in AD 122."
Good: "Hadrian's Wall was built in AD 122."
Bad: "The article ends without explaining why the city was abandoned."
Good: "Why the city was abandoned remains unclear."

Use only facts from the source material.`;

/** Phrases that mean the summary is talking about its source instead of the subject. */
export const SELF_REFERENCE =
  /\b(the|this) (Wikipedia )?(article|entry|source)\b|\bWikipedia\b|\bthe (text|material) (says|states|explains|notes|describes|mentions|ends)\b/i;

async function callClaude(client: Anthropic, title: string, source: string, extra = "") {
  const msg = await client.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 3000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `<subject>${title}</subject>\n\n<source_material>\n${source}\n</source_material>\n\n` +
          `Write the piece about ${title}.${extra}`,
      },
    ],
  });
  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return { text, stop: msg.stop_reason };
}

/** Summarize with Claude; falls back to Wikipedia's own lead on any failure. */
export async function summarize(title: string, body: string, lead: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[summarize] ANTHROPIC_API_KEY not set; using Wikipedia lead");
    return lead;
  }
  try {
    const client = new Anthropic();
    const source = (body || lead).slice(0, 40000);
    let { text, stop } = await callClaude(client, title, source);

    // One retry if it slipped into talking about the source.
    if (SELF_REFERENCE.test(text)) {
      console.warn(`[summarize] self-reference in "${title}"; retrying`);
      ({ text, stop } = await callClaude(
        client,
        title,
        source,
        " Do not mention the article, the source, or Wikipedia anywhere; state the facts directly.",
      ));
    }

    // Guard against non-answers and cut-off output: a real summary is several
    // paragraphs, ends with the fact line, and finished on its own.
    const paragraphs = text.split(/\n+/).filter((p) => p.trim()).length;
    const complete = stop === "end_turn" && /Surprising fact:/.test(text) && paragraphs >= 3;
    if (!complete) {
      console.warn(
        `[summarize] incomplete output for "${title}": stop=${stop}, ` +
          `${text.length} chars, ${paragraphs} paragraphs; using lead`,
      );
      return lead;
    }
    return text;
  } catch (e) {
    console.error("[summarize] Claude call failed:", e);
    return lead;
  }
}

// ---------------------------------------------------------------------------
// "The Gist": 2–3 very short bullets shown in a box at the top of the article.

const GIST_SYSTEM = `You write "The Gist": an at-a-glance summary of one subject from the ancient world, for a curious general reader who may read nothing else.

Write 2 or 3 bullet points. Each bullet:
- is one short sentence of at most 15 words,
- states a concrete fact (who/what/where/when, what happened, why it matters),
- does not repeat another bullet.

Order: what it is first, then the most important or memorable facts.

Voice: state facts directly about the subject. Never mention "the article", "the source", "the text", "this summary" or Wikipedia.

Output only the bullets, one per line, each starting with "- ". No heading, no intro, no closing line.`;

/** Parses "- bullet" lines; returns 2–3 clean bullets or null. */
function parseGist(text: string): string[] | null {
  const bullets = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^[-•*]\s+/.test(l))
    .map((l) => l.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
  if (bullets.length < 2) return null;
  return bullets.slice(0, 3);
}

/**
 * 2–3 bullet points about the subject. `source` can be the Wikipedia text or
 * an existing summary (for articles saved before The Gist existed).
 * Returns null on failure; the page then simply omits the box.
 */
export async function gistOf(title: string, source: string): Promise<string[] | null> {
  if (!process.env.ANTHROPIC_API_KEY || !source) return null;
  const client = new Anthropic();
  const ask = async (extra = "") => {
    const msg = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 400,
      system: GIST_SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `<subject>${title}</subject>\n\n<source_material>\n${source.slice(0, 40000)}\n</source_material>\n\n` +
            `Write The Gist for ${title}.${extra}`,
        },
      ],
    });
    return msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  };
  try {
    let bullets = parseGist(await ask());
    if (!bullets || bullets.some((b) => SELF_REFERENCE.test(b))) {
      bullets = parseGist(
        await ask(" Exactly 2 or 3 lines starting with \"- \". Never mention the article or source."),
      );
    }
    if (!bullets || bullets.some((b) => SELF_REFERENCE.test(b))) return null;
    return bullets;
  } catch (e) {
    console.error("[gist] Claude call failed:", e);
    return null;
  }
}
