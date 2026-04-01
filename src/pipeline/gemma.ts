import { PIPELINE_CONFIG, type ChannelConfig } from "../config/channels.js";
import { isPipelineDebug } from "../util/pipelineDebug.js";

const MAX_429_RETRIES_PER_MODEL = 2;
const MAX_5XX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function dlog(msg: string, detail?: Record<string, unknown>): void {
  if (!isPipelineDebug()) return;
  const tail = detail ? ` ${JSON.stringify(detail)}` : "";
  console.debug(`[Gemma] ${msg}${tail}`);
}

function gemmaEndpointForModel(model: string): string {
  const key = process.env.GOOGLE_AI_KEY;
  if (!key) throw new Error("GOOGLE_AI_KEY is not set");
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

async function fetchGemma(
  body: object,
  chain: readonly string[] = PIPELINE_CONFIG.GEMMA_FALLBACK_CHAIN
): Promise<Response> {
  const models = [...chain];
  if (models.length === 0) {
    throw new Error("Gemma fetch: empty model chain");
  }

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi]!;
    let rateLimitRetries = 0;
    let serverErrorRetries = 0;

    while (true) {
      const res = await fetch(gemmaEndpointForModel(model), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        if (rateLimitRetries < MAX_429_RETRIES_PER_MODEL) {
          rateLimitRetries++;
          const delay = BASE_DELAY_MS * 2 ** (rateLimitRetries - 1);
          console.warn(
            `[Gemma] model=${model} HTTP 429, retry in ${delay}ms (${rateLimitRetries}/${MAX_429_RETRIES_PER_MODEL})`
          );
          await sleep(delay);
          continue;
        }
        if (mi < models.length - 1) {
          console.warn(`[Gemma] model=${model} HTTP 429 exhausted, falling back to ${models[mi + 1]}`);
        }
        break;
      }

      if (res.status >= 500 && res.status < 600) {
        if (serverErrorRetries < MAX_5XX_RETRIES) {
          serverErrorRetries++;
          const delay = BASE_DELAY_MS * 2 ** (serverErrorRetries - 1);
          console.warn(
            `[Gemma] model=${model} HTTP ${res.status}, retry in ${delay}ms (attempt ${serverErrorRetries}/${MAX_5XX_RETRIES})`
          );
          await sleep(delay);
          continue;
        }
        throw new Error(`Gemma fetch exhausted 5xx retries on ${model}`);
      }

      return res;
    }
  }

  throw new Error("Gemma fetch exhausted fallback chain (429 on all models)");
}

export type GemmaTextResult = {
  id: string;
  score: number;
  reason: string;
  translatedText: string;
};

function extractTextFromGemmaJson(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const parts = d.candidates?.[0]?.content?.parts;
  if (!parts?.length) return null;
  return parts.map((p) => p.text ?? "").join("").trim() || null;
}

function parseGemmaBatchJson(text: string): GemmaTextResult[] {
  const cleaned = text.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    dlog("batch.parse_error", { cleanedPreview: cleaned.slice(0, 400) });
    console.warn("[Gemma] Failed to parse JSON batch response");
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: GemmaTextResult[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : null;
    if (!id) continue;
    const score = typeof o.score === "number" ? o.score : Number(o.score);
    const reason = typeof o.reason === "string" ? o.reason : "";
    const translatedText =
      typeof o.en === "string"
        ? o.en
        : typeof o.translatedText === "string"
          ? o.translatedText
          : "";
    out.push({
      id,
      score: Number.isFinite(score) ? Math.min(10, Math.max(0, score)) : 0,
      reason,
      translatedText,
    });
  }
  return out;
}

function parseSummaryScoreJson(text: string): { summary: string; score: number } | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    dlog("summary_score.parse_error", { cleanedPreview: cleaned.slice(0, 400) });
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary : "";
  const score = typeof o.score === "number" ? o.score : Number(o.score);
  if (!summary.trim() || !Number.isFinite(score)) return null;
  const oneBlock = summary.replace(/\s+/g, " ").trim();
  return {
    summary: oneBlock,
    score: Math.min(10, Math.max(0, score)),
  };
}

