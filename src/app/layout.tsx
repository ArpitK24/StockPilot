import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { TimezoneSync } from "@/components/timezone-sync";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "StockPilot", template: "%s · StockPilot" },
  description: "Inventory and order management for small businesses.",
};

export const viewport: Viewport = { themeColor: "#0D0D0C" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="min-h-dvh">
        <ToastProvider>
          <TimezoneSync />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
