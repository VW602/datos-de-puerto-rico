import { createFileRoute } from "@tanstack/react-router";
import { AppPage } from "@/lib/app-page";
import { pageHead, validateAppSearch } from "@/lib/locale-url";

/** Spanish, the default language, at the root. */
export const Route = createFileRoute("/")({
  validateSearch: validateAppSearch,
  head: () => pageHead("es"),
  component: SpanishPage,
});

function SpanishPage() {
  return <AppPage locale="es" search={Route.useSearch()} />;
}
