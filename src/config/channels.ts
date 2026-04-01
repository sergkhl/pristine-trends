export type ChannelSourceType = "public" | "private" | "group";

export interface ChannelConfig {
  id: string;
  type: ChannelSourceType;
  lang: "ru" | "zh" | "mixed";
}

export function fallbackInitialsFromChannelType(type: ChannelSourceType): string {
  switch (type) {
    case "public":
      return "PU";
    case "private":
      return "PR";
    case "group":
      return "GR";
  }
}

/** Entries Telegram cannot resolve (wrong username, deleted channel, etc.) are skipped; the rest of the pipeline still runs. */
export const CHANNELS: ChannelConfig[] = [
  { id: "@prompt_chat", type: "public", lang: "ru" },
  { id: "@prompt_design", type: "public", lang: "ru" },
  { id: "@denissexy", type: "public", lang: "ru" },
];

function envNumber(name: string, fallback: number): number {
  if (typeof process === "undefined" || process.env == null) return fallback;
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envTavilyExtractDepth(): "basic" | "advanced" {
  const raw = typeof process !== "undefined" ? process.env?.TAVILY_EXTRACT_DEPTH : undefined;
  const v = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (v === "advanced") return "advanced";
  return "basic";
}

/** When set, only messages with quality_score >= this value get link summarization. */
function envLinkSummaryMinScore(): number | null {
  const v = typeof process !== "undefined" ? process.env?.LINK_SUMMARY_MIN_SCORE : undefined;
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function envCommentSummaryWindowHours(): number {
  return envNumber("COMMENT_SUMMARY_WINDOW_HOURS", 48);
}

function envCommentSummaryMinCount(): number {
  return envNumber("COMMENT_SUMMARY_MIN_COUNT", 5);
}

function envCommentSummaryMaxPostsPerRun(): number {
  return envNumber("COMMENT_SUMMARY_MAX_POSTS_PER_RUN", 50);
}

/** Delay between Telegram getReplies calls to reduce flood limits. */
function envCommentSummaryDelayMs(): number {
  return envNumber("COMMENT_SUMMARY_DELAY_MS", 400);
}

export const PIPELINE_CONFIG = {
  QUALITY_WARN_THRESHOLD: 4.0,
  BATCH_SIZE: 5,
  GEMMA_MODEL: "gemma-3-27b-it",
  HF_WHISPER: "openai/whisper-large-v3",
  /** First run or missing cursor: fetch at least this many hours back. */
  DEFAULT_LOOKBACK_HOURS: envNumber("PIPELINE_DEFAULT_LOOKBACK_HOURS", 24),
  /** Re-fetch this much before stored cursor to tolerate skew and ordering. */
  CURSOR_OVERLAP_MINUTES: envNumber("PIPELINE_CURSOR_OVERLAP_MINUTES", 15),
  /** Tavily Extract depth; override with TAVILY_EXTRACT_DEPTH=basic|advanced */
  TAVILY_EXTRACT_DEPTH: envTavilyExtractDepth(),
  /** Max characters of extracted page text sent to Gemma for summarization. */
  LINK_SUMMARY_MAX_EXTRACT_CHARS: envNumber("LINK_SUMMARY_MAX_EXTRACT_CHARS", 12_000),
  /** Tavily Extract timeout in seconds (1–60 per API). */
  TAVILY_EXTRACT_TIMEOUT_SEC: envNumber("TAVILY_EXTRACT_TIMEOUT_SEC", 25),
  /** Optional minimum quality_score for link summarization (unset = all messages with links). */
  LINK_SUMMARY_MIN_SCORE: envLinkSummaryMinScore(),
  /** Re-fetch comments and refresh summaries for posts at least this recent. */
  COMMENT_SUMMARY_WINDOW_HOURS: envCommentSummaryWindowHours(),
  /** Minimum reply count before calling Gemma for a comment summary. */
  COMMENT_SUMMARY_MIN_COUNT: envCommentSummaryMinCount(),
  /** Cap comment-summary work per pipeline run (after window filter). */
  COMMENT_SUMMARY_MAX_POSTS_PER_RUN: envCommentSummaryMaxPostsPerRun(),
  COMMENT_SUMMARY_DELAY_MS: envCommentSummaryDelayMs(),
} as const;
