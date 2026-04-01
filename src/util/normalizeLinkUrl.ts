/**
 * Telegram may mark plain text like "agent.md" as MessageEntityUrl. Without an http(s) scheme,
 * those are not fetchable web URLs — skip them instead of prepending https:// (which would
 * produce a bogus hostname).
 */
const FILE_LIKE_EXTENSIONS = new Set([
  "bat", "bmp", "c", "cc", "cfg", "cpp", "cs", "css", "csv", "cxx", "diff", "doc", "docx", "env",
  "gif", "go", "gz", "h", "htm", "html", "ico", "ini", "java", "jpeg", "jpg", "js", "jsx", "json",
  "kt", "less", "lock", "log", "md", "mjs", "patch", "pdf", "php", "png", "ps1", "py", "rb", "rs",
  "sass", "scss", "sh", "sql", "svg", "swift", "tar", "toml", "ts", "tsx", "txt", "vue", "wasm",
  "webp", "xls", "xlsx", "xml", "yaml", "yml", "zip",
]);

function looksLikeBareFilenameWithoutHttpScheme(s: string): boolean {
  if (/^https?:\/\//i.test(s)) return false;
  if (/^\/\//.test(s)) return false;
  const pathPart = s.split(/[?#]/)[0];
  if (pathPart.includes("/")) return false;
  const segments = pathPart.split(".");
  if (segments.length !== 2 || !segments[0] || !segments[1]) return false;
  return FILE_LIKE_EXTENSIONS.has(segments[1].toLowerCase());
}

/**
 * Turn bare hosts (e.g. example.com/path) and protocol-relative URLs into absolute http(s) URLs.
 * Returns null if the string cannot be parsed as a fetchable http(s) URL.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (looksLikeBareFilenameWithoutHttpScheme(s)) return null;

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
