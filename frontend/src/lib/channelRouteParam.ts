/**
 * Path segments for Telegram-style ids (`@handle`) are often encoded as `%40handle`.
 * If that string is passed through encoding again, Supabase sends `eq.%2540handle`,
 * which matches nothing against DB rows where `channel_id` is `@handle`.
 */
export function decodeChannelRouteParam(segment: string): string {
  let s = segment.replace(/\+/g, " ");
  for (let i = 0; i < 8; i++) {
    try {
      const next = decodeURIComponent(s);
      if (next === s) return s;
      s = next;
    } catch {
      return s;
    }
  }
  return s;
}
