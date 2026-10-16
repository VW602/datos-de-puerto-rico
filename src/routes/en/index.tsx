import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/lib/app-page";
import { pageHead, validateAppSearch } from "@/lib/locale-url";

/** English, at /en/. Same data, same live routes, same page as Spanish. */
export const Route = createFileRoute("/en/")({
  validateSearch: validateAppSearch,
  head: () => pageHead("en"),
  component: EnglishPage,
});

function EnglishPage() {
  return <AppPage locale="en" search={Route.useSearch()} />;
}
