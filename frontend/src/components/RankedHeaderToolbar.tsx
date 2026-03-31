"use client";

import { useCallback, useMemo } from "react";
import { Clock, SortDescending, Star } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildRankedSearchParamsString,
  formatMinScoreParam,
  parseRankedSearchParams,
  RANKED_MIN_SCORE_MAX,
  RANKED_MIN_SCORE_MIN,
  RANKED_RANGE_KEYS,
  type ParsedRankedSearchParams,
  type RankedRangeKey,
  type RankedSortKey,
} from "@/lib/rankedSearchParams";

function replaceRankedQuery(
  pathname: string,
  router: ReturnType<typeof useRouter>,
  next: { rangeKey: RankedRangeKey; sort: RankedSortKey; minScore: number }
) {
  const qs = buildRankedSearchParamsString(next);
  const path = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  router.replace(`${path}/?${qs}`, { scroll: false });
}

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
  pathname: string;
};

function RankedHeaderToolbarControls({ parsed, pathname }: RankedHeaderToolbarControlsProps) {
  const router = useRouter();

  const pushParams = useCallback(
    (partial: Partial<{ rangeKey: RankedRangeKey; sort: RankedSortKey; minScore: number }>) => {
      const next = {
        rangeKey: partial.rangeKey ?? parsed.rangeKey,
        sort: partial.sort ?? parsed.sort,
        minScore: partial.minScore ?? parsed.minScore,
      };
      replaceRankedQuery(pathname, router, next);
    },
    [pathname, router, parsed.rangeKey, parsed.sort, parsed.minScore]
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
          aria-label="Minimum quality score"
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

function RankedHeaderToolbarSynced({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  const spKey = searchParams.toString();
  const parsed = useMemo(() => parseRankedSearchParams(new URLSearchParams(spKey)), [spKey]);

  return <RankedHeaderToolbarControls parsed={parsed} pathname={pathname} />;
}

/** Ranked URL filters; only renders on ranked (and home) routes. Use inside Suspense. */
export function RankedHeaderToolbar() {
  const pathname = usePathname();
  if (!isRankedRoute(pathname)) return null;
  return <RankedHeaderToolbarSynced pathname={pathname} />;
}
