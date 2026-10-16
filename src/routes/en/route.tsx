import { createFileRoute, Outlet } from "@tanstack/react-router";
import { NotFoundPage } from "@/lib/not-found";
import { SITE_MESSAGES } from "@/i18n/messages/site";

/** Everything under /en/ is English, including its 404 page. */
export const Route = createFileRoute("/en")({
  head: () => ({ meta: [{ title: SITE_MESSAGES.en.title }] }),
  notFoundComponent: NotFoundPage,
  component: Outlet,
});