export async function scoreAndTranslateBatch(
  messages: { id: string; text: string; sourceLang: string }[]
): Promise<GemmaTextResult[]> {
  if (messages.length === 0) return [];

  const t0 = performance.now();
  dlog("batch.start", {
    model: PIPELINE_CONFIG.GEMMA_MODEL,
    count: messages.length,
    ids: messages.map((m) => m.id),
    textChars: messages.reduce((n, m) => n + (m.text?.length ?? 0), 0),
    langs: [...new Set(messages.map((m) => m.sourceLang))],
  });

  const prompt = `
You are a multilingual news quality evaluator.
Return ONLY a JSON array (no markdown, no preamble) with one object per message in the SAME order.
Schema per object: { "id": "<id>", "score": 0-10, "reason": "<15 words max>", "en": "<English translation>" }

Scoring rubric:
8-10  Original reporting, breaking news, primary source data
5-7   Useful analysis, credible repost with added context
2-4   Low-effort aggregation, unverified rumour
0-1   Spam, pure advertising, meaningless content

Messages:
${messages.map((m) => `[id:${m.id}] [lang:${m.sourceLang}]\n${m.text ?? "(no text)"}`).join("\n---\n")}
`;

  const res = await fetchGemma({
    contents: [{ parts: [{ text: prompt }] }],
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    dlog("batch.http_error", { status: res.status, bodyPreview: errText.slice(0, 300) });
    console.warn(`[Gemma] batch HTTP ${res.status}`, errText.slice(0, 200));
    return messages.map((m) => ({
      id: m.id,
      score: 0,
      reason: "API error",
      translatedText: m.text,
    }));
  }
  const data = await res.json();
  const rawText = extractTextFromGemmaJson(data);
  if (!rawText) {
    dlog("batch.empty_candidates", {
      ms: Math.round(performance.now() - t0),
      responseKeys: data && typeof data === "object" ? Object.keys(data as object) : [],
    });
    console.warn("[Gemma] Empty candidates in batch response");
    return messages.map((m) => ({
      id: m.id,
      score: 0,
      reason: "Empty model response",
      translatedText: m.text,
    }));
  }
  dlog("batch.raw_preview", { chars: rawText.length, head: rawText.slice(0, 240) });
  const parsed = parseGemmaBatchJson(rawText);
  dlog("batch.done", {
    ms: Math.round(performance.now() - t0),
    parsedCount: parsed.length,
    scores: parsed.map((r) => ({ id: r.id, score: r.score })),
  });
  return parsed;
}

export async function describeImageWithGemma(
  imageBuffer: Buffer,
  mimeType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"
): Promise<string> {
  const t0 = performance.now();
  dlog("vision.start", { mimeType, bytes: imageBuffer.length });

  const prompt =
    "Describe this image for a news feed: main subject, any visible text (OCR), and credibility cues. " +
    "Answer in one short English paragraph, no markdown.";

  const res = await fetchGemma(
    {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBuffer.toString("base64"),
              },
            },
          ],
        },
      ],
    },
    PIPELINE_CONFIG.GEMMA_VISION_CHAIN
  );
  if (!res.ok) {
    dlog("vision.http_error", { status: res.status, ms: Math.round(performance.now() - t0) });
    console.warn(`[Gemma] vision HTTP ${res.status}`);
    return "";
  }
  const data = await res.json();
  const text = extractTextFromGemmaJson(data) ?? "";
  dlog("vision.done", {
    ms: Math.round(performance.now() - t0),
    outChars: text.length,
    head: text.slice(0, 200),
  });
  return text;
}

