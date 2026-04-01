"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildRankedSearchParamsString,
  formatMinScoreParam,
  parseRankedSearchParams,
} from "@/lib/rankedSearchParams";
import {
  readStoredRankedFilters,
  shouldRestoreRankedUrl,
  writeStoredRankedFilters,
} from "@/lib/rankedFilterStorage";
import { useFeed } from "../hooks/useFeed";
import { InfiniteFeedList } from "./InfiniteFeedList";

function lastDaysPhrase(days: number): string {
  if (days === 1) return "the last day";
  return `the last ${days} days`;
}

export function RankedPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const spKey = searchParams.toString();

  const parsed = useMemo(() => parseRankedSearchParams(new URLSearchParams(spKey)), [spKey]);

  useEffect(() => {
    const empty = spKey === "";
    if (empty) {
      const stored = readStoredRankedFilters();
      if (shouldRestoreRankedUrl(stored)) {
        const qs = buildRankedSearchParamsString(stored);
        const path = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
        router.replace(`${path}/?${qs}`, { scroll: false });
        return;
      }
    }
    writeStoredRankedFilters(parsed);
  }, [parsed, pathname, router, spKey]);

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
