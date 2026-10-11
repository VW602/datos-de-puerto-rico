import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { NotFoundPage } from "@/lib/not-found";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import appCss from "../styles.css?url";

// No og:image yet: a share image is pending release work, not invented here.
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_NAME },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "theme-color", content: "#F6F3EC" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "es_PR" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: SITE_NAME },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:url", content: SITE_URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "canonical", href: SITE_URL },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  notFoundComponent: NotFoundPage,
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
