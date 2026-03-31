export const RANKED_RANGE_KEYS = ["1d", "3d", "7d", "15d", "30d"] as const;
export type RankedRangeKey = (typeof RANKED_RANGE_KEYS)[number];

export const RANKED_RANGE_DAYS: Record<RankedRangeKey, number> = {
  "1d": 1,
  "3d": 3,
  "7d": 7,
  "15d": 15,
  "30d": 30,
};

export type RankedSortKey = "date" | "score";

/** Arguments passed from the ranked page into `useFeed("ranked", …)`. */
export type RankedFeedOptions = {
  rangeDays: number;
  sort: RankedSortKey;
  minScore: number;
};

export const DEFAULT_RANKED_RANGE: RankedRangeKey = "7d";
export const DEFAULT_RANKED_SORT: RankedSortKey = "date";
export const DEFAULT_RANKED_MIN_SCORE = 4;

export const RANKED_MIN_SCORE_MIN = 1;
export const RANKED_MIN_SCORE_MAX = 10;
export const RANKED_MIN_SCORE_STEP = 1;

function isRankedRangeKey(v: string): v is RankedRangeKey {
  return (RANKED_RANGE_KEYS as readonly string[]).includes(v);
}

function isRankedSortKey(v: string): v is RankedSortKey {
  return v === "date" || v === "score";
}

function clampMinScore(n: number): number {
  const s = RANKED_MIN_SCORE_STEP;
  const rounded = Math.round(n / s) * s;
  return Math.min(RANKED_MIN_SCORE_MAX, Math.max(RANKED_MIN_SCORE_MIN, rounded));
}

export type ParsedRankedSearchParams = {
  rangeKey: RankedRangeKey;
  sort: RankedSortKey;
  minScore: number;
  rangeDays: number;
};

export function parseRankedSearchParams(
  searchParams: URLSearchParams | null | undefined
): ParsedRankedSearchParams {
  const rangeRaw = searchParams?.get("range") ?? "";
  const sortRaw = searchParams?.get("sort") ?? "";
  const minRaw = searchParams?.get("min") ?? "";

  const rangeKey = isRankedRangeKey(rangeRaw) ? rangeRaw : DEFAULT_RANKED_RANGE;
  const sort = isRankedSortKey(sortRaw) ? sortRaw : DEFAULT_RANKED_SORT;

  let minScore = DEFAULT_RANKED_MIN_SCORE;
  if (minRaw !== "") {
    const parsed = Number(minRaw);
    if (Number.isFinite(parsed)) {
      minScore = clampMinScore(parsed);
    }
  }

  return {
    rangeKey,
    sort,
    minScore,
    rangeDays: RANKED_RANGE_DAYS[rangeKey],
  };
}

export function formatMinScoreParam(minScore: number): string {
  const clamped = clampMinScore(minScore);
  if (Number.isInteger(clamped)) return String(clamped);
  return clamped.toFixed(1);
}

export function buildRankedSearchParamsString(p: {
  rangeKey: RankedRangeKey;
  sort: RankedSortKey;
  minScore: number;
}): string {
  const params = new URLSearchParams();
  params.set("range", p.rangeKey);
  params.set("sort", p.sort);
  params.set("min", formatMinScoreParam(p.minScore));
  return params.toString();
}
