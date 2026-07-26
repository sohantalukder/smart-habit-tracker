import type { Metadata, Viewport } from "next";
import { Manrope, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import "./bloom.css";
import { Toaster } from "@/components/ui/sonner";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000",
  ),
  title: { default: "Bloom — Build a life that keeps its word", template: "%s · Bloom" },
  description: "Turn good intentions into repeatable daily systems with private habits, thoughtful check-ins, reminders, and progress you can trust.",
  openGraph: {
    title: "Bloom — Build a life that keeps its word",
    description: "A disciplined, private habit practice built for real life.",
    images: [{ url: "/og-editorial.png", width: 1200, height: 630, alt: "Bloom — Build a life that keeps its word" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bloom — Build a life that keeps its word",
    description: "A disciplined, private habit practice built for real life.",
    images: ["/og-editorial.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f3efe4",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${newsreader.variable} ${manrope.variable}`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
