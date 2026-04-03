"use client";

import { useEffect, useMemo } from "react";
import { applyRankedFiltersToLocation } from "@/lib/rankedLocation";
import { formatMinScoreParam, parseRankedSearchParams } from "@/lib/rankedSearchParams";
import {
  readStoredRankedFilters,
  shouldRestoreRankedUrl,
  writeStoredRankedFilters,
} from "@/lib/rankedFilterStorage";
import { useRankedQueryString } from "@/hooks/useRankedQueryString";
import { useFeed } from "../hooks/useFeed";
import { InfiniteFeedList } from "./InfiniteFeedList";

function lastDaysPhrase(days: number): string {
  if (days === 1) return "the last day";
  return `the last ${days} days`;
}

export function RankedPanel() {
  const spKey = useRankedQueryString();

  const parsed = useMemo(() => parseRankedSearchParams(new URLSearchParams(spKey)), [spKey]);

  useEffect(() => {
    const empty = spKey === "";
    if (
      empty &&
      typeof window !== "undefined" &&
      window.location.search.length > 1
    ) {
      return;
    }
    if (empty) {
      const stored = readStoredRankedFilters();
      if (shouldRestoreRankedUrl(stored)) {
        applyRankedFiltersToLocation(stored);
        return;
      }
    }
    writeStoredRankedFilters(parsed);
  }, [parsed, spKey]);

  const feed = useFeed("ranked", undefined, {
    rangeDays: parsed.rangeDays,
    sort: parsed.sort,
    minScore: parsed.minScore,
  });

  const emptyDescription = useMemo(() => {
    const minLabel = formatMinScoreParam(parsed.minScore);
    return `No messages in ${lastDaysPhrase(parsed.rangeDays)} with score at least ${minLabel}, or run the pipeline and check Supabase keys.`;
  }, [parsed.minScore, parsed.rangeDays]);

  return (
    <InfiniteFeedList
      {...feed}
      emptyTitle="No messages yet"
      emptyDescription={emptyDescription}
    />
  );
}
