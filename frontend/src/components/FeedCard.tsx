"use client";

import { useState } from "react";
import { fallbackInitialsFromChannelType } from "../config/channels";
import type { MessageRow } from "../hooks/useFeed";
import { telegramMessageUrl } from "../lib/telegramMessageUrl";
import { formatRelative } from "../util/formatRelative";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { ScorePill } from "./ScorePill";

type CardLang = "original" | "english";

function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    const full = `${u.hostname}${u.pathname}${u.search}`;
    return full.length > 88 ? `${full.slice(0, 85)}…` : full;
  } catch {
    return url.length > 88 ? `${url.slice(0, 85)}…` : url;
  }
}

export function FeedCard({ msg }: { msg: MessageRow }) {
  const [lang, setLang] = useState<CardLang>("english");
  const avatar = msg.channels?.avatar_url;
  const type = msg.channel_type;
  const telegramHref = telegramMessageUrl(msg.channel_id, msg.external_id);
  const telegramTitle = msg.channel_name ?? msg.channels?.display_name ?? null;

  const channelTitle =
    lang === "english"
      ? (msg.channels?.display_name_en ?? telegramTitle)
      : telegramTitle;
  const showNameSubtext = Boolean(channelTitle && channelTitle !== msg.channel_id);

  const bodyText =
    lang === "english"
      ? (msg.translated_text ?? msg.original_text ?? "—")
      : (msg.original_text ?? msg.translated_text ?? "—");

  const links = msg.link_urls ?? [];
  const firstLink = links[0];
  const hasPreview = Boolean(msg.link_preview);
  const plainLinks = hasPreview ? links.slice(1) : links;

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

      <p className="feed-card__body">{bodyText}</p>

      {msg.media_urls?.[0] ? (
        <figure className="feed-card__media">
          <img
            src={msg.media_urls[0]}
            alt=""
            loading="lazy"
            decoding="async"
          />
          {msg.image_caption ? (
            <figcaption className="media-caption">{msg.image_caption}</figcaption>
          ) : null}
        </figure>
      ) : msg.image_caption ? (
        <p className="media-caption">{msg.image_caption}</p>
      ) : null}

      {hasPreview && firstLink ? (
        <LinkPreviewCard preview={msg.link_preview} href={firstLink} />
      ) : null}
      {plainLinks.length > 0 ? (
        <ul className="feed-card__links" aria-label="Attached links">
          {plainLinks.map((url) => (
            <li key={url}>
              <a
                className="feed-card__link"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {linkLabel(url)}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {msg.audio_transcript ? (
        <blockquote className="audio-transcript">{msg.audio_transcript}</blockquote>
      ) : null}

      <footer className="feed-card__footer">
        <button
          type="button"
          className={`feed-card__lang-switch ${lang === "english" ? "is-english" : ""}`}
          aria-pressed={lang === "english"}
          aria-label={lang === "english" ? "Show Original" : "Show English"}
          onClick={() => setLang((l) => (l === "english" ? "original" : "english"))}
        >
          {lang === "english" ? "Show Original" : "Show English"}
        </button>
      </footer>
    </article>
  );
}
