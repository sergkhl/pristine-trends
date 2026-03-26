"use client";

import { useFeed } from "../hooks/useFeed";
import { FeedCard } from "./FeedCard";

export function ChannelPanel({ channelId }: { channelId: string }) {
  const messages = useFeed("channel", channelId);

  if (messages.length === 0) {
    return <p className="panel-empty">No messages for this channel in the last fetch window.</p>;
  }

  return (
    <div className="feed-list">
      {messages.map((msg) => (
        <FeedCard key={msg.id} msg={msg} />
      ))}
    </div>
  );
}
