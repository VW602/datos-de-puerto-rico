import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";
import { useLocale } from "@/i18n/context";
import { LOCALE_INFO } from "@/i18n/locale";
import { SITE_MESSAGES } from "@/i18n/messages/site";
import { SitePage } from "./site-chrome";

/**
 * Readers get a short message in the page's language and a way to recover, never the raw
 * error. In development the technical detail stays visible (and in the
 * console) so problems are not hidden while working on the site.
 */
export function AppErrorComponent({ error }: ErrorComponentProps) {
  const dev = import.meta.env.DEV;
  const locale = useLocale();
  const t = SITE_MESSAGES[locale].error;
  useEffect(() => {
    if (dev) console.error(error);
  }, [dev, error]);
  return (
    <SitePage>
      <h1 className="font-display text-[38px] leading-tight font-medium md:text-5xl">{t.title}</h1>
      <p className="max-w-prose text-base text-muted">{t.text}</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex min-h-11 items-center rounded-[3px] border border-fg px-4 text-[15px] font-semibold"
        >
          {t.reload}
        </button>
        <a
          href={LOCALE_INFO[locale].base}
          className="flex min-h-11 items-center text-[15px] font-semibold text-accent"
        >
          {t.home}
        </a>
      </div>
      {dev && (
        <pre
          data-dev-error
          className="mt-4 max-w-full text-[13px] whitespace-pre-wrap text-muted [overflow-wrap:anywhere]"
        >
          {error instanceof Error ? (error.stack ?? error.message) : String(error)}
        </pre>
      )}
    </SitePage>
  );
}
