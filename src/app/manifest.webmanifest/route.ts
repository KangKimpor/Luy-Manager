/**
 * PWA manifest, served from a route handler so the values stay in TypeScript
 * rather than a separate static JSON file that can drift from the app metadata.
 *
 * `display: standalone` is what makes the installed app drop the browser chrome,
 * which is the difference between the bottom navigation in PRD Section 15 reading
 * as an app bar or as a web page footer.
 */
export function GET() {
  return Response.json(
    {
      // Fixed, so a TWA build's Digital Asset Link keeps matching this manifest
      // even if start_url ever gains query params (e.g. an install-source tag).
      // Without an explicit id, the id defaults to start_url and a later change
      // to start_url would make Android treat it as a different app on update.
      id: "/",
      name: "Luy Manager: Cambodia Personal Finance",
      short_name: "Luy Manager",
      description:
        "Track USD and KHR side by side. Accounts, budgets and spending built for Cambodia.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      // Kept in step with --color-surface-muted and --color-brand in globals.css,
      // and with the themeColor in layout.tsx. These drifted once already when the
      // palette changed: the installed app kept painting its title bar the old
      // indigo while the browser used the new one.
      background_color: "#f9f9ff",
      theme_color: "#3145bb",
      categories: ["finance", "productivity"],
      // Both a scalable "any" icon and PNG rasters: Android's install criteria
      // (and Bubblewrap, which builds the TWA) check for a PNG at 192 and 512,
      // plus a "maskable" purpose icon so the OS can safely apply a circular or
      // squircle mask without clipping the glyph. SVG-only would pass in desktop
      // Chrome but fail Android's installability check silently.
      icons: [
        {
          src: "/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
        },
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
      shortcuts: [
        {
          name: "Add transaction",
          short_name: "Add",
          url: "/add",
        },
      ],
    },
    {
      headers: { "Content-Type": "application/manifest+json" },
    },
  );
}