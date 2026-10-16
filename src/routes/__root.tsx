import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { LocaleProvider } from "@/i18n/context";
import { LOCALE_INFO, localeFromPath } from "@/i18n/locale";
import { NotFoundPage } from "@/lib/not-found";
import { SITE_NAME } from "@/lib/site";
import appCss from "../styles.css?url";

// No og:image yet: a share image is pending release work, not invented here.
// Each language's page adds its own title, description, canonical and
// alternates (src/lib/app-page.tsx); these are shared by every page.
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_NAME },
      { name: "theme-color", content: "#F6F3EC" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  notFoundComponent: NotFoundPage,
  component: RootDocument,
});

/** The language comes from the URL alone, the same on the server and in the browser. */
function RootDocument() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const locale = localeFromPath(pathname);
  return (
    <html lang={LOCALE_INFO[locale].htmlLang} className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <LocaleProvider locale={locale}>
          <Outlet />
        </LocaleProvider>
        <Scripts />
      </body>
    </html>
  );
}
