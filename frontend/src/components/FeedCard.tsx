"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  const hasSummary = Boolean(msg.link_summary?.trim());
  const showLinkCard = Boolean(firstLink && (hasPreview || hasSummary));
  const plainLinks = showLinkCard ? links.slice(1) : links;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b border-border pb-4">
        <Avatar className="size-8">
          {avatar ? <AvatarImage src={avatar} alt="" /> : null}
          <AvatarFallback className="text-[0.7rem] font-bold">
            {fallbackInitialsFromChannelType(type)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="text-sm font-bold">{msg.channel_id}</span>
          {showNameSubtext ? (
            <span className="text-muted-foreground text-xs">{channelTitle}</span>
          ) : null}
        </div>
        <ScorePill score={msg.quality_score} status={msg.quality_status} />
        <div className="ml-auto flex flex-row flex-wrap items-center justify-end gap-2 text-muted-foreground text-xs">
          <time>{formatRelative(msg.published_at)}</time>
          {telegramHref ? (
            <a
              className="text-primary font-medium whitespace-nowrap underline-offset-4 hover:underline"
              href={telegramHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Telegram
            </a>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {msg.quality_status === "low_quality" ? (
          <Alert variant="destructive">
            <WarningCircle />
            <AlertTitle>Low quality</AlertTitle>
            <AlertDescription>{msg.quality_reason}</AlertDescription>
          </Alert>
        ) : null}

        <p className="m-0 whitespace-pre-wrap text-xs leading-relaxed">{bodyText}</p>

        {msg.media_urls?.[0] ? (
          <figure className="m-0">
            <img
              src={msg.media_urls[0]}
              alt=""
              loading="lazy"
              decoding="async"
              className="block max-h-[min(70vh,32rem)] max-w-full rounded-none bg-muted"
            />
            {msg.image_caption ? (
              <figcaption className="mt-3 text-muted-foreground text-xs italic">
                {msg.image_caption}
              </figcaption>
            ) : null}
          </figure>
        ) : msg.image_caption ? (
          <p className="m-0 text-muted-foreground text-xs italic">{msg.image_caption}</p>
        ) : null}

        {showLinkCard && firstLink ? (
          <LinkPreviewCard
            preview={hasPreview ? msg.link_preview : null}
            href={firstLink}
            summary={msg.link_summary}
          />
        ) : null}
        {plainLinks.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Attached links">
            {plainLinks.map((url) => (
              <li key={url}>
                <a
                  className="text-primary text-xs font-medium break-all underline-offset-4 hover:underline"
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

        {msg.comment_summary?.trim() ? (
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs">
            <p className="m-0 mb-1 font-semibold text-muted-foreground">Discussion</p>
            <p className="m-0 leading-relaxed">{msg.comment_summary}</p>
            {typeof msg.comment_count === "number" && msg.comment_count > 0 ? (
              <p className="m-0 mt-1 text-muted-foreground">
                From {msg.comment_count} comments
              </p>
            ) : null}
          </div>
        ) : null}

        {msg.audio_transcript ? (
          <blockquote className="m-0 border-primary border-l-[3px] bg-muted px-3 py-2 text-xs">
            {msg.audio_transcript}
          </blockquote>
        ) : null}
      </CardContent>

      <CardFooter className="justify-end">
        <ToggleGroup
          type="single"
          value={lang}
          onValueChange={(v) => {
            if (v === "english" || v === "original") setLang(v);
          }}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Message language"
        >
          <ToggleGroupItem value="english">English</ToggleGroupItem>
          <ToggleGroupItem value="original">Original</ToggleGroupItem>
        </ToggleGroup>
      </CardFooter>
    </Card>
  );
}
