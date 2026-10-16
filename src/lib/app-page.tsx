import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PuertoRicoApp } from "@/components/explorer/PuertoRicoApp";
import { LocaleProvider } from "@/i18n/context";
import { LOCALE_INFO, type Locale } from "@/i18n/locale";
import type { AppSearch } from "./locale-url";

/**
 * One language's page. State from the query (a language switch) seeds the
 * explorer once; then the address goes back to the clean page URL, so a later
 * reload does not bring back a selection the reader has since changed.
 */
export function AppPage({ locale, search }: { locale: Locale; search: AppSearch }) {
  const navigate = useNavigate();
  const seeded = Object.keys(search).length > 0;
  useEffect(() => {
    if (!seeded) return;
    void navigate({ href: `${LOCALE_INFO[locale].base}${window.location.hash}`, replace: true });
  }, [seeded, locale, navigate]);
  return (
    <LocaleProvider locale={locale}>
      <PuertoRicoApp
        initial={search}
        onSwitchLocale={(href) => {
          void navigate({ href });
        }}
      />
    </LocaleProvider>
  );
}
