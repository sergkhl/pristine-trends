import { Api, TelegramClient, sessions } from "telegram";
import type { EntityLike } from "telegram/define.js";
import { CHANNELS, type ChannelSourceType } from "../config/channels.js";
import { normalizeLinkUrls } from "../util/normalizeLinkUrl.js";

type GramJsMessage = Record<string, unknown> & {
  id: number;
  date: number;
  message?: string;
  entities?: Array<{ className?: string; url?: string; offset?: number; length?: number }>;
  photo?: unknown;
  voice?: unknown;
  audio?: unknown;
  media?: {
    className?: string;
    photo?: unknown;
    voice?: unknown;
    audio?: unknown;
    document?: GramJsDocument;
  };
};

type GramJsDocument = {
  className?: string;
  mimeType?: string;
  attributes?: Array<{ className?: string; fileName?: string }>;
};

export interface NormalizedMessage {
  externalId: string;
  channelId: string;
  channelName: string;
  channelType: ChannelSourceType;
  sourceLang: string;
  text: string | null;
  mediaBuffers: Buffer[];
  audioBuffer: Buffer | null;
  /** First PDF document attached to the message (if any). */
  documentBuffer: Buffer | null;
  documentFilename: string | null;
  linkUrls: string[];
  publishedAt: string;
}

export function displayNameFromEntity(entity: object): string {
  const e = entity as {
    title?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  };
  if (e.title) return e.title;
  if (e.username) return `@${e.username}`;
  const n = [e.firstName, e.lastName].filter(Boolean).join(" ").trim();
  return n || "Unknown";
}

export async function downloadChannelAvatar(
  client: TelegramClient,
  entity: object
): Promise<Buffer | null> {
  const out = await client.downloadProfilePhoto(entity as EntityLike, { isBig: false });
  if (!out) return null;
  return Buffer.isBuffer(out) ? out : null;
}

export function createTelegramClient(): TelegramClient {
  return new TelegramClient(
    new sessions.StringSession(process.env.TELEGRAM_SESSION!),
    Number(process.env.TELEGRAM_API_ID!),
    process.env.TELEGRAM_API_HASH!,
    { connectionRetries: 3 }
  );
}

/**
 * Parse `channelId_messageId` produced by ingest (`${ch.id}_${msg.id}`).
 * Message id is everything after the last `_` (channel ids may contain `_` in theory).
 */
export function parseMessageExternalId(externalId: string): { channelId: string; messageId: number } | null {
  const i = externalId.lastIndexOf("_");
  if (i <= 0) return null;
  const channelId = externalId.slice(0, i);
  const messageId = Number(externalId.slice(i + 1));
  if (!Number.isFinite(messageId) || messageId <= 0) return null;
  return { channelId, messageId };
}

/**
 * Whether this broadcast channel has a linked discussion supergroup (comments enabled).
 * Pass the same `cache` Map across calls in one run to avoid duplicate GetFullChannel requests.
 */
export async function hasLinkedDiscussion(
  client: TelegramClient,
  channelId: EntityLike,
  cache: Map<string, boolean>
): Promise<boolean> {
  const key = typeof channelId === "string" ? channelId : String(channelId);
  if (cache.has(key)) return cache.get(key)!;
  try {
    const input = await client.getInputEntity(channelId);
    const res = await client.invoke(
      new Api.channels.GetFullChannel({ channel: input as unknown as Api.InputChannel })
    );
    const fullChat = res.fullChat as { linkedChatId?: unknown } | undefined;
    const linked =
      fullChat != null &&
      fullChat.linkedChatId != null &&
      !isZeroLikeId(fullChat.linkedChatId);
    cache.set(key, linked);
    return linked;
  } catch (err) {
    console.warn(`[Telegram] hasLinkedDiscussion failed for ${key}:`, err);
    cache.set(key, false);
    return false;
  }
}

function isZeroLikeId(v: unknown): boolean {
  try {
    return BigInt(String(v)) === 0n;
  } catch {
    return false;
  }
}

/**
 * Text of replies to a channel post (Telegram comments / thread). Uses `messages.getReplies`.
 */
export async function fetchCommentsForPost(
  client: TelegramClient,
  channelId: EntityLike,
  postMsgId: number,
  limit = 200
): Promise<string[]> {
  const messages = await client.getMessages(channelId, { replyTo: postMsgId, limit });
  const texts: string[] = [];
  for (const m of messages) {
    const raw = typeof m.message === "string" ? m.message : "";
    const t = raw.trim();
    if (t) texts.push(t);
  }
  return texts;
}

