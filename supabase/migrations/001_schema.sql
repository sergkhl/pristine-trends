-- channels (labels + avatars + source type for UI fallbacks)
-- ingest_cursor_published_at: per-channel high-water mark for Telegram fetch (recovery after failed runs)
create table channels (
  channel_id    text primary key,
  display_name  text,
  channel_type  text not null check (channel_type in ('public', 'private', 'group')),
  avatar_url    text,
  ingest_cursor_published_at timestamptz,
  updated_at    timestamptz not null default now()
);

alter table channels enable row level security;
create policy "public read channels" on channels for select using (true);

-- optional: bucket via SQL (or create "channel-avatars" in Dashboard and mark public)
insert into storage.buckets (id, name, public)
values ('channel-avatars', 'channel-avatars', true)
on conflict (id) do update set public = excluded.public;

create policy "public read channel-avatars"
on storage.objects for select
using (bucket_id = 'channel-avatars');

-- messages
create table messages (
  id               uuid primary key default gen_random_uuid(),
  external_id      text unique not null,
  channel_id       text not null references channels (channel_id),
  channel_name     text,
  channel_type     text not null check (channel_type in ('public', 'private', 'group')),
  original_text    text,
  translated_text  text,
  quality_score    numeric(4,2),
  quality_reason   text,
  quality_status   text default 'ok',
  audio_transcript text,
  image_caption    text,
  link_preview     jsonb,
  media_urls       text[] default '{}',
  link_urls        text[] default '{}',
  published_at     timestamptz not null,
  created_at       timestamptz default now()
);

create index messages_published_at_desc on messages (published_at desc);
create index messages_channel_published_desc on messages (channel_id, published_at desc);
create index messages_quality_score_desc on messages (quality_score desc);

alter table messages enable row level security;
create policy "public read messages" on messages for select using (true);

alter publication supabase_realtime add table messages;
