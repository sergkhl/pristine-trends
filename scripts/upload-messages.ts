/**
 * One-time (or occasional) backfill: upload photos to `message-media` for rows
 * that have empty `media_urls`, then update the row. Does not re-run Gemma or change cursors.
 *
 * Usage: `npm run upload-messages`
 * Optional: `UPLOAD_MESSAGES_LIMIT=200` (default 500)
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  createTelegramClient,
  downloadPhotoBufferForMessage,
} from "../src/adapters/telegram.js";
import { uploadMessageImage } from "../src/storage/messageMedia.js";

function envNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function telegramMessageIdFromExternalId(externalId: string): number | null {
  const i = externalId.lastIndexOf("_");
  if (i <= 0) return null;
  const n = Number(externalId.slice(i + 1));
  return Number.isFinite(n) ? n : null;
}

function log(step: string, detail?: Record<string, unknown>): void {
  const suffix = detail ? ` ${JSON.stringify(detail)}` : "";
  console.log(`[upload-messages] ${step}${suffix}`);
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const limit = envNumber("UPLOAD_MESSAGES_LIMIT", 500);
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let rows: { external_id: string; channel_id: string; media_urls: string[] | null }[] = [];
  const emptyFilter = await supabase
    .from("messages")
    .select("external_id, channel_id, media_urls")
    .or("media_urls.is.null,media_urls.eq.{}")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (emptyFilter.error) {
    log("query_fallback", { reason: emptyFilter.error.message });
    const scan = await supabase
      .from("messages")
      .select("external_id, channel_id, media_urls")
      .order("published_at", { ascending: false })
      .limit(Math.min(limit * 20, 5000));
    if (scan.error) throw scan.error;
    rows = (scan.data ?? []).filter((r) => {
      const u = r.media_urls as string[] | null;
      return !u || u.length === 0;
    }).slice(0, limit) as typeof rows;
  } else {
    rows = (emptyFilter.data ?? []) as typeof rows;
  }

  log("candidates", { willRun: rows.length });
  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const tg = createTelegramClient();
  await tg.connect();

  let ok = 0;
  let skippedNoPhoto = 0;
  let skippedParse = 0;
  let failedUpload = 0;
  let failedUpdate = 0;

  try {
    for (const row of rows) {
      const externalId = row.external_id as string;
      const channelId = row.channel_id as string;
      const msgId = telegramMessageIdFromExternalId(externalId);
      if (msgId == null) {
        skippedParse++;
        log("skip_bad_external_id", { externalId });
        continue;
      }

      const buf = await downloadPhotoBufferForMessage(tg, channelId, msgId);
      if (!buf) {
        skippedNoPhoto++;
        continue;
      }

      const publicUrl = await uploadMessageImage(supabase, channelId, externalId, buf);
      if (!publicUrl) {
        failedUpload++;
        continue;
      }

      const { error: upErr } = await supabase
        .from("messages")
        .update({ media_urls: [publicUrl] })
        .eq("external_id", externalId);

      if (upErr) {
        failedUpdate++;
        console.warn("[upload-messages] update failed:", externalId, upErr.message);
        continue;
      }
      ok++;
      log("updated", { externalId });
    }
  } finally {
    try {
      await tg.destroy();
    } catch (err) {
      console.warn("[upload-messages] telegram.destroy.failed", err);
    }
  }

  log("done", { ok, skippedNoPhoto, skippedParse, failedUpload, failedUpdate });
}

main().catch((err) => {
  console.error("[upload-messages] fatal", err);
  process.exit(1);
});
