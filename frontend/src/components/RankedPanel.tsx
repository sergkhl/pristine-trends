"use client";

import { useFeed } from "../hooks/useFeed";
import { InfiniteFeedList } from "./InfiniteFeedList";

export function RankedPanel() {
  const feed = useFeed("ranked");

  return (
    <InfiniteFeedList
      {...feed}
      emptyTitle="No messages yet"
      emptyDescription="No messages scored above 4, or run the pipeline and check Supabase keys."
    />
  );
}
