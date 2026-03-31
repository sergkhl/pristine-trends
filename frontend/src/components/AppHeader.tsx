"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RankedHeaderToolbar } from "@/components/RankedHeaderToolbar";
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
      <nav
        className="flex w-full flex-row flex-wrap items-center gap-2"
        aria-label="Main"
      >
        <div className="flex min-w-0 flex-row flex-wrap items-center gap-2">
          <Button variant={rankedActive ? "secondary" : "outline"} size="sm" asChild>
            <Link href={rankedHref}>Top scored</Link>
          </Button>
          {CHANNELS.length > 0 ? (
            <Button variant={channelNavActive ? "secondary" : "outline"} size="sm" asChild>
              <Link href={channelNavHref}>By channel</Link>
            </Button>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-row flex-wrap items-center justify-end gap-2">
          <Suspense
            fallback={
              <div
                className="h-7 min-w-[6rem] max-w-full shrink rounded-none bg-muted"
                aria-hidden
              />
            }
          >
            <RankedHeaderToolbar />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
