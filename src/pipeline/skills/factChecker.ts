import { readFileSync } from "node:fs";
import { join } from "node:path";
import { executeWithSystemPrompt } from "../gemma.js";
import { isPipelineDebug } from "../../util/pipelineDebug.js";

function log(msg: string, detail?: Record<string, unknown>): void {
  const tail = detail ? ` ${JSON.stringify(detail)}` : "";
  console.log(`[FactChecker] ${msg}${tail}`);
}

function dlog(msg: string, detail?: Record<string, unknown>): void {
  if (!isPipelineDebug()) return;
  const tail = detail ? ` ${JSON.stringify(detail)}` : "";
  console.debug(`[FactChecker] ${msg}${tail}`);
}

const SKILL_MD = readFileSync(
  join(process.cwd(), "src/pipeline/skills/fact-checker.md"),
  "utf-8"
);

const SYSTEM_PROMPT = SKILL_MD.replace(/^---[\s\S]*?---\s*/, "").trim();

export interface FactCheckClaim {
  claim: string;
  verdict: "TRUE" | "MOSTLY_TRUE" | "MIXED" | "MOSTLY_FALSE" | "FALSE" | "UNVERIFIABLE";
  confidence: number;
  analysis: string;
  sources: string[];
}

export interface FactCheckResult {
  claims: FactCheckClaim[];
  overall_verdict: string;
}

export interface FactCheckerInput {
  text: string;
  translatedText?: string | null;
  linkExtractedText?: string | null;
  linkSummary?: string | null;
  documentSummary?: string | null;
  imageCaption?: string | null;
  audioTranscript?: string | null;
}

function buildUserPrompt(input: FactCheckerInput): string {
  const sections: string[] = [];

  sections.push(`## Message Text\n${input.text}`);

  if (input.translatedText) {
    sections.push(`## English Translation\n${input.translatedText}`);
  }
  if (input.audioTranscript) {
    sections.push(`## Audio Transcript\n${input.audioTranscript}`);
  }
  if (input.imageCaption) {
    sections.push(`## Image Description\n${input.imageCaption}`);
  }
  if (input.linkSummary) {
    sections.push(`## Link Summary\n${input.linkSummary}`);
  }
  if (input.linkExtractedText) {
    sections.push(`## Full Link Content\n${input.linkExtractedText}`);
  }
  if (input.documentSummary) {
    sections.push(`## Document Summary\n${input.documentSummary}`);
  }

  sections.push(`## Instructions
Analyze the above content and return ONLY a JSON object (no markdown fences, no preamble) matching this schema:
{
  "claims": [
    {
      "claim": "<exact statement being verified>",
      "verdict": "TRUE" | "MOSTLY_TRUE" | "MIXED" | "MOSTLY_FALSE" | "FALSE" | "UNVERIFIABLE",
      "confidence": <0.0-1.0>,
      "analysis": "<concise explanation>",
      "sources": ["<source description or URL>"]
    }
  ],
  "overall_verdict": "TRUE" | "MOSTLY_TRUE" | "MIXED" | "MOSTLY_FALSE" | "FALSE" | "UNVERIFIABLE"
}

If no verifiable claims are found, return: { "claims": [], "overall_verdict": "UNVERIFIABLE" }`);

  return sections.join("\n\n");
}

const VALID_VERDICTS = new Set([
  "TRUE", "MOSTLY_TRUE", "MIXED", "MOSTLY_FALSE", "FALSE", "UNVERIFIABLE",
]);

function parseFactCheckJson(text: string): FactCheckResult | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    dlog("parse_error", { preview: cleaned.slice(0, 400) });
    console.warn("[FactChecker] Failed to parse JSON response");
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;

  const rawClaims = Array.isArray(o.claims) ? o.claims : [];
  const claims: FactCheckClaim[] = [];

  for (const raw of rawClaims) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const claim = typeof c.claim === "string" ? c.claim : "";
    const verdict = typeof c.verdict === "string" ? c.verdict.toUpperCase() : "";
    if (!claim || !VALID_VERDICTS.has(verdict)) continue;

    const confidence = typeof c.confidence === "number" ? c.confidence : Number(c.confidence);
    const analysis = typeof c.analysis === "string" ? c.analysis : "";
    const sources = Array.isArray(c.sources)
      ? c.sources.filter((s): s is string => typeof s === "string")
      : [];

    claims.push({
      claim,
      verdict: verdict as FactCheckClaim["verdict"],
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
      analysis,
      sources,
    });
  }

  const overallRaw = typeof o.overall_verdict === "string" ? o.overall_verdict.toUpperCase() : "UNVERIFIABLE";
  const overall_verdict = VALID_VERDICTS.has(overallRaw) ? overallRaw : "UNVERIFIABLE";

  return { claims, overall_verdict };
}

export async function runFactChecker(input: FactCheckerInput): Promise<FactCheckResult | null> {
  const t0 = performance.now();
  const userPrompt = buildUserPrompt(input);

  const context = {
    textChars: input.text.length,
    hasTranslation: !!input.translatedText,
    hasLinkText: !!input.linkExtractedText,
    hasLinkSummary: !!input.linkSummary,
    hasDocSummary: !!input.documentSummary,
    hasImage: !!input.imageCaption,
    hasAudio: !!input.audioTranscript,
  };

  log("start", context);
  dlog("prompt_chars", { system: SYSTEM_PROMPT.length, user: userPrompt.length });

  const rawText = await executeWithSystemPrompt(SYSTEM_PROMPT, userPrompt);
  if (!rawText) {
    log("failed", { reason: "empty_response", ms: Math.round(performance.now() - t0) });
    return null;
  }

  dlog("raw_preview", { chars: rawText.length, head: rawText.slice(0, 300) });

  const result = parseFactCheckJson(rawText);
  if (!result) {
    log("failed", { reason: "parse_error", ms: Math.round(performance.now() - t0) });
    return null;
  }

  log("done", {
    ms: Math.round(performance.now() - t0),
    claimCount: result.claims.length,
    overall: result.overall_verdict,
    verdicts: result.claims.map((c) => c.verdict),
  });
  return result;
}
