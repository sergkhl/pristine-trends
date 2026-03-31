import { tavily } from "@tavily/core";
import { PIPELINE_CONFIG } from "../config/channels.js";
import { isPipelineDebug } from "../util/pipelineDebug.js";

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r));
}

function dlog(msg: string, detail?: Record<string, unknown>): void {
  if (!isPipelineDebug()) return;
  const tail = detail ? ` ${JSON.stringify(detail)}` : "";
  console.debug(`[Tavily] ${msg}${tail}`);
}

/** Block non-http(s) and obvious loopback / private IPv4 hostnames (no DNS resolution). */
export function isUrlAllowedForTavily(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "[::1]" || host === "::1") return false;

  const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
  if (ipv4.test(host)) {
    const parts = host.split(".").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n > 255)) return false;
    const [a, b] = parts;
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return false;
  }
  return true;
}

function truncateForModel(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n[truncated]`;
}

function isRetryableTavilyStatus(status: number | undefined): boolean {
  return status === 429 || status === 432 || status === 433 || (status !== undefined && status >= 500 && status < 600);
}

function httpStatusFromUnknown(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const o = err as { response?: { status?: number }; status?: number };
  const s = o.response?.status ?? o.status;
  return typeof s === "number" ? s : undefined;
}

export type TavilyExtractOutcome =
  | { status: "ok"; rawContent: string; requestId?: string }
  | { status: "extract_failed"; requestId?: string; detail?: string }
  | { status: "no_text"; requestId?: string };

/**
 * Extract main page text via Tavily for a single URL (validated). Retries on 429 / 5xx.
 */
export async function extractPageTextForUrl(url: string): Promise<TavilyExtractOutcome> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is required for extractPageTextForUrl");
  }
  if (!isUrlAllowedForTavily(url)) {
    dlog("extract.skip", { reason: "url_not_allowed", url });
    return { status: "extract_failed", detail: "url_not_allowed" };
  }

  const tvly = tavily({ apiKey });
  const timeout = Math.min(60, Math.max(1, PIPELINE_CONFIG.TAVILY_EXTRACT_TIMEOUT_SEC));
  const extractDepth = PIPELINE_CONFIG.TAVILY_EXTRACT_DEPTH;
  const maxChars = PIPELINE_CONFIG.LINK_SUMMARY_MAX_EXTRACT_CHARS;

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const t0 = performance.now();
      dlog("extract.start", { url, extractDepth, timeout });
      const response = await tvly.extract([url], {
        extractDepth,
        format: "markdown",
        timeout,
      });
      dlog("extract.response", {
        ms: Math.round(performance.now() - t0),
        requestId: response.requestId,
        results: response.results?.length ?? 0,
        failed: response.failedResults?.length ?? 0,
      });

      const row =
        response.results?.find((r) => r.url === url) ?? response.results?.[0];
      const fail = response.failedResults?.find((f) => f.url === url) ?? response.failedResults?.[0];

      if (!row?.rawContent?.trim()) {
        if (fail) {
          return {
            status: "extract_failed",
            requestId: response.requestId,
            detail: fail.error,
          };
        }
        return { status: "no_text", requestId: response.requestId };
      }

      const raw = row.rawContent.trim();
      return {
        status: "ok",
        rawContent: truncateForModel(raw, maxChars),
        requestId: response.requestId,
      };
    } catch (err) {
      lastErr = err;
      const status = httpStatusFromUnknown(err);
      if (isRetryableTavilyStatus(status) && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * 2 ** attempt;
        console.warn(
          `[Tavily] extract retry in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES}) status=${status ?? "?"}`
        );
        await sleep(delay);
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Tavily] extract failed", msg);
      return { status: "extract_failed", detail: msg };
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return { status: "extract_failed", detail: msg };
}
