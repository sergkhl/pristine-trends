import { PIPELINE_CONFIG } from "../config/channels.js";
import { extractTextFromPdf } from "./documentExtract.js";
import { summarizeAndScoreDocument } from "./gemma.js";

export type DocumentSummaryResult = {
  document_summary: string | null;
  document_summary_status: string;
  document_score: number | null;
};

/**
 * Extract PDF text, then summarize and score with Gemma.
 */
export async function documentSummaryForBuffer(
  buffer: Buffer | null | undefined,
  filename: string | null | undefined,
  log?: (step: string, detail?: Record<string, unknown>) => void
): Promise<DocumentSummaryResult> {
  if (!buffer?.length) {
    return { document_summary: null, document_summary_status: "skipped", document_score: null };
  }

  const ex = await extractTextFromPdf(buffer, PIPELINE_CONFIG.DOC_SUMMARY_MAX_EXTRACT_CHARS);
  if (!ex.ok) {
    if (ex.reason === "empty") {
      return { document_summary: null, document_summary_status: "no_text", document_score: null };
    }
    log?.("document_summary.extract_failed", { filename: filename ?? null });
    return { document_summary: null, document_summary_status: "extract_failed", document_score: null };
  }

  const combined = await summarizeAndScoreDocument(ex.text, filename ?? undefined);
  if (!combined) {
    return { document_summary: null, document_summary_status: "summarize_failed", document_score: null };
  }
  return {
    document_summary: combined.summary,
    document_summary_status: "ok",
    document_score: combined.score,
  };
}
