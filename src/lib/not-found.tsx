import { useLocale } from "@/i18n/context";
import { LOCALE_INFO } from "@/i18n/locale";
import { SITE_MESSAGES } from "@/i18n/messages/site";
import { SitePage } from "./site-chrome";

export function NotFoundPage() {
  const locale = useLocale();
  const t = SITE_MESSAGES[locale].notFound;
  return (
    <SitePage>
      <p className="text-xs font-bold tracking-[0.09em] text-accent uppercase md:text-[13px]">
        {t.eyebrow}
      </p>
      <h1 className="font-display text-[38px] leading-tight font-medium md:text-5xl">{t.title}</h1>
      <p className="max-w-prose text-base text-muted">{t.text}</p>
      <a
        href={LOCALE_INFO[locale].base}
        className="flex min-h-11 items-center text-[15px] font-semibold text-accent"
      >
        {t.home}
      </a>
    </SitePage>
  );
}
