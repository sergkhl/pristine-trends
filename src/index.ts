import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createTelegramClient,
  displayNameFromEntity,
  downloadChannelAvatar,
  fetchCommentsForPost,
  fetchSince,
  hasLinkedDiscussion,
  parseMessageExternalId,
  type NormalizedMessage,
} from "./adapters/telegram.js";
import {
  scoreAndTranslateBatch,
  describeImageWithGemma,
  translateChannelTitleToEnglish,
  summarizeComments,
  type GemmaTextResult,
} from "./pipeline/gemma.js";
import { transcribeAudio } from "./pipeline/whisper.js";
import { scrapeOG } from "./pipeline/og.js";
import { linkSummaryForFirstUrl, type LinkSummaryResult } from "./pipeline/linkSummary.js";
import { documentSummaryForBuffer } from "./pipeline/documentSummary.js";
import { CHANNELS, PIPELINE_CONFIG } from "./config/channels.js";
import { uploadMessageImage } from "./storage/messageMedia.js";
import { chunk } from "./util/chunk.js";
import { computeGlobalScore } from "./util/computeGlobalScore.js";
import { normalizeLinkUrl } from "./util/normalizeLinkUrl.js";
import { isPipelineDebug } from "./util/pipelineDebug.js";
import type { TelegramClient } from "telegram";

const AVATAR_BUCKET = "channel-avatars";

function logPipeline(step: string, detail?: Record<string, unknown>): void {
  const suffix = detail ? ` ${JSON.stringify(detail)}` : "";
  console.log(`[pipeline] ${step}${suffix}`);
}

function debugPipeline(step: string, detail?: Record<string, unknown>): void {
  if (!isPipelineDebug()) return;
  const suffix = detail ? ` ${JSON.stringify(detail)}` : "";
  console.debug(`[pipeline] ${step}${suffix}`);
}

