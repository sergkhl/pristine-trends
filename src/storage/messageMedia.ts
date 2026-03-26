import type { SupabaseClient } from "@supabase/supabase-js";

export const MESSAGE_MEDIA_BUCKET = "message-media";

export function messageMediaStoragePath(channelId: string, externalId: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9.@_-]/g, "_");
  return `${safe(channelId)}/${safe(externalId)}.jpg`;
}

export async function uploadMessageImage(
  supabase: SupabaseClient,
  channelId: string,
  externalId: string,
  buffer: Buffer
): Promise<string | null> {
  const path = messageMediaStoragePath(channelId, externalId);
  const { error } = await supabase.storage
    .from(MESSAGE_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.warn("[pipeline] message media upload failed:", path, error.message);
    return null;
  }
  return supabase.storage.from(MESSAGE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
