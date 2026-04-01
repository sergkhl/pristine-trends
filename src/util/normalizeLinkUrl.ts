/**
 * Turn bare hosts (e.g. example.com/path) and protocol-relative URLs into absolute http(s) URLs.
 * Returns null if the string cannot be parsed as a fetchable http(s) URL.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  let candidate = s;
  if (/^\/\//.test(candidate)) {
    candidate = `https:${candidate}`;
  } else if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
    if (/^[a-zA-Z0-9[(]/.test(candidate) && !candidate.includes(" ") && !candidate.startsWith("/")) {
      candidate = `https://${candidate}`;
    }
  }

  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Dedupe while preserving order. Drops entries that do not normalize. */
export function normalizeLinkUrls(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const n = normalizeLinkUrl(raw);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
