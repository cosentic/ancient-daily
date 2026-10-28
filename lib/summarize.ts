import Anthropic from "@anthropic-ai/sdk";

/** Summarize with Claude; falls back to Wikipedia's own lead on any failure. */
export async function summarize(title: string, body: string, lead: string) {
  if (!process.env.ANTHROPIC_API_KEY) return lead;
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content:
            "Summarize this Wikipedia article about the ancient world in 3 short " +
            "paragraphs for a curious general reader. Then add a final line starting " +
            '"Surprising fact:" with one surprising detail from the article. ' +
            "Plain text, no headings or markdown.\n\n" +
            `Title: ${title}\n\n${body.slice(0, 40000)}`,
        },
      ],
    });
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return text || lead;
  } catch (e) {
    console.error("Claude summary failed:", e);
    return lead;
  }
}
