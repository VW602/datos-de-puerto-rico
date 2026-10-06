import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

const TITLE = "Puerto Rico · 78 municipios";
const DESCRIPTION =
  "Escoge un municipio y conoce sus datos. Cifras públicas del Censo, NHTSA y los CDC, con su fuente al lado.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "theme-color", content: "#F6F3EC" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "es_PR" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        // Two families, five styles: Newsreader 500/600 (headings, large values) and
        // Source Sans 3 400/600/700 plus 400 italic (text, tables, map labels).
        // display=swap shows the fallback at once; Google serves only the subsets a page uses.
        href: "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="es" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
