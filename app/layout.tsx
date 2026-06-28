import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BattleTech RPG Helper",
  description:
    "Web port of the BattleTech Character Creator — cloud save, GM oversight, mobile-friendly.",
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
