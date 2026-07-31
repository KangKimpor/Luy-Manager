import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Khmer } from "next/font/google";

import { BottomNav } from "@/components/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
 * A currency symbol turning into a box on a currency app is not a cosmetic
 * problem, so the glyph is shipped rather than hoped for. The khmer subset is a
 * few kilobytes and only loads the block that covers it.
 */
const khmer = Noto_Sans_Khmer({
  variable: "--font-khmer",
  subsets: ["khmer"],
});

export const metadata: Metadata = {
  title: "Luy Manager — Cambodia Personal Finance",
  description:
    "Track USD and KHR side by side. Accounts, budgets and spending built for Cambodia.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Luy Manager" },
};

export const viewport: Viewport = {
  themeColor: "#3145bb",
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
    <html
      lang="en"
      className={`${inter.variable} ${khmer.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-full">
        {/* Lets keyboard users jump the nav. */}
        <a
          href="#main"
          className="bg-brand focus:top-2 focus:left-2 sr-only rounded-md px-3 py-2 text-white focus:not-sr-only focus:absolute focus:z-50"
        >
          Skip to content
        </a>

        <SiteHeader />

        {/*
          Top padding clears the fixed app bar plus the notch; bottom padding
          clears the nav (4.5rem) plus the centre action that sits above it, so
          neither the first nor the last row of content is ever trapped under
          fixed chrome.
        */}
        <main
          id="main"
          className="mx-auto max-w-lg px-4 pb-28"
          style={{
            paddingTop: "calc(var(--spacing-appbar) + env(safe-area-inset-top, 0px) + 1rem)",
          }}
        >
          {children}
        </main>

        <BottomNav />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
