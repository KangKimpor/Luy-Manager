import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { BottomNav } from "@/components/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/service-worker";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Luy Manager — Cambodia Personal Finance",
  description:
    "Track USD and KHR side by side. Accounts, budgets and spending built for Cambodia.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Luy Manager" },
};

export const viewport: Viewport = {
  themeColor: "#4c5fd5",
  width: "device-width",
  initialScale: 1,
  // Not locking maximumScale: preventing pinch-zoom fails WCAG 1.4.4, and a
  // finance app is exactly the kind of thing people zoom into to check a figure.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="font-sans min-h-full">
        {/* Lets keyboard users jump the nav. */}
        <a
          href="#main"
          className="bg-brand focus:top-2 focus:left-2 sr-only rounded-md px-3 py-2 text-white focus:not-sr-only focus:absolute focus:z-50"
        >
          Skip to content
        </a>

        {/*
          Bottom padding clears the fixed nav (4.5rem) plus the centre action
          that sits above it, so the last row of content is never trapped
          underneath.
        */}
        <main id="main" className="mx-auto max-w-lg px-4 pt-6 pb-28">
          {children}
        </main>

        <BottomNav />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