/** Returns null on API/parse failure or empty model output (caller should fall back to `display_name`). */
export async function translateChannelTitleToEnglish(
  title: string,
  sourceLang: ChannelConfig["lang"]
): Promise<string | null> {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const langHint =
    sourceLang === "ru"
      ? "Russian"
      : sourceLang === "zh"
        ? "Chinese"
        : "possibly mixed languages (e.g. Russian, Chinese, English)";

  const prompt = `Translate this Telegram channel title into natural, concise English suitable for a UI tab label.
Source language hint: ${langHint}. If the title is already clear English, return it unchanged (adjust capitalization only if needed).
Return ONLY the translated title as plain text, one line, no quotation marks, no explanation.

Title: ${trimmed}`;

  const t0 = performance.now();
  dlog("channel_title.start", { sourceLang, chars: trimmed.length });

  const res = await fetchGemma({
    contents: [{ parts: [{ text: prompt }] }],
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    dlog("channel_title.http_error", { status: res.status, bodyPreview: errText.slice(0, 200) });
    console.warn(`[Gemma] channel title HTTP ${res.status}`, errText.slice(0, 160));
    return null;
  }
  const data = await res.json();
  const raw = extractTextFromGemmaJson(data)?.trim() ?? "";
  if (!raw) {
    dlog("channel_title.empty", { ms: Math.round(performance.now() - t0) });
    console.warn("[Gemma] Empty channel title translation");
    return null;
  }
  const oneLine = raw.split(/\r?\n/)[0]!.replace(/^["']|["']$/g, "").trim();
  dlog("channel_title.done", { ms: Math.round(performance.now() - t0), outChars: oneLine.length });
  return oneLine || null;
}

/** Summarize extracted page text and score link content quality (single LLM call). */
export async function summarizeAndScoreLinkContent(
  url: string,
  extractedText: string
): Promise<{ summary: string; score: number } | null> {
  const trimmed = extractedText.trim();
  if (!trimmed) return null;

  const prompt = `You analyze web page content for a news-style feed.

Return ONLY a JSON object (no markdown, no preamble) with this exact shape:
{ "summary": "<2–4 short English sentences>", "score": <number 0–10> }

Summary: capture the main factual takeaway. No markdown, no bullet list in the summary string.

Scoring rubric for the linked page content:
8–10  Original reporting, breaking news, primary source data, high-value research
5–7   Useful analysis, credible secondary coverage with context
2–4   Low-effort aggregation, thin content, unverified rumour
0–1   Spam, pure advertising, meaningless or hostile content

Page URL (context only): ${url}

Page content:
${trimmed}`;

  const t0 = performance.now();
  dlog("link_summary_score.start", { urlChars: url.length, contentChars: trimmed.length });

  const res = await fetchGemma({
    contents: [{ parts: [{ text: prompt }] }],
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    dlog("link_summary_score.http_error", { status: res.status, bodyPreview: errText.slice(0, 200) });
    console.warn(`[Gemma] link summary+score HTTP ${res.status}`, errText.slice(0, 160));
    return null;
  }
  const data = await res.json();
  const raw = extractTextFromGemmaJson(data)?.trim() ?? "";
  if (!raw) {
    dlog("link_summary_score.empty", { ms: Math.round(performance.now() - t0) });
    console.warn("[Gemma] Empty link summary+score response");
    return null;
  }
  const parsed = parseSummaryScoreJson(raw);
  if (!parsed) {
    dlog("link_summary_score.parse_failed", { ms: Math.round(performance.now() - t0) });
    console.warn("[Gemma] Failed to parse link summary+score JSON");
    return null;
  }
  dlog("link_summary_score.done", {
    ms: Math.round(performance.now() - t0),
    outChars: parsed.summary.length,
    score: parsed.score,
  });
  return parsed;
}

/** Summarize extracted document text and score document quality (single LLM call). */
export async function summarizeAndScoreDocument(
  extractedText: string,
  filename?: string
): Promise<{ summary: string; score: number } | null> {
  const trimmed = extractedText.trim();
  if (!trimmed) return null;

  const nameHint = filename?.trim() ? `File name (context): ${filename.trim()}` : "File name: unknown";

  const prompt = `You analyze document text for a news-style feed.

Return ONLY a JSON object (no markdown, no preamble) with this exact shape:
{ "summary": "<2–4 short English sentences>", "score": <number 0–10> }

Summary: capture the main factual takeaway. No markdown, no bullet list in the summary string.

Scoring rubric for the document content:
8–10  Original research, substantive data, high-value primary material
5–7   Useful reference or analysis with credible information
2–4   Thin, promotional, or low-substance content
0–1   Spam, meaningless, or misleading content

${nameHint}

Document text:
${trimmed}`;

  const t0 = performance.now();
  dlog("document_summary_score.start", { contentChars: trimmed.length });

  const res = await fetchGemma({
    contents: [{ parts: [{ text: prompt }] }],
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    dlog("document_summary_score.http_error", { status: res.status, bodyPreview: errText.slice(0, 200) });
    console.warn(`[Gemma] document summary+score HTTP ${res.status}`, errText.slice(0, 160));
    return null;
  }
  const data = await res.json();
  const raw = extractTextFromGemmaJson(data)?.trim() ?? "";
  if (!raw) {
    dlog("document_summary_score.empty", { ms: Math.round(performance.now() - t0) });
    console.warn("[Gemma] Empty document summary+score response");
    return null;
  }
  const parsed = parseSummaryScoreJson(raw);
  if (!parsed) {
    dlog("document_summary_score.parse_failed", { ms: Math.round(performance.now() - t0) });
    console.warn("[Gemma] Failed to parse document summary+score JSON");
    return null;
  }
  dlog("document_summary_score.done", {
    ms: Math.round(performance.now() - t0),
    outChars: parsed.summary.length,
    score: parsed.score,
  });
  return parsed;
}

const COMMENT_SUMMARY_MAX_CHARS = 12_000;

/** Summarize discussion replies for a channel post; returns null on API/parse failure or empty output. */
export async function summarizeComments(
  postText: string | null,
  comments: string[]
): Promise<string | null> {
  if (comments.length === 0) return null;

  const postCtx = (postText ?? "").trim().slice(0, 4_000);
  const numbered = comments
    .slice(0, 200)
    .map((c, i) => `[${i + 1}] ${c.trim()}`)
    .join("\n");
  let body = numbered;
  if (body.length > COMMENT_SUMMARY_MAX_CHARS) {
    body = `${body.slice(0, COMMENT_SUMMARY_MAX_CHARS)}\n\n[truncated]`;
  }

  const prompt = `You summarize Telegram discussion comments for a news-style feed.

Task: Write 2–4 short English sentences describing the main themes, agreements, disagreements, and notable questions in the comments. No markdown, no bullet list, no preamble. Do not quote comment numbers.

Original post (context):
${postCtx || "(no text)"}

Comments:
${body}`;

  const t0 = performance.now();
  dlog("comment_summary.start", { commentCount: comments.length, bodyChars: body.length });

  const res = await fetchGemma({
    contents: [{ parts: [{ text: prompt }] }],
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    dlog("comment_summary.http_error", { status: res.status, bodyPreview: errText.slice(0, 200) });
    console.warn(`[Gemma] comment summary HTTP ${res.status}`, errText.slice(0, 160));
    return null;
  }
  const data = await res.json();
  const raw = extractTextFromGemmaJson(data)?.trim() ?? "";
  if (!raw) {
    dlog("comment_summary.empty", { ms: Math.round(performance.now() - t0) });
    console.warn("[Gemma] Empty comment summary response");
    return null;
  }
  const oneBlock = raw.replace(/\s+/g, " ").trim();
  dlog("comment_summary.done", { ms: Math.round(performance.now() - t0), outChars: oneBlock.length });
  return oneBlock || null;
}
