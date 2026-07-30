import { Outfit, IBM_Plex_Mono } from "next/font/google";
import type { Metadata } from "next";
import "./builder.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-hq-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-hq-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Company — Your AI Employees",
  description: "CEO headquarters for managing AI Employees. Internal WorkPilot builder surface.",
};

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ai-hq ${outfit.variable} ${plexMono.variable}`}>
      {children}
    </div>
  );
}
