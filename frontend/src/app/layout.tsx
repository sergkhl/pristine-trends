import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { ChannelDirectoryProvider } from "@/components/ChannelDirectoryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "pristine-trends",
  description: "Telegram channel feed",
  icons: [{ url: "/favicon.svg", type: "image/svg+xml" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ChannelDirectoryProvider>
          <div className="app">
            <AppHeader />
            <main className="app__main">{children}</main>
          </div>
        </ChannelDirectoryProvider>
      </body>
    </html>
  );
}
