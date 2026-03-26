import { CHANNELS } from "@/config/channels";
import { ChannelPageClient } from "@/components/ChannelPageClient";
import { decodeChannelRouteParam } from "@/lib/channelRouteParam";

export const dynamicParams = false;

export function generateStaticParams() {
  return CHANNELS.map((c) => ({ channelId: c.id }));
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId: raw } = await params;
  const channelId = decodeChannelRouteParam(raw);
  return <ChannelPageClient channelId={channelId} />;
}
