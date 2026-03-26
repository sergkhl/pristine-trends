"use client";

import { CHANNELS } from "@/config/channels";
import { useChannelDirectory } from "@/hooks/useChannelDirectory";
import { ChannelPanel } from "@/components/ChannelPanel";
import { ChannelSelector } from "@/components/ChannelSelector";

export function ChannelPageClient({ channelId }: { channelId: string }) {
  const directory = useChannelDirectory();

  return (
    <>
      <ChannelSelector channels={CHANNELS} directory={directory} active={channelId} />
      <ChannelPanel channelId={channelId} />
    </>
  );
}
