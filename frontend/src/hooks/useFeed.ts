import { useEffect, useState } from "react";
import type { ChannelSourceType } from "../config/channels";
import { decodeChannelRouteParam } from "../lib/channelRouteParam";
import { formatSupabaseQueryError, getSupabase } from "../lib/supabase";

export type MessageRow = {
  id: string;
  external_id: string;
  channel_id: string;
  channel_name: string | null;
  channel_type: ChannelSourceType;
  original_text: string | null;
  translated_text: string | null;
  quality_score: number | null;
  quality_reason: string | null;
  quality_status: string | null;
  audio_transcript: string | null;
  image_caption: string | null;
  link_preview: Record<string, string | null> | null;
  media_urls: string[] | null;
  link_urls: string[] | null;
  published_at: string;
  channels: {
    avatar_url: string | null;
    display_name: string | null;
    display_name_en: string | null;
    channel_type: ChannelSourceType | null;
  } | null;
};

export function useFeed(panel: "ranked" | "channel", channelId?: string) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const skip = panel === "channel" && !channelId;

  useEffect(() => {
    if (skip) return;

    const resolvedChannelId =
      panel === "channel" && channelId ? decodeChannelRouteParam(channelId) : channelId;

    let cancelled = false;
    const supabase = getSupabase();

    let query = supabase
      .from("messages")
      .select("*, channels(avatar_url, display_name, display_name_en, channel_type)")
      .limit(100);

    if (panel === "ranked") {
      query = query.order("quality_score", { ascending: false, nullsFirst: false });
    } else {
      query = query
        .eq("channel_id", resolvedChannelId!)
        .order("published_at", { ascending: false });
    }

    void query.then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("[useFeed]", formatSupabaseQueryError(error));
        return;
      }
      setMessages((data as MessageRow[]) ?? []);
    });

    const sub = supabase
      .channel("feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (p) => {
          const row = p.new as MessageRow;
          if (panel === "channel" && row.channel_id !== resolvedChannelId) return;

          setMessages((prev) => {
            const avatarUrl =
              row.channels?.avatar_url ??
              prev.find((m) => m.channel_id === row.channel_id)?.channels?.avatar_url ??
              null;
            const prevCh = prev.find((m) => m.channel_id === row.channel_id)?.channels;
            const merged: MessageRow = {
              ...row,
              channels: {
                avatar_url: avatarUrl,
                display_name: row.channels?.display_name ?? prevCh?.display_name ?? null,
                display_name_en:
                  row.channels?.display_name_en ?? prevCh?.display_name_en ?? null,
                channel_type:
                  row.channels?.channel_type ?? prevCh?.channel_type ?? row.channel_type,
              },
            };
            if (panel === "ranked") {
              return [...prev, merged].sort(
                (a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0)
              );
            }
            return [merged, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void sub.unsubscribe();
    };
  }, [panel, channelId, skip]);

  return skip ? [] : messages;
}