function maxPublishedAtByChannel(msgs: NormalizedMessage[]): Map<string, Date> {
  const maxMs = new Map<string, number>();
  for (const msg of msgs) {
    const t = new Date(msg.publishedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const cur = maxMs.get(msg.channelId) ?? 0;
    if (t > cur) maxMs.set(msg.channelId, t);
  }
  return new Map([...maxMs].map(([id, ms]) => [id, new Date(ms)]));
}

async function persistIngestCursors(
  supabase: SupabaseClient,
  msgs: NormalizedMessage[]
): Promise<void> {
  const maxBy = maxPublishedAtByChannel(msgs);
  if (maxBy.size === 0) return;
  for (const [channelId, at] of maxBy) {
    const { error } = await supabase
      .from("channels")
      .update({ ingest_cursor_published_at: at.toISOString() })
      .eq("channel_id", channelId);
    if (error) throw error;
  }
}

type MessageInsert = {
  external_id: string;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  original_text: string | null;
  translated_text: string | null;
  text_score: number | null;
  text_score_reason: string | null;
  quality_status: string;
  audio_transcript: string | null;
  image_caption: string | null;
  link_preview: Record<string, string | null> | null;
  media_urls: string[];
  link_urls: string[];
  link_summary: string | null;
  link_summary_status: string;
  link_score: number | null;
  document_summary: string | null;
  document_summary_status: string;
  document_score: number | null;
  global_score: number | null;
  comment_count: number;
  comment_summary: string | null;
  comment_summary_status: string | null;
  published_at: string;
};

async function ingestFetchedMessages(
  supabase: SupabaseClient,
  fetched: NormalizedMessage[]
): Promise<void> {
  if (fetched.length === 0) return;

  logPipeline("supabase.dedupe.start", { candidates: fetched.length });
  const externalIds = fetched.map((m) => m.externalId);
  const { data: existing } = await supabase.from("messages").select("external_id").in("external_id", externalIds);
  const seen = new Set((existing ?? []).map((r) => r.external_id as string));
  const fresh = fetched.filter((m) => !seen.has(m.externalId));
  const perChannel = CHANNELS.map((ch) => {
    const nFetched = fetched.filter((m) => m.channelId === ch.id).length;
    const freshN = fresh.filter((m) => m.channelId === ch.id).length;
    return { channel_id: ch.id, fetched: nFetched, fresh: freshN, skippedDuplicates: nFetched - freshN };
  });
  logPipeline("supabase.dedupe.done", {
    fresh: fresh.length,
    skipped: fetched.length - fresh.length,
    perChannel,
  });
  if (fresh.length === 0 && fetched.length > 0) {
    logPipeline("supabase.dedupe.all_duplicates_heal_cursors");
  }

  const linkSummaryCache = new Map<string, LinkSummaryResult>();
  const normalizedUrls = new Set<string>();
  for (const m of fresh) {
    if (m.linkUrls[0]) {
      const n = normalizeLinkUrl(m.linkUrls[0]);
      if (n) normalizedUrls.add(n);
    }
  }
  const urlList = [...normalizedUrls];
  if (urlList.length > 0) {
    const { data: linkRows, error: linkCacheErr } = await supabase
      .from("messages")
      .select("link_urls, link_summary, link_score")
      .eq("link_summary_status", "ok")
      .overlaps("link_urls", urlList);
    if (linkCacheErr) throw linkCacheErr;
    const wanted = new Set(urlList);
    for (const row of linkRows ?? []) {
      const urls = (row.link_urls as string[]) ?? [];
      for (const u of urls) {
        const n = normalizeLinkUrl(u);
        if (n && wanted.has(n) && row.link_summary != null) {
          linkSummaryCache.set(n, {
            link_summary: row.link_summary as string,
            link_summary_status: "ok",
            link_score: row.link_score != null ? Number(row.link_score) : null,
          });
        }
      }
    }
    logPipeline("link_summary.cache", { urlsRequested: urlList.length, cacheHits: linkSummaryCache.size });
  }

  const textBatches = chunk(
    fresh.filter(
      (m) => m.text && m.text.trim().length >= PIPELINE_CONFIG.MIN_TEXT_SCORE_LENGTH
    ),
    PIPELINE_CONFIG.BATCH_SIZE
  );
  const aiResults = new Map<string, GemmaTextResult>();

  logPipeline("gemma.score_batches.start", { batches: textBatches.length });
  for (const batch of textBatches) {
    const scored = await scoreAndTranslateBatch(
      batch.map((m) => ({ id: m.externalId, text: m.text!, sourceLang: m.sourceLang }))
    );
    for (const r of scored) {
      aiResults.set(r.id, r);
    }
  }
  logPipeline("gemma.score_batches.done", { scoredIds: aiResults.size });

  logPipeline("enrich.start", { count: fresh.length });
  const enriched: MessageInsert[] = await Promise.all(
    fresh.map(async (msg) => {
      const ai = aiResults.get(msg.externalId);
      const textScore = ai?.score ?? null;

      const [audioText, imageCaption, linkPreview, mediaPublicUrl, linkBlock, docBlock] =
        await Promise.all([
          msg.audioBuffer ? transcribeAudio(msg.audioBuffer) : Promise.resolve(null),
          msg.mediaBuffers[0] ? describeImageWithGemma(msg.mediaBuffers[0]) : Promise.resolve(null),
          msg.linkUrls[0] ? scrapeOG(msg.linkUrls[0]) : Promise.resolve(null),
          msg.mediaBuffers[0]
            ? uploadMessageImage(supabase, msg.channelId, msg.externalId, msg.mediaBuffers[0])
            : Promise.resolve(null),
          linkSummaryForFirstUrl(msg.linkUrls[0], textScore, logPipeline, linkSummaryCache),
          msg.documentBuffer
            ? documentSummaryForBuffer(msg.documentBuffer, msg.documentFilename, logPipeline)
            : Promise.resolve({
                document_summary: null,
                document_summary_status: "skipped",
                document_score: null,
              }),
        ]);

      const { link_summary, link_summary_status, link_score } = linkBlock;
      const { document_summary, document_summary_status, document_score } = docBlock;

      const globalScore = computeGlobalScore(textScore, link_score, document_score);
      const belowThreshold =
        (globalScore ?? 10) < PIPELINE_CONFIG.QUALITY_WARN_THRESHOLD;

      return {
        external_id: msg.externalId,
        channel_id: msg.channelId,
        channel_name: msg.channelName,
        channel_type: msg.channelType,
        original_text: msg.text,
        translated_text: ai?.translatedText ?? null,
        text_score: textScore,
        text_score_reason: ai?.reason ?? null,
        quality_status: belowThreshold ? "low_quality" : "ok",
        audio_transcript: audioText,
        image_caption: imageCaption || null,
        link_preview: linkPreview,
        media_urls: mediaPublicUrl ? [mediaPublicUrl] : [],
        link_urls: msg.linkUrls,
        link_summary,
        link_summary_status,
        link_score,
        document_summary,
        document_summary_status,
        document_score,
        global_score: globalScore,
        comment_count: 0,
        comment_summary: null,
        comment_summary_status: null,
        published_at: msg.publishedAt,
      };
    })
  );
  logPipeline("enrich.done", { count: enriched.length });

  if (enriched.length === 0) {
    if (fetched.length > 0) {
      await persistIngestCursors(supabase, fetched);
      logPipeline("channels.ingest_cursor.updated", {
        reason: "all_duplicates",
        channels: [...maxPublishedAtByChannel(fetched).keys()],
      });
    }
    console.log("No new messages to insert");
    return;
  }

  logPipeline("supabase.messages.insert.start", { rows: enriched.length });
  const { error } = await supabase.from("messages").insert(enriched);
  if (error) throw error;
  console.log(`Inserted ${enriched.length} messages`);
  logPipeline("supabase.messages.insert.ok", { rows: enriched.length });

  await persistIngestCursors(supabase, fetched);
  logPipeline("channels.ingest_cursor.updated", {
    reason: "after_insert",
    channels: [...maxPublishedAtByChannel(fetched).keys()],
  });
}

async function refreshCommentSummaries(
  supabase: SupabaseClient,
  client: TelegramClient
): Promise<void> {
  const channelIds = CHANNELS.map((c) => c.id);
  const windowMs = PIPELINE_CONFIG.COMMENT_SUMMARY_WINDOW_HOURS * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, external_id, channel_id, original_text, comment_summary_status, comment_count")
    .in("channel_id", channelIds)
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  const candidates = (rows ?? []).filter((r) => {
    const s = r.comment_summary_status;
    return s !== "no_discussion" && s !== "short_text";
  });
  const toProcess = candidates.slice(0, PIPELINE_CONFIG.COMMENT_SUMMARY_MAX_POSTS_PER_RUN);

  logPipeline("comment_summary.start", {
    windowHours: PIPELINE_CONFIG.COMMENT_SUMMARY_WINDOW_HOURS,
    candidates: candidates.length,
    processing: toProcess.length,
  });

  const discussionCache = new Map<string, boolean>();
  const min = PIPELINE_CONFIG.COMMENT_SUMMARY_MIN_COUNT;
  const delayMs = PIPELINE_CONFIG.COMMENT_SUMMARY_DELAY_MS;
  const resummarizeDelta = PIPELINE_CONFIG.COMMENT_SUMMARY_RESUMMARIZE_DELTA;

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i]!;
    const isResummarize = row.comment_summary_status === "ok";
    debugPipeline("comment_summary.row", {
      index: i + 1,
      of: toProcess.length,
      id: row.id,
      external_id: row.external_id,
      channel_id: row.channel_id,
      comment_summary_status: row.comment_summary_status,
      isResummarize,
    });
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    const parsed = parseMessageExternalId(row.external_id as string);
    if (!parsed) {
      logPipeline("comment_summary.skip_bad_external_id", { id: row.id });
      continue;
    }

    const { channelId, messageId } = parsed;

    try {
      const hasDiscussion = await hasLinkedDiscussion(client, channelId, discussionCache);
      if (!hasDiscussion) {
        const { error: upErr } = await supabase
          .from("messages")
          .update({
            comment_count: 0,
            comment_summary: null,
            comment_summary_status: "no_discussion",
          })
          .eq("id", row.id);
        if (upErr) throw upErr;
        continue;
      }

      const texts = await fetchCommentsForPost(client, channelId, messageId);
      const count = texts.length;

      if (count < min) {
        if (!isResummarize) {
          const { error: upErr } = await supabase
            .from("messages")
            .update({
              comment_count: count,
              comment_summary: null,
              comment_summary_status: "below_threshold",
            })
            .eq("id", row.id);
          if (upErr) throw upErr;
        }
        continue;
      }

      const storedCount = (row.comment_count as number | null) ?? 0;
      if (isResummarize && count - storedCount < resummarizeDelta) {
        debugPipeline("comment_summary.skip_delta", {
          id: row.id,
          storedCount,
          liveCount: count,
          delta: count - storedCount,
          requiredDelta: resummarizeDelta,
        });
        continue;
      }

      const textLen = ((row.original_text as string | null) ?? "").trim().length;
      const minText = PIPELINE_CONFIG.COMMENT_SUMMARY_MIN_TEXT_LENGTH;
      if (textLen > 0 && textLen < minText) {
        const { error: upErr } = await supabase
          .from("messages")
          .update({
            comment_count: count,
            comment_summary: null,
            comment_summary_status: "short_text",
          })
          .eq("id", row.id);
        if (upErr) throw upErr;
        continue;
      }

      if (isResummarize) {
        logPipeline("comment_summary.resummarize", {
          id: row.id,
          external_id: row.external_id,
          storedCount,
          liveCount: count,
        });
      }
      debugPipeline("comment_summary.gemma_input", {
        id: row.id,
        external_id: row.external_id,
        channelId,
        messageId,
        commentCount: count,
      });
      const summary = await summarizeComments((row.original_text as string | null) ?? null, texts);
      if (!summary) {
        const { error: upErr } = await supabase
          .from("messages")
          .update({
            comment_count: count,
            comment_summary: isResummarize ? undefined : null,
            comment_summary_status: isResummarize ? "ok" : "summarize_failed",
            comment_summary_updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (upErr) throw upErr;
        continue;
      }

      const { error: upErr } = await supabase
        .from("messages")
        .update({
          comment_count: count,
          comment_summary: summary,
          comment_summary_status: "ok",
          comment_summary_updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
    } catch (err) {
      console.warn(`[pipeline] comment_summary row failed id=${row.id}`, err);
      if (!isResummarize) {
        const { error: upErr } = await supabase
          .from("messages")
          .update({ comment_summary_status: "skipped" })
          .eq("id", row.id);
        if (upErr) console.warn("[pipeline] comment_summary skip persist failed", upErr);
      }
    }
  }

  logPipeline("comment_summary.done", { processed: toProcess.length });
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const channelIds = CHANNELS.map((c) => c.id);
  const { data: cursorRows, error: cursorErr } = await supabase
    .from("channels")
    .select("channel_id, ingest_cursor_published_at, display_name, display_name_en")
    .in("channel_id", channelIds);
  if (cursorErr) throw cursorErr;
  const cursorPublishedAtByChannel = new Map<string, string | null>();
  const channelMetaByChannel = new Map<
    string,
    { display_name: string | null; display_name_en: string | null }
  >();
  for (const row of cursorRows ?? []) {
    const cid = row.channel_id as string;
    cursorPublishedAtByChannel.set(cid, (row.ingest_cursor_published_at as string | null) ?? null);
    channelMetaByChannel.set(cid, {
      display_name: (row.display_name as string | null) ?? null,
      display_name_en: (row.display_name_en as string | null) ?? null,
    });
  }

  const defaultSinceMs = Date.now() - PIPELINE_CONFIG.DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000;
  const overlapMs = PIPELINE_CONFIG.CURSOR_OVERLAP_MINUTES * 60 * 1000;

  function sinceForChannel(channelId: string): Date {
    const iso = cursorPublishedAtByChannel.get(channelId);
    if (!iso) return new Date(defaultSinceMs);
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return new Date(defaultSinceMs);
    return new Date(t - overlapMs);
  }

  const tg = createTelegramClient();
  logPipeline("telegram.connect.start");
  await tg.connect();
  logPipeline("telegram.connect.ok");

  let fetched: NormalizedMessage[] = [];
  try {
    logPipeline("telegram.channel_sync.start", { count: CHANNELS.length });
    for (const ch of CHANNELS) {
      let entity: object;
      try {
        entity = await tg.getEntity(ch.id);
      } catch (err) {
        console.warn(`[Telegram] Skipping channel ${ch.id} (unresolved or inaccessible):`, err);
        continue;
      }
      const title = displayNameFromEntity(entity);
      let displayNameEn: string | null = null;
      const stored = channelMetaByChannel.get(ch.id);
      try {
        if (stored?.display_name === title && stored.display_name_en) {
          displayNameEn = stored.display_name_en;
        } else {
          displayNameEn = await translateChannelTitleToEnglish(title, ch.lang);
        }
      } catch (err) {
        console.warn(`[pipeline] channel title translation failed for ${ch.id}:`, err);
      }
      const buf = await downloadChannelAvatar(tg, entity);
      const path = `${ch.id}/avatar.jpg`;
      let publicUrl: string | null = null;
      if (buf) {
        const { error: upErr } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(path, buf, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw upErr;
        publicUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
      }
      const { error: upChannelErr } = await supabase.from("channels").upsert({
        channel_id: ch.id,
        display_name: title,
        display_name_en: displayNameEn,
        channel_type: ch.type,
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      });
      if (upChannelErr) throw upChannelErr;
    }
    logPipeline("telegram.channel_sync.done");

    const cutoffs = Object.fromEntries(channelIds.map((id) => [id, sinceForChannel(id).toISOString()]));
    logPipeline("telegram.fetch_since.start", {
      cutoffs,
      defaultLookbackHours: PIPELINE_CONFIG.DEFAULT_LOOKBACK_HOURS,
      overlapMinutes: PIPELINE_CONFIG.CURSOR_OVERLAP_MINUTES,
    });
    fetched = await fetchSince(tg, sinceForChannel);
    logPipeline("telegram.fetch_since.done", { messages: fetched.length });

    if (fetched.length === 0) {
      console.log("No messages fetched this run");
    } else {
      console.log(`Fetched ${fetched.length} messages`);
    }

    await ingestFetchedMessages(supabase, fetched);
    await refreshCommentSummaries(supabase, tg);
  } finally {
    logPipeline("telegram.destroy.start");
    try {
      await tg.destroy();
      logPipeline("telegram.destroy.ok");
    } catch (err) {
      console.warn("[pipeline] telegram.destroy.failed", err);
    }
  }
}

main().catch((err) => {
  console.error("[pipeline] fatal", err);
  process.exit(1);
});
