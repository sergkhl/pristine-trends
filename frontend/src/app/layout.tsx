import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { ChannelDirectoryProvider } from "@/components/ChannelDirectoryProvider";
import "./globals.css";
import { JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
  title: "pristine-trends",
  description: "Telegram channel feed",
  icons: [{ url: "/favicon.svg", type: "image/svg+xml" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-mono", jetbrainsMono.variable)}>
      <body>
        <ChannelDirectoryProvider>
          <div className="app flex flex-col">
            <AppHeader />
            <main className="flex min-h-0 flex-1 flex-col gap-4">{children}</main>
          </div>
        </ChannelDirectoryProvider>
      </body>
    </html>
  );
}
