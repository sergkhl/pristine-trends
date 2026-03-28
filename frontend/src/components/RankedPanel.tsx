"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { useFeed } from "../hooks/useFeed";
import { FeedCard } from "./FeedCard";

export function RankedPanel() {
  const messages = useFeed("ranked");

  if (messages.length === 0) {
    return (
      <Empty className="my-8 border-border">
        <EmptyHeader>
          <EmptyTitle>No messages yet</EmptyTitle>
          <EmptyDescription>
            Run the pipeline or check Supabase keys.
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
