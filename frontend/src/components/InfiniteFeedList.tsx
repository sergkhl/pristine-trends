"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { MessageRow } from "../hooks/useFeed";
import { FeedCard } from "./FeedCard";

const INITIAL_SKELETON_COUNT = 4;

function FeedCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b border-border pb-4">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex min-w-0 flex-col gap-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="ml-auto h-6 w-10" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </CardContent>
    </Card>
  );
}

export type InfiniteFeedListProps = {
  messages: MessageRow[];
  isInitialLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  error: string | null;
  fetchNextPage: () => void;
  emptyTitle: string;
  emptyDescription: string;
};

export function InfiniteFeedList({
  messages,
  isInitialLoading,
  isFetchingMore,
  hasMore,
  error,
  fetchNextPage,
  emptyTitle,
  emptyDescription,
}: InfiniteFeedListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || isInitialLoading) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting || !hasMore || isFetchingMore) return;
        fetchNextPage();
      },
      { root: null, threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [
    hasMore,
    isInitialLoading,
    isFetchingMore,
    fetchNextPage,
    messages.length,
  ]);

  if (isInitialLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: INITIAL_SKELETON_COUNT }, (_, i) => (
          <FeedCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <Alert variant="destructive" className="my-8">
        <WarningCircle />
        <AlertTitle>Could not load feed</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (messages.length === 0) {
    return (
      <Empty className="my-8 border-border">
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg) => (
        <FeedCard key={msg.id} msg={msg} />
      ))}
      {hasMore ? <div ref={sentinelRef} className="h-4 w-full shrink-0" aria-hidden /> : null}
      {isFetchingMore ? (
        <div className="flex flex-col gap-3 py-2" aria-busy aria-label="Loading more">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}
    </div>
  );
}
