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

/** When set, only messages with text_score >= this value get link summarization. */
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

/** Minimum post body length (chars) to run comment summarization; shorter text skips Gemma. */
function envCommentSummaryMinTextLength(): number {
  return envNumber("COMMENT_SUMMARY_MIN_TEXT_LENGTH", 100);
}

/** Re-summarize an already-ok post when live comment count exceeds stored count by at least this many. */
function envCommentSummaryResummarizeDelta(): number {
  return envNumber("COMMENT_SUMMARY_RESUMMARIZE_DELTA", 7);
}

function envDocSummaryMaxExtractChars(): number {
  return envNumber("DOC_SUMMARY_MAX_EXTRACT_CHARS", 12_000);
}

function envSkillsEnabled(): readonly string[] {
  const raw = typeof process !== "undefined" ? process.env?.SKILLS_ENABLED : undefined;
  if (typeof raw !== "string" || !raw.trim()) return ["fact-checker"] as const;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export const PIPELINE_CONFIG = {
  QUALITY_WARN_THRESHOLD: 4.0,
  /** Minimum original message length (characters) to run text scoring + translation batch. */
  MIN_TEXT_SCORE_LENGTH: 100,
  BATCH_SIZE: 5,
  /** Preferred primary model (first in fallback chain). */
  GEMMA_MODEL: "gemma-4-31b-it",
  /** Text LLM fallback order when a model returns HTTP 429 (rate limit). */
  GEMMA_FALLBACK_CHAIN: [
    "gemma-4-31b-it",
    "gemma-4-26b-a4b-it",
    "gemma-3-27b-it",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemma-3-12b-it",
  ] as const,
  /** Vision (inline image) calls: Gemma models only. */
  GEMMA_VISION_CHAIN: ["gemma-4-31b-it", "gemma-4-26b-a4b-it", "gemma-3-27b-it", "gemma-3-12b-it"] as const,
  HF_WHISPER: "openai/whisper-large-v3",
  /** First run or missing cursor: fetch at least this many hours back. */
  DEFAULT_LOOKBACK_HOURS: envNumber("PIPELINE_DEFAULT_LOOKBACK_HOURS", 24),
  /** Re-fetch this much before stored cursor to tolerate skew and ordering. */
  CURSOR_OVERLAP_MINUTES: envNumber("PIPELINE_CURSOR_OVERLAP_MINUTES", 15),
  /** Tavily Extract depth; override with TAVILY_EXTRACT_DEPTH=basic|advanced */
  TAVILY_EXTRACT_DEPTH: envTavilyExtractDepth(),
  /** Max characters of extracted page text sent to Gemma for summarization. */
  LINK_SUMMARY_MAX_EXTRACT_CHARS: envNumber("LINK_SUMMARY_MAX_EXTRACT_CHARS", 12_000),
  /** Max characters of extracted PDF text sent to Gemma for document summary + score. */
  DOC_SUMMARY_MAX_EXTRACT_CHARS: envDocSummaryMaxExtractChars(),
  /** Tavily Extract timeout in seconds (1–60 per API). */
  TAVILY_EXTRACT_TIMEOUT_SEC: envNumber("TAVILY_EXTRACT_TIMEOUT_SEC", 25),
  /** Optional minimum text_score for link summarization (unset = all messages with links). */
  LINK_SUMMARY_MIN_SCORE: envLinkSummaryMinScore(),
  /** Re-fetch comments and refresh summaries for posts at least this recent. */
  COMMENT_SUMMARY_WINDOW_HOURS: envCommentSummaryWindowHours(),
  /** Minimum reply count before calling Gemma for a comment summary. */
  COMMENT_SUMMARY_MIN_COUNT: envCommentSummaryMinCount(),
  /** Cap comment-summary work per pipeline run (after window filter). */
  COMMENT_SUMMARY_MAX_POSTS_PER_RUN: envCommentSummaryMaxPostsPerRun(),
  COMMENT_SUMMARY_DELAY_MS: envCommentSummaryDelayMs(),
  /** Skip comment LLM when original_text is non-empty but shorter than this (chars). */
  COMMENT_SUMMARY_MIN_TEXT_LENGTH: envCommentSummaryMinTextLength(),
  /** Re-summarize when live comment count exceeds stored count by at least this delta. */
  COMMENT_SUMMARY_RESUMMARIZE_DELTA: envCommentSummaryResummarizeDelta(),

  /** Skills to run during enrichment. */
  SKILLS_ENABLED: envSkillsEnabled(),
  /** Minimum original text length (chars) to qualify for skill execution. */
  SKILL_MIN_TEXT_LENGTH: envNumber("SKILL_MIN_TEXT_LENGTH", 200),
  /** Minimum text_score to qualify for skill execution. */
  SKILL_MIN_SCORE: envNumber("SKILL_MIN_SCORE", 4),
  /** Max messages that get skill execution per pipeline run. */
  SKILL_MAX_MESSAGES_PER_RUN: envNumber("SKILL_MAX_MESSAGES_PER_RUN", 10),
} as const;