/** Newest 200 messages per channel only; very active channels may miss older posts in the window. */
export async function fetchSince(
  client: TelegramClient,
  sinceForChannel: (channelId: string) => Date
): Promise<NormalizedMessage[]> {
  const results: NormalizedMessage[] = [];

  for (const ch of CHANNELS) {
    try {
      const entity = await client.getEntity(ch.id);
      const displayName = displayNameFromEntity(entity);

      const messages = await client.getMessages(ch.id, { limit: 200 });
      const msgList = [...messages] as unknown as GramJsMessage[];
      const since = sinceForChannel(ch.id);

      for (const msg of msgList) {
        const msgDate = new Date(msg.date * 1000);
        if (msgDate < since) continue;

        const mediaBuffers = await extractImages(client, msg);
        const audioBuffer = await extractAudio(client, msg);
        const doc = await extractPdfDocument(client, msg);

        results.push({
          externalId: `${ch.id}_${msg.id}`,
          channelId: ch.id,
          channelName: displayName,
          channelType: ch.type,
          sourceLang: ch.lang,
          text: msg.message ?? null,
          mediaBuffers,
          audioBuffer,
          documentBuffer: doc?.buffer ?? null,
          documentFilename: doc?.filename ?? null,
          linkUrls: normalizeLinkUrls(extractLinks(msg)),
          publishedAt: msgDate.toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[Telegram] Failed channel ${ch.id}:`, err);
    }
  }

  return results;
}

async function extractImages(
  client: TelegramClient,
  msg: GramJsMessage
): Promise<Buffer[]> {
  try {
    const hasPhoto =
      Boolean(msg.photo) || Boolean(msg.media && (msg.media as { photo?: unknown }).photo);
    if (!hasPhoto) return [];
    const buf = await client.downloadMedia(msg as never);
    if (!buf) return [];
    return [normalizeDownload(buf)];
  } catch {
    return [];
  }
}

async function extractPdfDocument(
  client: TelegramClient,
  msg: GramJsMessage
): Promise<{ buffer: Buffer; filename: string } | null> {
  try {
    const media = msg.media as { className?: string; document?: GramJsDocument } | undefined;
    if (!media || media.className !== "MessageMediaDocument" || !media.document) return null;
    const doc = media.document;
    if (doc.mimeType !== "application/pdf") return null;

    let filename = "document.pdf";
    for (const attr of doc.attributes ?? []) {
      if (attr.className === "DocumentAttributeFilename" && attr.fileName) {
        filename = attr.fileName;
        break;
      }
    }

    const buf = await client.downloadMedia(msg as never);
    if (!buf) return null;
    return { buffer: normalizeDownload(buf), filename };
  } catch {
    return null;
  }
}

async function extractAudio(
  client: TelegramClient,
  msg: GramJsMessage
): Promise<Buffer | null> {
  try {
    const m = msg.media as { voice?: unknown; audio?: unknown } | undefined;
    const hasAudio =
      Boolean(msg.voice) ||
      Boolean(msg.audio) ||
      Boolean(m?.voice || m?.audio);
    if (!hasAudio) return null;
    const buf = await client.downloadMedia(msg as never);
    return buf ? normalizeDownload(buf) : null;
  } catch {
    return null;
  }
}

function normalizeDownload(data: string | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data);
}

/** Re-fetch a single channel post and download its first photo, if any (for backfill uploads). */
export async function downloadPhotoBufferForMessage(
  client: TelegramClient,
  channelId: string,
  messageId: number
): Promise<Buffer | null> {
  try {
    const messages = await client.getMessages(channelId, { ids: [messageId] });
    const list = [...messages];
    const raw = list[0];
    if (raw == null) return null;
    const msg = raw as unknown as GramJsMessage;
    const bufs = await extractImages(client, msg);
    return bufs[0] ?? null;
  } catch {
    return null;
  }
}

function extractLinks(msg: GramJsMessage): string[] {
  const links: string[] = [];
  const text = msg.message ?? "";
  for (const e of msg.entities ?? []) {
    if (e.className === "MessageEntityTextUrl" && e.url) {
      links.push(e.url);
    }
    if (e.className === "MessageEntityUrl" && e.offset != null && e.length != null) {
      const slice = text.slice(e.offset, e.offset + e.length);
      if (slice) links.push(slice);
    }
  }
  return [...new Set(links)];
}
