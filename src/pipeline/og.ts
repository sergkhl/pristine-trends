import { isPipelineDebug } from "../util/pipelineDebug.js";

export type OgPreview = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

function dlog(msg: string, detail?: Record<string, unknown>): void {
  if (!isPipelineDebug()) return;
  const tail = detail ? ` ${JSON.stringify(detail)}` : "";
  console.debug(`[OG] ${msg}${tail}`);
}

export async function scrapeOG(url: string): Promise<OgPreview | null> {
  const t0 = performance.now();
  dlog("fetch.start", { url });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const html = await res.text();
    dlog("fetch.response", {
      ms: Math.round(performance.now() - t0),
      status: res.status,
      htmlChars: html.length,
      finalUrl: res.url,
    });
    const get = (prop: string) =>
      html.match(
        new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)`, "i")
      )?.[1] ?? null;
    const preview: OgPreview = {
      title: get("title"),
      description: get("description"),
      image: get("image"),
      siteName: get("site_name"),
    };
    dlog("fetch.parsed", {
      hasTitle: Boolean(preview.title),
      hasDescription: Boolean(preview.description),
      hasImage: Boolean(preview.image),
      hasSiteName: Boolean(preview.siteName),
      titleLen: preview.title?.length ?? 0,
    });
    return preview;
  } catch (err) {
    dlog("fetch.error", {
      ms: Math.round(performance.now() - t0),
      url,
      name: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
