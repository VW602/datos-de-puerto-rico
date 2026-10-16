import { FEMA_FILTER } from "@/data/pr/fema";
import type { PrMetricId } from "@/data/pr/metrics";
import { municipioById } from "@/data/pr/places";
import { PUBLIC_METRICS } from "@/data/pr/public";
import { LOCALES, LOCALE_INFO, type Locale } from "@/i18n/locale";
import { SITE_MESSAGES } from "@/i18n/messages/site";
import { SITE_ORIGIN } from "./site";

/**
 * The explorer's state that survives a language switch, carried in the query
 * string of the other language's URL (and nowhere else: no cookie, no
 * storage). Only known values pass; anything else is dropped, so the query
 * can never inject a measure, a place or a page that does not exist.
 */
export type AppSearch = {
  metric?: PrMetricId;
  place?: string;
  view?: "perfil" | "los78" | "fuente";
  disaster?: string;
};

const METRIC_IDS = new Set<string>(PUBLIC_METRICS.map((metric) => metric.id));
const VIEWS = new Set(["perfil", "los78", "fuente"]);
const DISASTERS = new Set(FEMA_FILTER);

/** A query value as text. The router reads "72097" as the number 72097; ids are text here. */
const asText = (value: unknown): string | null =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : null;

export function validateAppSearch(raw: Record<string, unknown>): AppSearch {
  const out: AppSearch = {};
  const metric = asText(raw.metric);
  const place = asText(raw.place);
  const view = asText(raw.view);
  const disaster = asText(raw.disaster);
  if (metric && METRIC_IDS.has(metric)) out.metric = metric as PrMetricId;
  if (place && municipioById.has(place)) out.place = place;
  if (view && VIEWS.has(view)) out.view = view as AppSearch["view"];
  if (disaster && DISASTERS.has(disaster) && disaster !== "all") out.disaster = disaster;
  return out;
}

/** The same view in another language: that language's page plus only the state worth keeping. */
export function localeHref(target: Locale, state: AppSearch): string {
  const params = new URLSearchParams();
  if (state.metric) params.set("metric", state.metric);
  if (state.place) params.set("place", state.place);
  if (state.view) params.set("view", state.view);
  if (state.disaster) params.set("disaster", state.disaster);
  const query = params.toString();
  return `${LOCALE_INFO[target].base}${query ? `?${query}` : ""}`;
}

/**
 * The share image (public/og.png): the 78 municipio outlines from the project's
 * TIGER/Line geometry and the product name, with no figures, so it is true in
 * both languages and never goes out of date.
 */
export const SHARE_IMAGE = { url: `${SITE_ORIGIN}/og.png`, width: 1200, height: 630 };

/** Absolute URL of a language's page: the canonical address of that page. */
export const localeUrl = (locale: Locale) => `${SITE_ORIGIN}${LOCALE_INFO[locale].base}`;

/**
 * Title, description, sharing tags, the page's own canonical address and the
 * reciprocal language alternates. Spanish is the default (x-default).
 */
export function pageHead(locale: Locale) {
  const text = SITE_MESSAGES[locale];
  const other = LOCALES.find((item) => item !== locale)!;
  return {
    meta: [
      { title: text.title },
      { name: "description", content: text.description },
      { property: "og:title", content: text.title },
      { property: "og:description", content: text.description },
      { property: "og:url", content: localeUrl(locale) },
      { property: "og:locale", content: LOCALE_INFO[locale].ogLocale },
      { property: "og:locale:alternate", content: LOCALE_INFO[other].ogLocale },
      { property: "og:image", content: SHARE_IMAGE.url },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: String(SHARE_IMAGE.width) },
      { property: "og:image:height", content: String(SHARE_IMAGE.height) },
      { property: "og:image:alt", content: text.shareImageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image:alt", content: text.shareImageAlt },
    ],
    links: [
      { rel: "canonical", href: localeUrl(locale) },
      ...LOCALES.map((item) => ({
        rel: "alternate",
        hrefLang: LOCALE_INFO[item].htmlLang,
        href: localeUrl(item),
      })),
      { rel: "alternate", hrefLang: "x-default", href: localeUrl("es") },
    ],
  };
}
