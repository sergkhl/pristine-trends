import Link from "next/link";
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
    <div className="channel-selector" role="tablist" aria-label="Channels">
      {channels.map((ch) => {
        const row = directory[ch.id];
        const label = row?.display_name ?? ch.id;
        return (
          <Link
            key={ch.id}
            href={`/channel/${ch.id}/`}
            role="tab"
            aria-selected={ch.id === active}
            className={`channel-selector__btn ${ch.id === active ? "active" : ""}`}
          >
            {row?.avatar_url ? (
              <img
                src={row.avatar_url}
                alt=""
                width={24}
                height={24}
                className="channel-selector__avatar"
                decoding="async"
              />
            ) : (
              <span className="channel-selector__fallback" title={ch.type}>
                {fallbackInitialsFromChannelType(ch.type)}
              </span>
            )}
            <span className="channel-selector__label">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
