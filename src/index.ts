import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createTelegramClient,
  displayNameFromEntity,
  downloadChannelAvatar,
  fetchSince,
  type NormalizedMessage,
} from "./adapters/telegram.js";
import {
  scoreAndTranslateBatch,
  describeImageWithGemma,
  type GemmaTextResult,
} from "./pipeline/gemma.js";
import { transcribeAudio } from "./pipeline/whisper.js";
import { scrapeOG } from "./pipeline/og.js";
import { CHANNELS, PIPELINE_CONFIG } from "./config/channels.js";
import { chunk } from "./util/chunk.js";

const AVATAR_BUCKET = "channel-avatars";

function logPipeline(step: string, detail?: Record<string, unknown>): void {
  const suffix = detail ? ` ${JSON.stringify(detail)}` : "";
  console.log(`[pipeline] ${step}${suffix}`);
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
  quality_score: number | null;
  quality_reason: string | null;
  quality_status: string;
  audio_transcript: string | null;
  image_caption: string | null;
  link_preview: Record<string, string | null> | null;
  media_urls: string[];
  link_urls: string[];
  published_at: string;
};

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
    .select("channel_id, ingest_cursor_published_at")
    .in("channel_id", channelIds);
  if (cursorErr) throw cursorErr;
  const cursorPublishedAtByChannel = new Map<string, string | null>();
  for (const row of cursorRows ?? []) {
    cursorPublishedAtByChannel.set(
      row.channel_id as string,
      (row.ingest_cursor_published_at as string | null) ?? null
    );
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
  let messages: Awaited<ReturnType<typeof fetchSince>>;
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
    messages = await fetchSince(tg, sinceForChannel);
    logPipeline("telegram.fetch_since.done", { messages: messages.length });
  } finally {
    logPipeline("telegram.destroy.start");
    try {
      await tg.destroy();
      logPipeline("telegram.destroy.ok");
    } catch (err) {
      console.warn("[pipeline] telegram.destroy.failed", err);
    }
  }

  console.log(`Fetched ${messages.length} messages`);

  if (messages.length === 0) {
    console.log("Nothing to insert");
    return;
  }

  logPipeline("supabase.dedupe.start", { candidates: messages.length });
  const externalIds = messages.map((m) => m.externalId);
  const { data: existing } = await supabase.from("messages").select("external_id").in("external_id", externalIds);
  const seen = new Set((existing ?? []).map((r) => r.external_id as string));
  const fresh = messages.filter((m) => !seen.has(m.externalId));
  const perChannel = CHANNELS.map((ch) => {
    const fetched = messages.filter((m) => m.channelId === ch.id).length;
    const freshN = fresh.filter((m) => m.channelId === ch.id).length;
    return { channel_id: ch.id, fetched, fresh: freshN, skippedDuplicates: fetched - freshN };
  });
  logPipeline("supabase.dedupe.done", {
    fresh: fresh.length,
    skipped: messages.length - fresh.length,
    perChannel,
  });
  if (fresh.length === 0 && messages.length > 0) {
    logPipeline("supabase.dedupe.all_duplicates_heal_cursors");
  }

  const textBatches = chunk(
    fresh.filter((m) => m.text),
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
      const [audioText, imageCaption, linkPreview] = await Promise.all([
        msg.audioBuffer ? transcribeAudio(msg.audioBuffer) : Promise.resolve(null),
        msg.mediaBuffers[0] ? describeImageWithGemma(msg.mediaBuffers[0]) : Promise.resolve(null),
        msg.linkUrls[0] ? scrapeOG(msg.linkUrls[0]) : Promise.resolve(null),
      ]);

      const score = ai?.score ?? null;
      const belowThreshold = (score ?? 10) < PIPELINE_CONFIG.QUALITY_WARN_THRESHOLD;

      return {
        external_id: msg.externalId,
        channel_id: msg.channelId,
        channel_name: msg.channelName,
        channel_type: msg.channelType,
        original_text: msg.text,
        translated_text: ai?.translatedText ?? null,
        quality_score: score,
        quality_reason: ai?.reason ?? null,
        quality_status: belowThreshold ? "low_quality" : "ok",
        audio_transcript: audioText,
        image_caption: imageCaption || null,
        link_preview: linkPreview,
        media_urls: [] as string[],
        link_urls: msg.linkUrls,
        published_at: msg.publishedAt,
      };
    })
  );
  logPipeline("enrich.done", { count: enriched.length });

  if (enriched.length === 0) {
    if (messages.length > 0) {
      await persistIngestCursors(supabase, messages);
      logPipeline("channels.ingest_cursor.updated", { reason: "all_duplicates", channels: [...maxPublishedAtByChannel(messages).keys()] });
    }
    console.log("No new messages to insert");
    return;
  }

  logPipeline("supabase.messages.insert.start", { rows: enriched.length });
  const { error } = await supabase.from("messages").insert(enriched);
  if (error) throw error;
  console.log(`Inserted ${enriched.length} messages`);
  logPipeline("supabase.messages.insert.ok", { rows: enriched.length });

  await persistIngestCursors(supabase, messages);
  logPipeline("channels.ingest_cursor.updated", { reason: "after_insert", channels: [...maxPublishedAtByChannel(messages).keys()] });
}

main().catch((err) => {
  console.error("[pipeline] fatal", err);
  process.exit(1);
});
