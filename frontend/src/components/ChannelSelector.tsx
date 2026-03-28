import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  type ChannelConfig,
  fallbackInitialsFromChannelType,
} from "../config/channels";
import type { ChannelDirectoryRow } from "../hooks/useChannelDirectory";

export function ChannelSelector({
  channels,
  directory,
  active,
}: {
  channels: ChannelConfig[];
  directory: Record<string, ChannelDirectoryRow>;
  active: string;
}) {
  return (
    <div className="flex flex-row flex-wrap gap-2" role="tablist" aria-label="Channels">
      {channels.map((ch) => {
        const row = directory[ch.id];
        const label = row?.display_name_en ?? row?.display_name ?? ch.id;
        const isActive = ch.id === active;
        return (
          <Button
            key={ch.id}
            variant={isActive ? "secondary" : "outline"}
            size="sm"
            className="h-auto rounded-full py-1.5 pr-3 pl-2"
            asChild
          >
            <Link
              href={`/channel/${ch.id}/`}
              role="tab"
              aria-selected={isActive}
              className="inline-flex items-center gap-2"
            >
              <Avatar size="sm" className="size-6">
                {row?.avatar_url ? (
                  <AvatarImage src={row.avatar_url} alt="" />
                ) : null}
                <AvatarFallback className="text-[0.65rem] font-semibold">
                  {fallbackInitialsFromChannelType(ch.type)}
                </AvatarFallback>
              </Avatar>
              <span className="max-w-48 truncate">{label}</span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}
