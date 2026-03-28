"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useFeed } from "../hooks/useFeed";
import { FeedCard } from "./FeedCard";

export function ChannelPanel({ channelId }: { channelId: string }) {
  const messages = useFeed("channel", channelId);

  if (messages.length === 0) {
    return (
      <Empty className="my-8 border-border">
        <EmptyHeader>
          <EmptyTitle>No messages</EmptyTitle>
          <EmptyDescription>
            No messages for this channel in the last fetch window.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg) => (
        <FeedCard key={msg.id} msg={msg} />
      ))}
    </div>
  );
}
