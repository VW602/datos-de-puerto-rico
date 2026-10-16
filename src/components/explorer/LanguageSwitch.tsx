import type { MouseEvent } from "react";
import { useLocale } from "@/i18n/context";
import { LOCALES, LOCALE_INFO, type Locale } from "@/i18n/locale";
import { EXPLORER_MESSAGES } from "@/i18n/messages/explorer";
import { localeHref, type AppSearch } from "@/lib/locale-url";

/**
 * ES | EN. Two ordinary links to the same view in each language (the current
 * one marked), so it works with a keyboard, a screen reader, a middle click
 * or no JavaScript at all. Each name is spoken in its own language. No flags:
 * a language is not a country.
 */
export function LanguageSwitch({
  state = {},
  onNavigate,
}: {
  state?: AppSearch;
  onNavigate?: (href: string) => void;
}) {
  const locale = useLocale();
  const go = (target: Locale) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    event.preventDefault();
    if (target !== locale) onNavigate(`${localeHref(target, state)}${window.location.hash}`);
  };
  return (
    <nav aria-label={EXPLORER_MESSAGES[locale].language.nav}>
      <ul className="flex items-center text-[15px]">
        {LOCALES.map((target, index) => {
          const info = LOCALE_INFO[target];
          const current = target === locale;
          return (
            <li key={target} className="flex items-center">
              {index > 0 && (
                <span aria-hidden="true" className="px-0.5 text-divider">
                  |
                </span>
              )}
              <a
                href={localeHref(target, state)}
                hrefLang={info.htmlLang}
                lang={info.htmlLang}
                aria-current={current ? "page" : undefined}
                onClick={go(target)}
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-[3px] px-1.5 no-underline ${current ? "font-bold text-fg" : "font-semibold text-accent hover:bg-track"}`}
              >
                <span aria-hidden="true">{info.short}</span>
                <span className="sr-only">{info.name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
