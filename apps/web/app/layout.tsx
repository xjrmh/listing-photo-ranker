import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Listing Photo Ranker",
  description: "Rank listing photos with predicted view types, async scoring, and feedback capture."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

