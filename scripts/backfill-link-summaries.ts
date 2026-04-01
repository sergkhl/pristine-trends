/**
 * Re-run Tavily + Gemma link summarization for existing rows (e.g. after adding TAVILY_API_KEY).
 *
 * Usage: `npm run backfill-link-summaries`
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_AI_KEY, TAVILY_API_KEY (same as pipeline)
 * Optional:
 *   BACKFILL_HOURS=48   — only messages with published_at in this window (default 48)
 *   BACKFILL_LIMIT=100  — max rows to process (default unlimited)
 *   BACKFILL_DRY_RUN=1  — log actions only, no updates
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { linkSummaryForFirstUrl } from "../src/pipeline/linkSummary.js";
import { normalizeLinkUrls } from "../src/util/normalizeLinkUrl.js";

function envNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envBool(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function log(step: string, detail?: Record<string, unknown>): void {
  const suffix = detail ? ` ${JSON.stringify(detail)}` : "";
  console.log(`[backfill-link-summaries] ${step}${suffix}`);
}

type Row = {
  id: string;
  link_urls: string[] | null;
  quality_score: number | string | null;
};

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const hours = envNumber("BACKFILL_HOURS", 48);
  const processLimit = process.env.BACKFILL_LIMIT?.trim()
    ? envNumber("BACKFILL_LIMIT", 500)
    : null;
  const dry = envBool("BACKFILL_DRY_RUN");

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const fetchCap = Math.min(5000, Math.max((processLimit ?? 500) * 4, 200));

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, link_urls, quality_score")
    .gte("published_at", since)
    .or("link_summary_status.is.null,link_summary_status.neq.ok")
    .order("published_at", { ascending: false })
    .limit(fetchCap);

  if (error) throw error;

  const withLinks = (rows ?? []).filter(
    (r) => Array.isArray(r.link_urls) && r.link_urls.length > 0
  ) as Row[];
  const list = processLimit != null ? withLinks.slice(0, processLimit) : withLinks;
  log("start", { hours, since, candidates: list.length, dry });

  let updated = 0;
  for (const row of list) {
    const urls = normalizeLinkUrls(row.link_urls ?? []);
    const score =
      row.quality_score == null
        ? null
        : typeof row.quality_score === "number"
          ? row.quality_score
          : Number(row.quality_score);

    const { link_summary, link_summary_status } = await linkSummaryForFirstUrl(
      urls[0],
      Number.isFinite(score as number) ? (score as number) : null,
      log
    );

    const patch = {
      link_summary,
      link_summary_status,
      link_urls: urls.length > 0 ? urls : row.link_urls,
    };

    if (dry) {
      log("dry_run", { id: row.id, link_summary_status, urls: urls.slice(0, 2) });
      continue;
    }

    const { error: upErr } = await supabase.from("messages").update(patch).eq("id", row.id);
    if (upErr) {
      console.warn(`[backfill-link-summaries] update failed ${row.id}`, upErr);
      continue;
    }
    updated++;
  }

  log("done", { processed: list.length, updated, dry });
}

main().catch((err) => {
  console.error("[backfill-link-summaries] fatal", err);
  process.exit(1);
});
