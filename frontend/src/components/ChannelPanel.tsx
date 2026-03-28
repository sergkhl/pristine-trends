"use client";

import { useFeed } from "../hooks/useFeed";
import { InfiniteFeedList } from "./InfiniteFeedList";

export function ChannelPanel({ channelId }: { channelId: string }) {
  const feed = useFeed("channel", channelId);

  return (
    <InfiniteFeedList
      {...feed}
      emptyTitle="No messages"
      emptyDescription="No messages for this channel in the last fetch window."
    />
  );
}
