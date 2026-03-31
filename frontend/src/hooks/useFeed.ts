import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type { ChannelSourceType } from "../config/channels";
import { decodeChannelRouteParam } from "../lib/channelRouteParam";
import type { RankedFeedOptions, RankedSortKey } from "../lib/rankedSearchParams";
import {
  DEFAULT_RANKED_MIN_SCORE,
  DEFAULT_RANKED_RANGE,
  DEFAULT_RANKED_SORT,
  RANKED_RANGE_DAYS,
} from "../lib/rankedSearchParams";
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

/** Keyset for `order by quality_score desc, published_at desc, id desc`. */
function scorePublishedAtIdKeysetOr(score: number, publishedAt: string, id: string): string {
  const s = score.toFixed(2);
  const t = `"${publishedAt.replace(/"/g, '\\"')}"`;
  const i = `"${id.replace(/"/g, '\\"')}"`;
  return `quality_score.lt.${s},and(quality_score.eq.${s},published_at.lt.${t}),and(quality_score.eq.${s},published_at.eq.${t},id.lt.${i})`;
}

function comparePublishedAtIdDesc(a: MessageRow, b: MessageRow): number {
  const t = b.published_at.localeCompare(a.published_at);
  if (t !== 0) return t;
  return b.id.localeCompare(a.id);
}

function compareScorePublishedAtIdDesc(a: MessageRow, b: MessageRow): number {
  const as = a.quality_score ?? -Infinity;
  const bs = b.quality_score ?? -Infinity;
  if (as !== bs) return bs - as;
  return comparePublishedAtIdDesc(a, b);
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

const DEFAULT_RANKED_FEED: RankedFeedOptions = {
  rangeDays: RANKED_RANGE_DAYS[DEFAULT_RANKED_RANGE],
  sort: DEFAULT_RANKED_SORT,
  minScore: DEFAULT_RANKED_MIN_SCORE,
};

export type UseFeedResult = {
  messages: MessageRow[];
  isInitialLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  error: string | null;
  fetchNextPage: () => void;
};

type CtxRef = {
  panel: "ranked" | "channel";
  resolvedChannelId: string | undefined;
  skip: boolean;
  rankedSort: RankedSortKey;
  rankedMinScore: number;
};

export function useFeed(panel: "ranked", channelId: undefined, rankedOptions: RankedFeedOptions): UseFeedResult;
export function useFeed(panel: "channel", channelId?: string, rankedOptions?: never): UseFeedResult;
export function useFeed(
  panel: "ranked" | "channel",
  channelId?: string,
  rankedOptions?: RankedFeedOptions
): UseFeedResult {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const skip = panel === "channel" && !channelId;
  const resolvedChannelId =
    panel === "channel" && channelId ? decodeChannelRouteParam(channelId) : channelId;

  const ranked: RankedFeedOptions =
    panel === "ranked" ? (rankedOptions ?? DEFAULT_RANKED_FEED) : DEFAULT_RANKED_FEED;

  const fetchingMoreRef = useRef(false);
  const messagesRef = useRef<MessageRow[]>([]);
  const hasMoreRef = useRef(true);
  const cutoffIsoRef = useRef<string>("");
  const ctxRef = useRef<CtxRef>({
    panel: panel as "ranked" | "channel",
    resolvedChannelId: resolvedChannelId as string | undefined,
    skip,
    rankedSort: ranked.sort,
    rankedMinScore: ranked.minScore,
  });

  useEffect(() => {
    messagesRef.current = messages;
    hasMoreRef.current = hasMore;
    ctxRef.current = {
      panel,
      resolvedChannelId,
      skip,
      rankedSort: ranked.sort,
      rankedMinScore: ranked.minScore,
    };
  }, [messages, hasMore, panel, resolvedChannelId, skip, ranked.sort, ranked.minScore]);

  const fetchNextPage = useCallback(() => {
    const { panel: p, resolvedChannelId: chId, skip: sk, rankedSort, rankedMinScore } =
      ctxRef.current;
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
      const cutoff = cutoffIsoRef.current;
      query = query
        .gte("published_at", cutoff)
        .not("quality_score", "is", null)
        .gte("quality_score", rankedMinScore);

      const qs = last.quality_score;
      if (rankedSort === "score") {
        if (qs == null) {
          fetchingMoreRef.current = false;
          setIsFetchingMore(false);
          return;
        }
        query = query
          .or(scorePublishedAtIdKeysetOr(qs, last.published_at, last.id))
          .order("quality_score", { ascending: false })
          .order("published_at", { ascending: false })
          .order("id", { ascending: false });
      } else {
        query = query
          .or(publishedAtIdKeysetOr(last.published_at, last.id))
          .order("published_at", { ascending: false })
          .order("id", { ascending: false });
      }
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

    const cutoffIso = new Date(Date.now() - ranked.rangeDays * 86_400_000).toISOString();
    cutoffIsoRef.current = cutoffIso;

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
        .gte("published_at", cutoffIso)
        .not("quality_score", "is", null)
        .gte("quality_score", ranked.minScore);

      if (ranked.sort === "score") {
        query = query
          .order("quality_score", { ascending: false })
          .order("published_at", { ascending: false })
          .order("id", { ascending: false });
      } else {
        query = query.order("published_at", { ascending: false }).order("id", { ascending: false });
      }
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

    const subKey =
      panel === "ranked"
        ? `feed-ranked-${ranked.rangeDays}-${ranked.sort}-${ranked.minScore}`
        : `feed-channel-${channelFilterId}`;

    const sub = supabase
      .channel(subKey)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as MessageRow;
          if (panel === "channel" && row.channel_id !== channelFilterId) return;
          if (panel === "ranked") {
            const qs = row.quality_score;
            if (qs == null || qs < ranked.minScore) return;
            if (row.published_at < cutoffIso) return;
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const merged = mergeChannels(row, prev);
            if (panel === "ranked") {
              const cmp =
                ranked.sort === "score" ? compareScorePublishedAtIdDesc : comparePublishedAtIdDesc;
              return [...prev, merged].sort(cmp);
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
  }, [panel, channelId, skip, resolvedChannelId, ranked.rangeDays, ranked.sort, ranked.minScore]);

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
