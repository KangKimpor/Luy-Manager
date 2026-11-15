import type { Metadata, Viewport } from "next";
import { ViewTransition } from "react";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { BottomNav } from "@/components/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { SiteHeader } from "@/components/site-header";
import { Sidebar } from "@/components/sidebar";
import { appearanceThemeAttribute, readAppearance } from "@/lib/appearance";
import { APP_COLORS } from "@/lib/theme";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
});

/**
 * Khmer fallback, loaded for essentially one character.
 *
 * Every KHR figure in this app ends in ៛ (U+17DB, KHMER SIGN RIEL), and Inter's
 * latin subset does not contain it. Without a font that does, the glyph falls
 * through to whatever the operating system happens to provide: Android and iOS
 * ship Khmer faces so it usually renders, but on desktop Linux and many Windows
 * installs it renders as a tofu box. Verified by rendering the built app in a
 * container with no Khmer font, where every riel amount came out as "6,000□".
 *
 * Ship a 1.1 KB, one-glyph subset of the same variable font rather than downloading
 * the whole Khmer block for a single currency sign. Inter remains unchanged.
 */
const khmer = localFont({
  src: "./fonts/riel-sign.woff2",
  variable: "--font-khmer",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luy Manager: Cambodia Personal Finance",
  description:
    "Track USD and KHR side by side. Accounts, budgets and spending built for Cambodia.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Luy Manager" },
  icons: {
    // Falls back to /favicon.ico automatically; this adds the sizes iOS and
    // desktop bookmark bars actually ask for.
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: APP_COLORS.background },
    { media: "(prefers-color-scheme: dark)", color: APP_COLORS.backgroundDark },
  ],
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appearance = await readAppearance();
  const dataTheme = appearanceThemeAttribute(appearance);

  return (
    <html
      lang="en"
      data-theme={dataTheme}
      className={`${inter.variable} ${khmer.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-full">
        {/* Lets keyboard users jump the nav. */}
        <a
          href="#main"
          className="bg-brand focus:top-2 focus:left-2 sr-only rounded-md px-3 py-2 text-on-action focus:not-sr-only focus:absolute focus:z-50"
        >
          Skip to content
        </a>

        <Sidebar />

        {/*
          Top and bottom paddings in .app-main clear the floating phone bar,
          floating dock and safe areas while keeping desktop Mac-like.
        */}
        <main id="main" className="app-main min-w-0">
          <SiteHeader />

          {/*
            Only navigations started from a link fade. A refresh, a server action
            or the back button carries no "nav" type and so swaps in place: the
            ledger re-rendering after a save must not blink the whole screen.
          */}
          <ViewTransition default={{ nav: "page", default: "none" }}>
            <div className="mx-auto max-w-[1120px]">{children}</div>
          </ViewTransition>
        </main>

        <BottomNav />
        <ServiceWorkerRegistration />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
