"use client";

import { useCallback, useMemo } from "react";
import { Clock, SortDescending, Star } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useRankedQueryString } from "@/hooks/useRankedQueryString";
import { applyRankedFiltersToLocation } from "@/lib/rankedLocation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatMinScoreParam,
  parseRankedSearchParams,
  RANKED_MIN_SCORE_MAX,
  RANKED_MIN_SCORE_MIN,
  RANKED_RANGE_KEYS,
  type ParsedRankedSearchParams,
  type RankedRangeKey,
  type RankedSortKey,
} from "@/lib/rankedSearchParams";

function isRankedRoute(pathname: string | null): boolean {
  const normalized = pathname?.replace(/\/$/, "") ?? "";
  return normalized === "/ranked" || normalized === "" || normalized === "/";
}

const MIN_SCORE_VALUES = Array.from(
  { length: RANKED_MIN_SCORE_MAX - RANKED_MIN_SCORE_MIN + 1 },
  (_, i) => RANKED_MIN_SCORE_MIN + i
);

type RankedHeaderToolbarControlsProps = {
  parsed: ParsedRankedSearchParams;
};

function RankedHeaderToolbarControls({ parsed }: RankedHeaderToolbarControlsProps) {
  const pushParams = useCallback(
    (partial: Partial<{ rangeKey: RankedRangeKey; sort: RankedSortKey; minScore: number }>) => {
      const next = {
        rangeKey: partial.rangeKey ?? parsed.rangeKey,
        sort: partial.sort ?? parsed.sort,
        minScore: partial.minScore ?? parsed.minScore,
      };
      applyRankedFiltersToLocation(next);
    },
    [parsed.rangeKey, parsed.sort, parsed.minScore]
  );

  return (
    <div className="flex flex-row flex-wrap items-center justify-end gap-2">
      <Select
        value={parsed.rangeKey}
        onValueChange={(v) => {
          if (v) pushParams({ rangeKey: v as RankedRangeKey });
        }}
      >
        <SelectTrigger
          size="sm"
          className="min-w-0 border-border"
          aria-label="Date range"
        >
          <Clock />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {RANKED_RANGE_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={parsed.sort}
        onValueChange={(v) => {
          if (v) pushParams({ sort: v as RankedSortKey });
        }}
      >
        <SelectTrigger
          size="sm"
          className="min-w-0 border-border"
          aria-label="Sort order"
        >
          <SortDescending />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectItem value="date">Newest</SelectItem>
            <SelectItem value="score">Score</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <Select
        value={String(parsed.minScore)}
        onValueChange={(v) => {
          const n = Number(v);
          if (Number.isFinite(n)) pushParams({ minScore: n });
        }}
      >
        <SelectTrigger
          size="sm"
          className="min-w-0 border-border"
          aria-label="Minimum global score"
        >
          <Star />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            {MIN_SCORE_VALUES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {formatMinScoreParam(n)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function RankedHeaderToolbarSynced() {
  const spKey = useRankedQueryString();
  const parsed = useMemo(() => parseRankedSearchParams(new URLSearchParams(spKey)), [spKey]);

  return <RankedHeaderToolbarControls parsed={parsed} />;
}

/** Ranked URL filters; only renders on ranked (and home) routes. Use inside Suspense. */
export function RankedHeaderToolbar() {
  const pathname = usePathname();
  if (!isRankedRoute(pathname)) return null;
  return <RankedHeaderToolbarSynced />;
}
