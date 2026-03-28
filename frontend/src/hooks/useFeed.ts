import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { ChannelSourceType } from "../config/channels";
import { decodeChannelRouteParam } from "../lib/channelRouteParam";
import { formatSupabaseQueryError, getSupabase } from "../lib/supabase";

export const FEED_PAGE_SIZE = 30;

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

function mergeChannels(row: MessageRow, prev: MessageRow[]): MessageRow {
  const avatarUrl =
    row.channels?.avatar_url ??
    prev.find((m) => m.channel_id === row.channel_id)?.channels?.avatar_url ??
    null;
  const prevCh = prev.find((m) => m.channel_id === row.channel_id)?.channels;
  return {
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
}

/** Keyset for `order by published_at desc, id desc` (ranked + channel feeds). */
function publishedAtIdKeysetOr(publishedAt: string, id: string): string {
  const t = `"${publishedAt.replace(/"/g, '\\"')}"`;
  const i = `"${id.replace(/"/g, '\\"')}"`;
  return `published_at.lt.${t},and(published_at.eq.${t},id.lt.${i})`;
}

function comparePublishedAtIdDesc(a: MessageRow, b: MessageRow): number {
  const t = b.published_at.localeCompare(a.published_at);
  if (t !== 0) return t;
  return b.id.localeCompare(a.id);
}

function dedupeAppend(existing: MessageRow[], incoming: MessageRow[]): MessageRow[] {
  const seen = new Set(existing.map((m) => m.id));
  const out = [...existing];
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export type UseFeedResult = {
  messages: MessageRow[];
  isInitialLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  error: string | null;
  fetchNextPage: () => void;
};

export function useFeed(panel: "ranked" | "channel", channelId?: string): UseFeedResult {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const skip = panel === "channel" && !channelId;
  const resolvedChannelId =
    panel === "channel" && channelId ? decodeChannelRouteParam(channelId) : channelId;

  const fetchingMoreRef = useRef(false);
  const messagesRef = useRef<MessageRow[]>([]);
  const hasMoreRef = useRef(true);
  const ctxRef = useRef({
    panel: panel as "ranked" | "channel",
    resolvedChannelId: resolvedChannelId as string | undefined,
    skip,
  });

  useEffect(() => {
    messagesRef.current = messages;
    hasMoreRef.current = hasMore;
    ctxRef.current = { panel, resolvedChannelId, skip };
  }, [messages, hasMore, panel, resolvedChannelId, skip]);

  const fetchNextPage = useCallback(() => {
    const { panel: p, resolvedChannelId: chId, skip: sk } = ctxRef.current;
    if (sk || !hasMoreRef.current || fetchingMoreRef.current) return;
    const list = messagesRef.current;
    if (list.length === 0) return;

    const last = list[list.length - 1];
    const supabase = getSupabase();
    fetchingMoreRef.current = true;
    setIsFetchingMore(true);

    let query = supabase
      .from("messages")
      .select("*, channels(avatar_url, display_name, display_name_en, channel_type)")
      .limit(FEED_PAGE_SIZE);

    if (p === "ranked") {
      query = query
        .gt("quality_score", 4)
        .or(publishedAtIdKeysetOr(last.published_at, last.id))
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });
    } else {
      query = query
        .eq("channel_id", chId!)
        .or(publishedAtIdKeysetOr(last.published_at, last.id))
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });
    }

    void query.then(({ data, error: qErr }) => {
      fetchingMoreRef.current = false;
      setIsFetchingMore(false);
      if (qErr) {
        console.error("[useFeed] fetchNextPage", formatSupabaseQueryError(qErr));
        return;
      }
      const rows = (data as MessageRow[]) ?? [];
      setMessages((prev) => dedupeAppend(prev, rows));
      if (rows.length < FEED_PAGE_SIZE) {
        setHasMore(false);
        hasMoreRef.current = false;
      }
    });
  }, []);

  useEffect(() => {
    if (skip) return;

    let cancelled = false;
    const supabase = getSupabase();
    const channelFilterId = panel === "channel" ? resolvedChannelId! : null;

    startTransition(() => {
      setMessages([]);
      setIsInitialLoading(true);
      setIsFetchingMore(false);
      setHasMore(true);
      hasMoreRef.current = true;
      setError(null);
      fetchingMoreRef.current = false;
    });

    let query = supabase
      .from("messages")
      .select("*, channels(avatar_url, display_name, display_name_en, channel_type)")
      .limit(FEED_PAGE_SIZE);

    if (panel === "ranked") {
      query = query
        .gt("quality_score", 4)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });
    } else {
      query = query
        .eq("channel_id", channelFilterId!)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });
    }

    void query.then(({ data, error: qErr }) => {
      if (cancelled) return;
      setIsInitialLoading(false);
      if (qErr) {
        console.error("[useFeed]", formatSupabaseQueryError(qErr));
        setError(formatSupabaseQueryError(qErr));
        setMessages([]);
        setHasMore(false);
        hasMoreRef.current = false;
        return;
      }
      const rows = (data as MessageRow[]) ?? [];
      setMessages(rows);
      if (rows.length < FEED_PAGE_SIZE) {
        setHasMore(false);
        hasMoreRef.current = false;
      }
    });

    const sub = supabase
      .channel(`feed-${panel}-${panel === "ranked" ? "ranked" : channelFilterId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (p) => {
          const row = p.new as MessageRow;
          if (panel === "channel" && row.channel_id !== channelFilterId) return;
          if (panel === "ranked") {
            const qs = row.quality_score;
            if (qs == null || qs <= 4) return;
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const merged = mergeChannels(row, prev);
            if (panel === "ranked") {
              return [...prev, merged].sort(comparePublishedAtIdDesc);
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
  }, [panel, channelId, skip, resolvedChannelId]);

  if (skip) {
    return {
      messages: [],
      isInitialLoading: false,
      isFetchingMore: false,
      hasMore: false,
      error: null,
      fetchNextPage: () => {},
    };
  }

  return {
    messages,
    isInitialLoading,
    isFetchingMore,
    hasMore,
    error,
    fetchNextPage,
  };
}
