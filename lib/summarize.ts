import Anthropic from "@anthropic-ai/sdk";

const PROMPT = `You write a short daily read about the ancient world for a curious general reader.

Summarize the Wikipedia article below in exactly 3 short paragraphs of plain prose.
Then add one final line that starts with "Surprising fact:" and gives one specific, surprising detail from the article.

Rules:
- Write about the subject itself. Never comment on the article, the task, or whether the topic fits "the ancient world".
- Use only facts from the article. No headings, bullet points, or markdown.`;

/** Summarize with Claude; falls back to Wikipedia's own lead on any failure. */
export async function summarize(title: string, body: string, lead: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[summarize] ANTHROPIC_API_KEY not set; using Wikipedia lead");
    return lead;
  }
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\nTitle: ${title}\n\n${(body || lead).slice(0, 40000)}`,
        },
      ],
    });
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    // Guard against non-answers and cut-off output: a real summary is several
    // paragraphs, ends with the fact line, and finished on its own.
    const paragraphs = text.split(/\n+/).filter((p) => p.trim()).length;
    const complete =
      msg.stop_reason === "end_turn" && /Surprising fact:/.test(text) && paragraphs >= 3;
    if (!complete) {
      console.warn(
        `[summarize] incomplete output for "${title}": stop=${msg.stop_reason}, ` +
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
