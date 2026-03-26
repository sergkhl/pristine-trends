import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Readable message for PostgREST / network errors (plain `console.error(err)` often prints `{}`). */
export function formatSupabaseQueryError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const parts = [e.message, e.code, e.details, e.hint].filter(Boolean);
    if (parts.length) return parts.join(" | ");
  }
  return error instanceof Error ? error.message : JSON.stringify(error);
}

export function isSupabaseConfigured(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  return Boolean(url && key);
}

/**
 * Lazily create the client so static export / SSG never runs createClient at import time.
 * Throws if env is missing (hooks call from useEffect only).
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim();
  cached = createClient(url, publishableKey);
  return cached;
}
