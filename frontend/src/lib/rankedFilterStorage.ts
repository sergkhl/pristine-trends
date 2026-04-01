import {
  clampMinScore,
  DEFAULT_RANKED_MIN_SCORE,
  DEFAULT_RANKED_RANGE,
  DEFAULT_RANKED_SORT,
  RANKED_RANGE_KEYS,
  type ParsedRankedSearchParams,
  type RankedRangeKey,
  type RankedSortKey,
} from "@/lib/rankedSearchParams";

const STORAGE_KEY = "pristine-trends:ranked-filters";

export type StoredRankedFilters = {
  rangeKey: RankedRangeKey;
  sort: RankedSortKey;
  minScore: number;
};

function isRankedRangeKey(v: unknown): v is RankedRangeKey {
  return typeof v === "string" && (RANKED_RANGE_KEYS as readonly string[]).includes(v);
}

function isRankedSortKey(v: unknown): v is RankedSortKey {
  return v === "date" || v === "score";
}

function isValidMinScore(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function readStoredRankedFilters(): StoredRankedFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (!isRankedRangeKey(o.rangeKey) || !isRankedSortKey(o.sort) || !isValidMinScore(o.minScore)) {
      return null;
    }
    return {
      rangeKey: o.rangeKey,
      sort: o.sort,
      minScore: clampMinScore(o.minScore),
    };
  } catch {
    return null;
  }
}

export function writeStoredRankedFilters(p: ParsedRankedSearchParams | StoredRankedFilters): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredRankedFilters = {
      rangeKey: p.rangeKey,
      sort: p.sort,
      minScore: p.minScore,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // private mode / quota
  }
}

const DEFAULT_FILTERS: StoredRankedFilters = {
  rangeKey: DEFAULT_RANKED_RANGE,
  sort: DEFAULT_RANKED_SORT,
  minScore: DEFAULT_RANKED_MIN_SCORE,
};

export function storedRankedFiltersEqual(a: StoredRankedFilters, b: StoredRankedFilters): boolean {
  return a.rangeKey === b.rangeKey && a.sort === b.sort && a.minScore === b.minScore;
}

export function shouldRestoreRankedUrl(stored: StoredRankedFilters | null): stored is StoredRankedFilters {
  if (!stored) return false;
  return !storedRankedFiltersEqual(stored, DEFAULT_FILTERS);
}
