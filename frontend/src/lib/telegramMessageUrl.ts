/**
 * Build a t.me link to the original post. `external_id` is stored as `${channel_id}_${messageId}` by the pipeline.
 */
export function telegramMessageUrl(channelId: string, externalId: string): string | null {
  const prefix = `${channelId}_`;
  if (!externalId.startsWith(prefix)) return null;
  const messageId = externalId.slice(prefix.length);
  if (!/^\d+$/.test(messageId)) return null;

  if (channelId.startsWith("@")) {
    const username = channelId.slice(1);
    if (!username) return null;
    return `https://t.me/${encodeURIComponent(username)}/${messageId}`;
  }

  const cMatch = /^-100(\d+)$/.exec(channelId);
  if (cMatch) {
    return `https://t.me/c/${cMatch[1]}/${messageId}`;
  }

  return null;
}

/** Deep-link into the discussion thread for a channel post (`?comment=1` opens the first comment). */
export function telegramDiscussionUrl(channelId: string, externalId: string): string | null {
  const base = telegramMessageUrl(channelId, externalId);
  return base ? `${base}?comment=1` : null;
}
