import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Company",
  description: "Private internal AI development company building WorkPilot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
