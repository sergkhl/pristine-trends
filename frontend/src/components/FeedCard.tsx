import { fallbackInitialsFromChannelType } from "../config/channels";
import type { MessageRow } from "../hooks/useFeed";
import { telegramMessageUrl } from "../lib/telegramMessageUrl";
import { formatRelative } from "../util/formatRelative";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { ScorePill } from "./ScorePill";

export function FeedCard({ msg }: { msg: MessageRow }) {
  const avatar = msg.channels?.avatar_url;
  const type = msg.channel_type;
  const telegramHref = telegramMessageUrl(msg.channel_id, msg.external_id);
  const channelTitle = msg.channel_name ?? msg.channels?.display_name ?? null;
  const showNameSubtext = Boolean(channelTitle && channelTitle !== msg.channel_id);

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
        <div className="feed-card__channel">
          <span className="feed-card__channel-id">{msg.channel_id}</span>
          {showNameSubtext ? (
            <span className="feed-card__channel-name">{channelTitle}</span>
          ) : null}
        </div>
        <ScorePill score={msg.quality_score} status={msg.quality_status} />
        <div className="feed-card__meta">
          <time className="feed-card__time">{formatRelative(msg.published_at)}</time>
          {telegramHref ? (
            <a
              className="feed-card__telegram"
              href={telegramHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Telegram
            </a>
          ) : null}
        </div>
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
