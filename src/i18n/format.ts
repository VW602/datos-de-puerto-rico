/**
 * Locale-aware formatting shared by the data modules and the interface.
 * Formatting only: no value is changed, rounded differently or converted.
 * Spanish output is exactly what the site printed before English existed.
 * Pure: no React, no network (scripts use some of it too).
 */
import { LOCALE_INFO, type Locale } from "./locale.ts";

const MONTHS_LONG_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const MONTHS_SHORT_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const MONTHS_LONG_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-08" → "agosto de 2026" / "August 2026". */
export function monthLabel(key: string, locale: Locale = "es"): string {
  const [year, month] = key.split("-").map(Number);
  return locale === "en"
    ? `${MONTHS_LONG_EN[month - 1]} ${year}`
    : `${MONTHS_LONG_ES[month - 1]} de ${year}`;
}

/** "2026-08" → "ago 2026" / "Aug 2026". */
export function monthShort(key: string, locale: Locale = "es"): string {
  const [year, month] = key.split("-").map(Number);
  return `${(locale === "en" ? MONTHS_SHORT_EN : MONTHS_SHORT_ES)[month - 1]} ${year}`;
}

/** "2026-10-07" → "7 oct 2026" / "Oct 7, 2026". Null → "—". */
export function dayLabel(iso: string | null, locale: Locale = "es"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return locale === "en"
    ? `${MONTHS_SHORT_EN[m - 1]} ${d}, ${y}`
    : `${d} ${MONTHS_SHORT_ES[m - 1]} ${y}`;
}

const integerFormats = new Map<Locale, Intl.NumberFormat>();
/** Whole numbers with thousands separators: "45,210" in both languages. */
export function integer(value: number, locale: Locale = "es"): string {
  let format = integerFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE_INFO[locale].intl, { maximumFractionDigits: 0 });
    integerFormats.set(locale, format);
  }
  return format.format(value);
}

const dollarFormats = new Map<Locale, Intl.NumberFormat>();
/** Whole dollars: "$45,210", "-$1,200" in both languages. */
export function dollars(value: number, locale: Locale = "es"): string {
  let format = dollarFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE_INFO[locale].intl, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
    dollarFormats.set(locale, format);
  }
  return format.format(value);
}

/**
 * Dollars: "$13.45 mil millones", "$812.3 millones", "$45,210" in Spanish;
 * "$13.45 billion", "$812.3 million", "$45,210" in English. Same rounding.
 */
export function money(value: number, locale: Locale = "es"): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const en = locale === "en";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)} ${en ? "billion" : "mil millones"}`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)} ${en ? "million" : "millones"}`;
  return `${sign}$${integer(Math.round(abs), locale)}`;
}

/** Money for axis ends and legends: "$1.81 mil mill." / "$1.81B", "$7.1 mill." / "$7.1M". */
export function moneyTick(value: number, locale: Locale = "es"): string {
  const text = money(value, locale);
  return locale === "en"
    ? text.replace(" billion", "B").replace(" million", "M")
    : text.replace(" mil millones", " mil mill.").replace(" millones", " mill.");
}

/** Puerto Rico time (AST, UTC−4, no daylight saving), whatever the viewer's device says. */
export const PR_TIME_ZONE = "America/Puerto_Rico";

const timeFormats = new Map<string, Intl.DateTimeFormat>();
function timeFormat(locale: Locale, short: boolean): Intl.DateTimeFormat {
  const key = `${locale}:${short}`;
  let format = timeFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE_INFO[locale].intl, {
      timeZone: PR_TIME_ZONE,
      day: "numeric",
      month: "short",
      ...(short ? {} : { year: "numeric" as const }),
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    timeFormats.set(key, format);
  }
  return format;
}

/**
 * "7 oct 2026, 9:35 p. m. hora de Puerto Rico (AST)" /
 * "Oct 7, 2026, 9:35 PM Puerto Rico time (AST)". Short: "… AST".
 */
export function prTime(iso: string | null, short = false, locale: Locale = "es"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const text = timeFormat(locale, short)
    .format(d)
    .replace(/\u202f|\u00a0/g, " ");
  if (short) return `${text} AST`;
  return `${text} ${locale === "en" ? "Puerto Rico time (AST)" : "hora de Puerto Rico (AST)"}`;
}

/** Age in words: "hace 12 min" / "12 min ago", "hace 3 h" / "3 h ago", "hace 2 días" / "2 days ago". */
export function ageWords(iso: string, now: Date, locale: Locale = "es"): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  const en = locale === "en";
  if (minutes < 60) return en ? `${minutes} min ago` : `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return en ? `${hours} h ago` : `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return en ? `${days} days ago` : `hace ${days} días`;
}

/** "1 estación" / "3 estaciones". The caller passes both forms in its own language. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
