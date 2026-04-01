import { PIPELINE_CONFIG } from "../config/channels.js";
import { normalizeLinkUrl } from "../util/normalizeLinkUrl.js";
import { extractPageTextForUrl, isUrlAllowedForTavily } from "./tavilyExtract.js";
import { summarizeAndScoreLinkContent } from "./gemma.js";

export type LinkSummaryResult = {
  link_summary: string | null;
  link_summary_status: string;
  link_score: number | null;
};

/**
 * Summarize and score the first URL using Tavily extract + Gemma. Caller should pass a raw or normalized URL;
 * bare hosts are normalized when possible.
 */
export async function linkSummaryForFirstUrl(
  firstLink: string | undefined,
  textScore: number | null,
  log?: (step: string, detail?: Record<string, unknown>) => void,
  /** Reuse summary/score from a prior message with the same normalized URL (skips Tavily + Gemma). */
  cache?: Map<string, LinkSummaryResult>
): Promise<LinkSummaryResult> {
  const normalized = firstLink ? normalizeLinkUrl(firstLink) : null;
  if (!normalized) {
    return { link_summary: null, link_summary_status: "skipped", link_score: null };
  }

  const cached = cache?.get(normalized);
  if (cached) {
    log?.("link_summary.cache_hit", { url: normalized });
    return {
      link_summary: cached.link_summary,
      link_summary_status: cached.link_summary_status,
      link_score: cached.link_score,
    };
  }

  const min = PIPELINE_CONFIG.LINK_SUMMARY_MIN_SCORE;
  if (min != null && (textScore == null || textScore < min)) {
    return { link_summary: null, link_summary_status: "skipped", link_score: null };
  }
  if (!process.env.TAVILY_API_KEY?.trim()) {
    return { link_summary: null, link_summary_status: "skipped", link_score: null };
  }
  if (!isUrlAllowedForTavily(normalized)) {
    return { link_summary: null, link_summary_status: "skipped", link_score: null };
  }

  const ex = await extractPageTextForUrl(normalized);
  if (ex.status === "extract_failed") {
    log?.("link_summary.extract_failed", {
      url: normalized,
      detail: ex.detail,
      requestId: ex.requestId,
    });
    return { link_summary: null, link_summary_status: "extract_failed", link_score: null };
  }
  if (ex.status === "no_text") {
    return { link_summary: null, link_summary_status: "no_text", link_score: null };
  }

  const combined = await summarizeAndScoreLinkContent(normalized, ex.rawContent);
  if (!combined) {
    return { link_summary: null, link_summary_status: "summarize_failed", link_score: null };
  }
  return {
    link_summary: combined.summary,
    link_summary_status: "ok",
    link_score: combined.score,
  };
}
