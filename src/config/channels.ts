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

export const PIPELINE_CONFIG = {
  QUALITY_WARN_THRESHOLD: 4.0,
  BATCH_SIZE: 5,
  GEMMA_MODEL: "gemma-3-27b-it",
  HF_WHISPER: "openai/whisper-large-v3",
  /** First run or missing cursor: fetch at least this many hours back. */
  DEFAULT_LOOKBACK_HOURS: envNumber("PIPELINE_DEFAULT_LOOKBACK_HOURS", 24),
  /** Re-fetch this much before stored cursor to tolerate skew and ordering. */
  CURSOR_OVERLAP_MINUTES: envNumber("PIPELINE_CURSOR_OVERLAP_MINUTES", 15),
} as const;
