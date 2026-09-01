import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BattleTech RPG Helper",
  description:
    "Web port of the BattleTech Character Creator — cloud save, GM oversight, mobile-friendly.",
};

// <link rel="manifest"> is injected automatically because app/manifest.ts exists.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
