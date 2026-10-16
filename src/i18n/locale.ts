/**
 * The two interface languages. The URL is the only source of truth: Spanish
 * at the root (/), English under /en/. No cookie, no storage, no browser
 * language or location detection, no redirect between them.
 */
export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

export const LOCALE_INFO: Record<
  Locale,
  {
    /** <html lang> and hreflang. */
    htmlLang: string;
    /** Intl locale for dates and numbers. */
    intl: string;
    /** og:locale. */
    ogLocale: string;
    /** Path prefix of this language's pages. */
    base: "/" | "/en/";
    /** Visible selector text and its spoken name, in the language itself. */
    short: string;
    name: string;
  }
> = {
  es: {
    htmlLang: "es-PR",
    intl: "es-PR",
    ogLocale: "es_PR",
    base: "/",
    short: "ES",
    name: "Español",
  },
  en: {
    htmlLang: "en",
    intl: "en-US",
    ogLocale: "en_US",
    base: "/en/",
    short: "EN",
    name: "English",
  },
};

/** "/en" or anything under "/en/" is English (lowercase only); everything else is Spanish. */
export function localeFromPath(pathname: string): Locale {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "es";
}
