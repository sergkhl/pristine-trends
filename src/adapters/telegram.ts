import { TelegramClient, sessions } from "telegram";
import type { EntityLike } from "telegram/define.js";
import { CHANNELS, type ChannelSourceType } from "../config/channels.js";

type GramJsMessage = Record<string, unknown> & {
  id: number;
  date: number;
  message?: string;
  entities?: Array<{ className?: string; url?: string; offset?: number; length?: number }>;
  photo?: unknown;
  voice?: unknown;
  audio?: unknown;
  media?: { photo?: unknown; voice?: unknown; audio?: unknown };
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

        results.push({
          externalId: `${ch.id}_${msg.id}`,
          channelId: ch.id,
          channelName: displayName,
          channelType: ch.type,
          sourceLang: ch.lang,
          text: msg.message ?? null,
          mediaBuffers,
          audioBuffer,
          linkUrls: extractLinks(msg),
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
