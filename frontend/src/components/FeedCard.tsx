import { fallbackInitialsFromChannelType } from "../config/channels";
import type { MessageRow } from "../hooks/useFeed";
import { formatRelative } from "../util/formatRelative";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { ScorePill } from "./ScorePill";

export function FeedCard({ msg }: { msg: MessageRow }) {
  const avatar = msg.channels?.avatar_url;
  const type = msg.channel_type;

  return (
    <article className="feed-card">
      <header className="feed-card__header">
        {avatar ? (
          <img
            className="channel-avatar"
            src={avatar}
            alt=""
            width={32}
            height={32}
            decoding="async"
          />
        ) : (
          <span className="channel-avatar-fallback" title={type}>
            {fallbackInitialsFromChannelType(type)}
          </span>
        )}
        <span className="channel-badge">{msg.channel_name ?? msg.channel_id}</span>
        <ScorePill score={msg.quality_score} status={msg.quality_status} />
        <time className="feed-card__time">{formatRelative(msg.published_at)}</time>
      </header>

      {msg.quality_status === "low_quality" && (
        <div className="warning-banner">Low quality · {msg.quality_reason}</div>
      )}

      <p className="feed-card__body">{msg.translated_text ?? msg.original_text ?? "—"}</p>

      {msg.image_caption ? <p className="media-caption">{msg.image_caption}</p> : null}
      {msg.audio_transcript ? (
        <blockquote className="audio-transcript">{msg.audio_transcript}</blockquote>
      ) : null}
      {msg.link_preview ? (
        <LinkPreviewCard preview={msg.link_preview} href={msg.link_urls?.[0] ?? null} />
      ) : null}
    </article>
  );
}
