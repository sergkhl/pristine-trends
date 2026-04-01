import { PIPELINE_CONFIG } from "../config/channels.js";
import { normalizeLinkUrl } from "../util/normalizeLinkUrl.js";
import { extractPageTextForUrl, isUrlAllowedForTavily } from "./tavilyExtract.js";
import { summarizeLinkContent } from "./gemma.js";

export type LinkSummaryResult = {
  link_summary: string | null;
  link_summary_status: string;
};

/**
 * Summarize the first URL using Tavily extract + Gemma. Caller should pass a raw or normalized URL;
 * bare hosts are normalized when possible.
 */
export async function linkSummaryForFirstUrl(
  firstLink: string | undefined,
  qualityScore: number | null,
  log?: (step: string, detail?: Record<string, unknown>) => void
): Promise<LinkSummaryResult> {
  const normalized = firstLink ? normalizeLinkUrl(firstLink) : null;
  if (!normalized) {
    return { link_summary: null, link_summary_status: "skipped" };
  }

  const min = PIPELINE_CONFIG.LINK_SUMMARY_MIN_SCORE;
  if (min != null && (qualityScore == null || qualityScore < min)) {
    return { link_summary: null, link_summary_status: "skipped" };
  }
  if (!process.env.TAVILY_API_KEY?.trim()) {
    return { link_summary: null, link_summary_status: "skipped" };
  }
  if (!isUrlAllowedForTavily(normalized)) {
    return { link_summary: null, link_summary_status: "skipped" };
  }

  const ex = await extractPageTextForUrl(normalized);
  if (ex.status === "extract_failed") {
    log?.("link_summary.extract_failed", {
      url: normalized,
      detail: ex.detail,
      requestId: ex.requestId,
    });
    return { link_summary: null, link_summary_status: "extract_failed" };
  }
  if (ex.status === "no_text") {
    return { link_summary: null, link_summary_status: "no_text" };
  }

  const summary = await summarizeLinkContent(normalized, ex.rawContent);
  if (!summary) {
    return { link_summary: null, link_summary_status: "summarize_failed" };
  }
  return { link_summary: summary, link_summary_status: "ok" };
}
