"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ChannelSourceType } from "@/config/channels";
import { formatSupabaseQueryError, getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export type ChannelDirectoryRow = {
  display_name: string | null;
  avatar_url: string | null;
  channel_type: ChannelSourceType | null;
};

const ChannelDirectoryContext = createContext<Record<string, ChannelDirectoryRow> | undefined>(
  undefined
);

function preloadAvatarUrls(byId: Record<string, ChannelDirectoryRow>) {
  for (const row of Object.values(byId)) {
    const u = row.avatar_url;
    if (!u) continue;
    const img = new Image();
    img.src = u;
  }
}

export function ChannelDirectoryProvider({ children }: { children: ReactNode }) {
  const [byId, setById] = useState<Record<string, ChannelDirectoryRow>>({});

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = getSupabase();
    void supabase
      .from("channels")
      .select("channel_id, display_name, avatar_url, channel_type")
      .then(({ data, error }) => {
        if (error) {
          console.error("[ChannelDirectoryProvider]", formatSupabaseQueryError(error));
          return;
        }
        const m: Record<string, ChannelDirectoryRow> = {};
        for (const r of data ?? []) {
          const row = r as {
            channel_id: string;
            display_name: string | null;
            avatar_url: string | null;
            channel_type: string | null;
          };
          m[row.channel_id] = {
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            channel_type: row.channel_type as ChannelSourceType | null,
          };
        }
        setById(m);
      });
  }, []);

  useEffect(() => {
    preloadAvatarUrls(byId);
  }, [byId]);

  return (
    <ChannelDirectoryContext.Provider value={byId}>{children}</ChannelDirectoryContext.Provider>
  );
}

export function useChannelDirectory(): Record<string, ChannelDirectoryRow> {
  const ctx = useContext(ChannelDirectoryContext);
  if (ctx === undefined) {
    throw new Error("useChannelDirectory must be used within ChannelDirectoryProvider");
  }
  return ctx;
}
