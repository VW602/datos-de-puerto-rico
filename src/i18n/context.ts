import { createContext, createElement, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locale.ts";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once per page from the URL (see routes/__root.tsx). Outside it, Spanish. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return createElement(LocaleContext.Provider, { value: locale }, children);
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
