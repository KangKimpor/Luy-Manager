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
      name: "Riel — Cambodia Personal Finance",
      short_name: "Riel",
      description:
        "Track USD and KHR side by side. Accounts, budgets and spending built for Cambodia.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#f5f6f8",
      theme_color: "#4c5fd5",
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
