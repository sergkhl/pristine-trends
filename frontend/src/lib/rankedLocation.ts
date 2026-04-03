import { bumpRankedQueryString } from "@/hooks/useRankedQueryString";
import {
  formatMinScoreParam,
  type RankedRangeKey,
  type RankedSortKey,
} from "@/lib/rankedSearchParams";

export type RankedLocationFilters = {
  rangeKey: RankedRangeKey;
  sort: RankedSortKey;
  minScore: number;
};

/**
 * Updates the browser URL for ranked filters. Required for `output: "export"` where
 * `router.replace()` does not reliably change `window.location` for same-route query updates.
 * Preserves other query keys and pathname/basePath/hash.
 */
export function applyRankedFiltersToLocation(next: RankedLocationFilters): void {
  if (typeof window === "undefined") return;

  const u = new URL(window.location.href);
  u.searchParams.set("range", next.rangeKey);
  u.searchParams.set("sort", next.sort);
  u.searchParams.set("min", formatMinScoreParam(next.minScore));

  const nextUrl = u.pathname + u.search + u.hash;

  window.history.replaceState(window.history.state, "", nextUrl);
  bumpRankedQueryString();
}
