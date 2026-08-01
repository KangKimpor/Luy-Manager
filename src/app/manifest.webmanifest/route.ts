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
      name: "Luy Manager — Cambodia Personal Finance",
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
      icons: [
        {
          src: "/icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
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
