"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHANNELS } from "@/config/channels";

export function AppHeader() {
  const pathname = usePathname();
  const normalized = pathname?.replace(/\/$/, "") ?? "";
  const rankedHref = "/ranked/";
  const firstChannelId = CHANNELS[0]?.id;
  const channelNavHref = firstChannelId ? `/channel/${firstChannelId}/` : "/ranked/";

  const rankedActive =
    normalized === "/ranked" || normalized === "" || normalized === "/";
  const channelNavActive = normalized.startsWith("/channel/");

  return (
    <header className="app__header">
      <h1 className="app__title">pristine-trends</h1>
      <nav className="app__nav" aria-label="Main">
        <Link href={rankedHref} className={rankedActive ? "active" : ""}>
          Top scored
        </Link>
        {CHANNELS.length > 0 ? (
          <Link href={channelNavHref} className={channelNavActive ? "active" : ""}>
            By channel
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
