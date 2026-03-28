"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
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
    <header className="mb-6 flex flex-col gap-4 border-b border-border pb-4">
      <h1 className="font-heading text-base font-semibold tracking-tight text-foreground">
        pristine-trends
      </h1>
      <nav className="flex flex-row flex-wrap gap-2" aria-label="Main">
        <Button variant={rankedActive ? "secondary" : "outline"} size="sm" asChild>
          <Link href={rankedHref}>Top scored</Link>
        </Button>
        {CHANNELS.length > 0 ? (
          <Button variant={channelNavActive ? "secondary" : "outline"} size="sm" asChild>
            <Link href={channelNavHref}>By channel</Link>
          </Button>
        ) : null}
      </nav>
    </header>
  );
}
