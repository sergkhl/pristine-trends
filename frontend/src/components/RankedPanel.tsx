"use client";

import { useFeed } from "../hooks/useFeed";
import { FeedCard } from "./FeedCard";

export function RankedPanel() {
  const messages = useFeed("ranked");

  if (messages.length === 0) {
    return <p className="panel-empty">No messages yet. Run the pipeline or check Supabase keys.</p>;
  }

  return (
    <div className="feed-list">
      {messages.map((msg) => (
        <FeedCard key={msg.id} msg={msg} />
      ))}
    </div>
  );
}
