import type { NextConfig } from "next";
import path from "path";

/** Next.js basePath must not include a trailing slash. */
function normalizeBasePath(raw: string | undefined): string {
  if (!raw || raw === "/") return "";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: normalizeBasePath(process.env.BASE_PATH),
  images: { unoptimized: true },
  /** Monorepo root (config lives in `frontend/`; avoid import.meta in config — breaks Next 16 compile). */
  outputFileTracingRoot: path.join(process.cwd(), ".."),
};

export default nextConfig;
