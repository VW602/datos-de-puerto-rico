import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageSwitch } from "@/components/explorer/LanguageSwitch";
import { NowView } from "@/components/explorer/NowPanel";
import { QuakeDetails } from "@/components/explorer/now/QuakesSection";
import { PuertoRicoApp } from "@/components/explorer/PuertoRicoApp";
import { WaterDetails, WaterProvenance } from "@/components/explorer/WaterPanel";
import { NWS_SNAPSHOT, USGS_SNAPSHOT } from "@/data/pr/current";
import { ALL, FEMA_FILTER } from "@/data/pr/fema";
import { LIVE_ROUTES } from "@/data/pr/liveData";
import { METRICS_BY_LOCALE, prMetricById, type PrMetricId } from "@/data/pr/metrics";
import { municipios } from "@/data/pr/places";
import { PUBLIC_METRICS, publicMetrics } from "@/data/pr/public";
import { PUBLIC_SOURCES, publicSourceById } from "@/data/pr/sources";
import type { WaterSnapshot } from "@/data/pr/water";
import { AppErrorComponent } from "@/lib/error-component";
import { localeHref, pageHead, validateAppSearch } from "@/lib/locale-url";
import { NotFoundPage } from "@/lib/not-found";
import { Route as EnglishLayout } from "@/routes/en/route";
import { Route as EnglishRoute } from "@/routes/en/index";
import { Route as SpanishRoute } from "@/routes/index";
import { NWS as NWS_SOURCE, USGS as USGS_SOURCE } from "../../scripts/live/source.ts";
import { WATER as WATER_SOURCE } from "../../scripts/water/source.ts";
import { LocaleProvider } from "./context";
import { ageWords, dayLabel, money, moneyTick, monthLabel, monthShort, prTime } from "./format";
import { LOCALE_INFO, localeFromPath, type Locale } from "./locale";
import { EXPLORER_MESSAGES } from "./messages/explorer";
import { FEMA_MESSAGES } from "./messages/fema";
import { FUNDS_MESSAGES } from "./messages/funds";
import { LAUS_MESSAGES } from "./messages/laus";
import { METRIC_MESSAGES } from "./messages/metrics";
import { NOW_MESSAGES } from "./messages/now";
import { REGISTRY_EN } from "./messages/registry";
import { SITE_MESSAGES } from "./messages/site";
import { SNAPSHOT_ATTRIBUTIONS, snapshotAttribution } from "./messages/snapshots";
import { SOURCE_MESSAGES } from "./messages/sources";
import { WATER_MESSAGES, exclusionDetailEn } from "./messages/water";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const WATER = JSON.parse(read("data/current/usgs-water.json")) as WaterSnapshot;

const CATALOGS = {
  explorer: EXPLORER_MESSAGES,
  fema: FEMA_MESSAGES,
  funds: FUNDS_MESSAGES,
  laus: LAUS_MESSAGES,
  metrics: METRIC_MESSAGES,
  now: NOW_MESSAGES,
  site: SITE_MESSAGES,
  sources: SOURCE_MESSAGES,
  water: WATER_MESSAGES,
};

/** Every string a catalog can produce: plain strings, and functions called with sample arguments. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") {
    const sample = Array.from({ length: value.length }, (_, i) => (i % 2 ? 3 : "X"));
    const out = (value as (...a: unknown[]) => unknown)(...sample);
    return typeof out === "string" ? [[`${path}()`, out]] : [];
  }
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (typeof value === "string") return "string";
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  return typeof value;
}

/**
 * Words and characters that only Spanish text has. Proper names (municipios,
 * "Isla de Mona", the product name), official English text and USGS/NWS/FEMA
 * names are removed before looking.
 */
const SPANISH =
  /[áéíóúñ¿¡]|\b(de|del|la|las|los|el|y|en|con|sin|para|por|que|una|más|dato|datos|mediana|fuente|hogares|cifra|toda|isla|medida|medidas|desde|hasta|según|aparte|sismos?|alertas?|agua|lluvia|estaci[oó]n|estaciones|medici[oó]n|mediciones|obligado|desembolsado|mostrar|cargando|proyectos|desastres?|lugar|frente|mes|años)\b/i;
const PROPER = [
  "Datos de Puerto Rico",
  "Isla de Mona",
  ...municipios.map((m) => m.name).sort((a, b) => b.length - a.length),
];
const visibleText = (html: string) =>
  html
    // The language switch names each language in that language ("Español"); it has its own test.
    .replace(/<nav aria-label="Language">[\s\S]*?<\/nav>/g, " ")
    // Official English text from the sources is marked lang="en" and is not ours to translate.
    .replace(/<([a-z]+)[^>]* lang="en"[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<title>[\s\S]*?<\/title>/g, " ")
    .replace(/aria-label="([^"]*)"/g, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
function spanishLeftIn(text: string): string | null {
  // Identifiers such as award IDs (B-18-DE-72-0001) and series codes are not words.
  let rest = text.replace(/\b[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g, " ");
  for (const name of PROPER) rest = rest.split(name).join(" ");
  const match = rest.match(SPANISH);
  if (!match) return null;
  const at = match.index ?? 0;
  return rest.slice(Math.max(0, at - 60), at + 60);
}

/** Spanish-marked text outside the language switch (where "Español" is meant to be Spanish). */
const spanishMarked = (html: string) =>
  /lang="es-PR"/.test(html.replace(/<nav aria-label="Language">[\s\S]*?<\/nav>/g, ""));
const en = (node: React.ReactNode) =>
  renderToStaticMarkup(<LocaleProvider locale="en">{node}</LocaleProvider>);
const es = (node: React.ReactNode) =>
  renderToStaticMarkup(<LocaleProvider locale="es">{node}</LocaleProvider>);
const MAYAGUEZ = municipios.find((m) => m.name === "Mayagüez")!.id;
const FIRST_DISASTER = FEMA_FILTER.find((key) => key !== ALL)!;

describe("translation catalogs", () => {
  it("English has exactly the keys and parameters Spanish has, in every catalog", () => {
    for (const [name, catalog] of Object.entries(CATALOGS))
      expect(shape(catalog.en), name).toEqual(shape(catalog.es));
  });

  it("no English string is empty, and none is left in Spanish", () => {
    for (const [name, catalog] of Object.entries(CATALOGS))
      for (const [path, text] of strings(catalog.en)) {
        expect(text.trim(), `${name}.${path}`).not.toBe("");
        expect(spanishLeftIn(text), `${name}.${path}: ${text}`).toBeNull();
      }
  });

  it("English never just copies the Spanish, except these reviewed, language-neutral strings", () => {
    const SAME_IN_BOTH = [
      "explorer.search.count",
      "explorer.delta.points",
      "explorer.delta.place",
      "explorer.summary.puertoRico",
      "explorer.table.municipio",
      "fema.island.heading",
      "laus.points",
      "metrics.metrics.traffic.source",
      "metrics.metrics.obesity.source",
      "metrics.metrics.inactivity.source",
      "metrics.metrics.femaPaObligated.source",
      "metrics.metrics.femaPaProjects.source",
      "metrics.metrics.femaIhpApproved.source",
      "metrics.metrics.femaHmaObligated.source",
      "site.notFound.eyebrow",
      "sources.rows.dataset",
      "sources.laus.final",
      "water.approval.Provisional",
      "water.table.spark",
    ];
    const same: string[] = [];
    for (const [name, catalog] of Object.entries(CATALOGS)) {
      const esStrings = new Map(strings(catalog.es));
      for (const [path, text] of strings(catalog.en))
        if (esStrings.get(path) === text) same.push(`${name}.${path.replace(/\(\)$/, "")}`);
    }
    expect(same.sort()).toEqual([...SAME_IN_BOTH].sort());
  });

  it("every measure has an English label, explanation and source line", () => {
    expect(METRICS_BY_LOCALE.en.map((m) => m.id)).toEqual(METRICS_BY_LOCALE.es.map((m) => m.id));
    for (const metric of METRICS_BY_LOCALE.en) {
      for (const text of [metric.label, metric.hint, metric.source])
        expect(spanishLeftIn(text), `${metric.id}: ${text}`).toBeNull();
      expect(metric.label).not.toBe(prMetricById(metric.id).label);
    }
    expect(PUBLIC_METRICS).toHaveLength(33);
    expect(publicMetrics("en")).toHaveLength(33);
  });

  it("every public source has reviewed English, and the Spanish it was reviewed against has not changed", () => {
    for (const record of PUBLIC_SOURCES) {
      const english = REGISTRY_EN[record.datasetId];
      expect(english, record.datasetId).toBeDefined();
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify([
            record.title,
            record.sourceTitle,
            record.reportingPeriod,
            record.attribution,
            record.methodology,
            record.missingValuePolicy,
          ]),
        )
        .digest("hex")
        .slice(0, 16);
      expect(
        english.es,
        `${record.datasetId}: re-review the English after the registry changed`,
      ).toBe(fingerprint);
      const shown = publicSourceById(record.datasetId, "en")!;
      for (const text of [shown.title, shown.reportingPeriod, shown.missingValuePolicy])
        expect(spanishLeftIn(text), `${record.datasetId}: ${text}`).toBeNull();
      // Same record otherwise: ids, links, dates and status are not translated.
      expect({ ...shown, ...pick(record) }).toEqual({ ...shown });
    }
    expect(Object.keys(REGISTRY_EN).sort()).toEqual(PUBLIC_SOURCES.map((r) => r.datasetId).sort());
  });

  it("the live snapshots' attributions pair with the exact Spanish the scripts write", () => {
    expect(SNAPSHOT_ATTRIBUTIONS.map((pair) => pair.es)).toEqual([
      NWS_SOURCE.attribution,
      USGS_SOURCE.attribution,
      WATER_SOURCE.attribution,
    ]);
    for (const stored of [NWS_SNAPSHOT, USGS_SNAPSHOT, WATER].map((s) => s.source.attribution)) {
      expect(snapshotAttribution(stored, "en").lang).toBe("en");
      expect(snapshotAttribution(stored, "es")).toEqual({ text: stored, lang: "es" });
    }
    // Unknown text is shown as written and marked Spanish, never guessed at.
    expect(snapshotAttribution("Fuente: otra", "en")).toEqual({ text: "Fuente: otra", lang: "es" });
  });

  it("every water exclusion note in the current snapshot reads in English", () => {
    for (const item of WATER.data.exclusions.listed) {
      const english = exclusionDetailEn(item.detail);
      expect(english, item.detail).not.toBeNull();
      expect(spanishLeftIn(english!), english!).toBeNull();
    }
    expect(exclusionDetailEn("algo nuevo que nadie tradujo")).toBeNull();
  });
});

function pick(record: (typeof PUBLIC_SOURCES)[number]) {
  const { datasetId, sourceAgency, sourceURL, geography, publicStatus, verified, retrievedAt } =
    record;
  return { datasetId, sourceAgency, sourceURL, geography, publicStatus, verified, retrievedAt };
}

describe("the English page", () => {
  it("renders every measure in English, with Mayagüez selected, on every phone tab", () => {
    for (const metric of PUBLIC_METRICS)
      for (const view of ["perfil", "los78", "fuente"] as const) {
        const html = en(
          <PuertoRicoApp initial={{ metric: metric.id as PrMetricId, place: MAYAGUEZ, view }} />,
        );
        const leak = spanishLeftIn(visibleText(html));
        expect(leak, `${metric.id}/${view}: …${leak}…`).toBeNull();
        expect(spanishMarked(html)).toBe(false);
      }
  });

  it("renders every phone tab with no municipio selected in English", () => {
    for (const view of ["perfil", "los78", "fuente"] as const)
      for (const metric of ["poverty", "obesity", "fedObligations", "femaPaObligated"] as const) {
        const leak = spanishLeftIn(visibleText(en(<PuertoRicoApp initial={{ metric, view }} />)));
        expect(leak, `${metric}/${view}: …${leak}…`).toBeNull();
      }
  });

  it("no component or page carries its own Spanish text: all copy comes from the catalogs", () => {
    const files = (dir: string): string[] =>
      readdirSync(join(ROOT, dir)).flatMap((name) => {
        const path = `${dir}/${name}`;
        return statSync(join(ROOT, path)).isDirectory() ? files(path) : [path];
      });
    const sources = [
      ...files("src/components"),
      ...files("src/lib"),
      ...files("src/routes"),
    ].filter((path) => /\.tsx?$/.test(path) && !path.endsWith(".gen.ts"));
    // Internal keys and proper names that are not copy.
    const allowed = ["Recuperación y desastres", "Isla de Mona", "Datos de Puerto Rico", "#fuente"];
    for (const path of sources) {
      const code = read(path)
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        // Class lists are styling, not copy.
        .replace(/className=("[^"]*"|\{`[^`]*`\})/g, "")
        .replace(/(?:className|const \w+) = "[^"]*\b(?:flex|border|text-|px-|py-)[^"]*"/g, "");
      const literals = [...code.matchAll(/"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]+)</g)]
        // Only the literal text of a template counts, not the code inside ${…}.
        .map((m) => (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ").trim());
      for (const literal of literals) {
        if (!literal || allowed.includes(literal) || /^[\w./@:#?=&%-]+$/.test(literal)) continue;
        // A list of utility classes: lowercase tokens, at least one of them hyphenated.
        const tokens = literal.split(/\s+/);
        if (
          tokens.every((x) => /^[a-z0-9@:/[\]._%#(),'!-]+$/.test(x)) &&
          tokens.some((x) => x.includes("-"))
        )
          continue;
        expect(spanishLeftIn(literal), `${path}: "${literal}"`).toBeNull();
      }
    }
  });

  it("renders the island-wide summary and a single disaster in English", () => {
    for (const metric of PUBLIC_METRICS) {
      const leak = spanishLeftIn(
        visibleText(en(<PuertoRicoApp initial={{ metric: metric.id }} />)),
      );
      expect(leak, `${metric.id}: …${leak}…`).toBeNull();
    }
    for (const metric of ["femaPaObligated", "femaIhpApproved", "femaHmaObligated"] as const) {
      const html = en(
        <PuertoRicoApp initial={{ metric, place: MAYAGUEZ, disaster: FIRST_DISASTER }} />,
      );
      expect(spanishLeftIn(visibleText(html))).toBeNull();
    }
  });

  it("renders current data, earthquakes, water and their provenance in English", () => {
    const now = new Date(Date.parse(WATER.retrievedAt!) + 10 * 60000);
    const parts = [
      <NowView now={now} nws={NWS_SNAPSHOT} usgs={USGS_SNAPSHOT} water={WATER} />,
      <NowView now={null} nws={NWS_SNAPSHOT} usgs={USGS_SNAPSHOT} water={null} />,
      <NowView
        now={new Date("2030-01-01")}
        nws={NWS_SNAPSHOT}
        usgs={USGS_SNAPSHOT}
        water="error"
      />,
      <QuakeDetails snapshot={USGS_SNAPSHOT} />,
      <WaterProvenance water={WATER} />,
      ...(["RIOS", "LLUVIA", "EMBALSES"] as const).map((view) => (
        <WaterDetails water={WATER} now={now} initialView={view} initialShowAll />
      )),
    ];
    for (const part of parts) {
      const html = en(part);
      const leak = spanishLeftIn(visibleText(html));
      expect(leak, `…${leak}…`).toBeNull();
      expect(spanishMarked(html)).toBe(false);
    }
  });

  it("the 404 and error pages are in the page's language", () => {
    const notFound = visibleText(en(<NotFoundPage />));
    expect(notFound).toContain("Page not found");
    expect(spanishLeftIn(notFound)).toBeNull();
    expect(en(<NotFoundPage />)).toMatch(/<a href="\/en\/"[^>]*>Back to the home page<\/a>/);
    expect(visibleText(es(<NotFoundPage />))).toContain("Página no encontrada");
    const error = en(
      <AppErrorComponent error={new Error("x")} reset={() => {}} info={undefined} />,
    );
    expect(visibleText(error)).toContain("Something went wrong");
    expect(spanishLeftIn(visibleText(error))).toBeNull();
  });

  it("is the same page as Spanish: same measures, values, order and live routes", () => {
    const esApp = es(<PuertoRicoApp initial={{ metric: "income", place: MAYAGUEZ }} />);
    const enApp = en(<PuertoRicoApp initial={{ metric: "income", place: MAYAGUEZ }} />);
    const values = (html: string) => html.match(/\$[\d,.]+/g);
    expect(values(enApp)).toEqual(values(esApp));
    for (const id of PUBLIC_METRICS.map((m) => m.id))
      for (const value of [0, 1.5, 12.34, 45210, 2.5e6, 1.3e9])
        expect(
          prMetricById(id, "en")
            .format(value)
            .replace(/[^\d.,$%−-]/g, ""),
        ).toBe(
          prMetricById(id, "es")
            .format(value)
            .replace(/[^\d.,$%−-]/g, ""),
        );
    // One set of live routes, shared by both languages; nothing under /en/live.
    for (const path of Object.values(LIVE_ROUTES)) expect(path).toMatch(/^\/live\//);
    expect(read("src/server/live-route.ts")).not.toMatch(/\/en\//);
  });
});

describe("locale-aware formatting", () => {
  const AT = "2026-10-16T04:16:00.000Z";
  it("dates and times in Puerto Rico time, in each language's style", () => {
    expect(prTime(AT)).toBe("16 oct 2026, 12:16 a. m. hora de Puerto Rico (AST)");
    expect(prTime(AT, true)).toBe("16 oct, 12:16 a. m. AST");
    expect(prTime(AT, false, "en")).toBe("Oct 16, 2026, 12:16 AM Puerto Rico time (AST)");
    expect(prTime(AT, true, "en")).toBe("Oct 16, 12:16 AM AST");
    expect(dayLabel("2026-10-07")).toBe("7 oct 2026");
    expect(dayLabel("2026-10-07", "en")).toBe("Oct 7, 2026");
    expect(monthLabel("2026-08")).toBe("agosto de 2026");
    expect(monthLabel("2026-08", "en")).toBe("August 2026");
    expect(monthShort("2026-08", "en")).toBe("Aug 2026");
  });

  it("relative ages", () => {
    const now = new Date(Date.parse(AT) + 12 * 60000);
    expect(ageWords(AT, now)).toBe("hace 12 min");
    expect(ageWords(AT, now, "en")).toBe("12 min ago");
    expect(ageWords(AT, new Date(Date.parse(AT) + 3 * 3600000), "en")).toBe("3 h ago");
    expect(ageWords(AT, new Date(Date.parse(AT) + 72 * 3600000), "en")).toBe("3 days ago");
  });

  it("money, counts and percents: same numbers, each language's words", () => {
    expect(money(13.45e9)).toBe("$13.45 mil millones");
    expect(money(13.45e9, "en")).toBe("$13.45 billion");
    expect(money(812.3e6, "en")).toBe("$812.3 million");
    expect(money(-45210, "en")).toBe("−$45,210");
    expect(moneyTick(1.81e9, "en")).toBe("$1.81B");
    expect(moneyTick(1.81e9)).toBe("$1.81 mil mill.");
    expect(prMetricById("population", "en").format(1234567)).toBe("1,234,567");
    expect(prMetricById("population", "en").formatTick(2.345e6)).toBe("2.35M");
    expect(prMetricById("population").formatTick(2.345e6)).toBe("2.35 mill.");
    expect(prMetricById("income", "en").format(45210)).toBe("$45,210");
    expect(prMetricById("poverty", "en").format(43.1)).toBe("43.1%");
    expect(prMetricById("poverty", "en").versus(45.1, 43.1)).toBe("2.0 points above the median");
    expect(prMetricById("traffic", "en").format(12.34)).toBe("12.3 per 100,000");
    expect(prMetricById("medianage", "en").format(44.06)).toBe("44.1 years");
    expect(prMetricById("fedObligations", "en").versus(-5, 10)).toBe(
      "Net negative obligation (deobligations)",
    );
  });
});

describe("addresses, SEO and the language switch", () => {
  it("the URL alone decides the language", () => {
    expect(localeFromPath("/")).toBe("es");
    expect(localeFromPath("/en/")).toBe("en");
    expect(localeFromPath("/en")).toBe("en");
    for (const path of ["/EN/", "/english/", "/eng/", "/es/", "/enx", "/xyz"])
      expect(localeFromPath(path), path).toBe("es");
    expect(LOCALE_INFO.es.htmlLang).toBe("es-PR");
    expect(LOCALE_INFO.en.htmlLang).toBe("en");
  });

  it("each page canonicalizes to itself, with reciprocal alternates and Spanish as x-default", () => {
    for (const [locale, route] of [
      ["es", SpanishRoute],
      ["en", EnglishRoute],
    ] as const) {
      const head = route.options.head!({} as never) as ReturnType<typeof pageHead>;
      expect(head).toEqual(pageHead(locale));
      const canonical = head.links.filter((l) => l.rel === "canonical");
      expect(canonical).toEqual([
        {
          rel: "canonical",
          href: locale === "es" ? "https://datos.tn242.com/" : "https://datos.tn242.com/en/",
        },
      ]);
      expect(head.links.filter((l) => l.rel === "alternate")).toEqual([
        { rel: "alternate", hrefLang: "es-PR", href: "https://datos.tn242.com/" },
        { rel: "alternate", hrefLang: "en", href: "https://datos.tn242.com/en/" },
        { rel: "alternate", hrefLang: "x-default", href: "https://datos.tn242.com/" },
      ]);
      const meta = (key: string) =>
        head.meta.find(
          (m) => ("name" in m && m.name === key) || ("property" in m && m.property === key),
        );
      expect(meta("og:url")).toMatchObject({ content: canonical[0].href });
      expect(meta("og:locale")).toMatchObject({ content: LOCALE_INFO[locale].ogLocale });
      expect(meta("description")).toMatchObject({ content: SITE_MESSAGES[locale].description });
    }
    expect(SITE_MESSAGES.en.title).toContain("Datos de Puerto Rico");
    expect(SITE_MESSAGES.en.description.length).toBeLessThanOrEqual(200);
    expect(spanishLeftIn(SITE_MESSAGES.en.description)).toBeNull();
    // The English section has its own 404 page.
    expect(EnglishLayout.options.notFoundComponent).toBe(NotFoundPage);
  });

  it("robots.txt leaves /en/ open to indexing", () => {
    const robots = read("public/robots.txt");
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/Disallow: \/en/);
  });

  it("only known state passes through the query; everything else is dropped", () => {
    expect(
      validateAppSearch({
        metric: "income",
        place: MAYAGUEZ,
        view: "fuente",
        disaster: FIRST_DISASTER,
      }),
    ).toEqual({ metric: "income", place: MAYAGUEZ, view: "fuente", disaster: FIRST_DISASTER });
    expect(
      validateAppSearch({
        metric: "<script>",
        place: "https://evil.example",
        view: "admin",
        disaster: "all",
        next: "//evil.example",
      }),
    ).toEqual({});
    // The router hands numeric-looking values over as numbers; known ids still pass.
    expect(
      validateAppSearch({ place: Number(MAYAGUEZ), disaster: Number(FIRST_DISASTER) }),
    ).toEqual(
      Number.isNaN(Number(FIRST_DISASTER))
        ? { place: MAYAGUEZ }
        : { place: MAYAGUEZ, disaster: FIRST_DISASTER },
    );
    expect(validateAppSearch({ place: 99999, metric: ["income"], view: { a: 1 } })).toEqual({});
  });

  it("the switch links to the same view in the other language, only on this site", () => {
    const state = { metric: "income" as const, place: MAYAGUEZ, view: "fuente" as const };
    expect(localeHref("en", state)).toBe(`/en/?metric=income&place=${MAYAGUEZ}&view=fuente`);
    expect(localeHref("es", state)).toBe(`/?metric=income&place=${MAYAGUEZ}&view=fuente`);
    expect(localeHref("en", {})).toBe("/en/");
    for (const locale of ["es", "en"] as Locale[]) {
      const html = renderToStaticMarkup(
        <LocaleProvider locale={locale}>
          <LanguageSwitch state={state} />
        </LocaleProvider>,
      );
      expect(html).toMatch(
        new RegExp(`<nav aria-label="${locale === "es" ? "Idioma" : "Language"}">`),
      );
      const links = [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map((m) => m[1] + m[2]);
      expect(links).toHaveLength(2);
      const [esLink, enLink] = links;
      expect(esLink).toMatch(/hrefLang="es-PR" lang="es-PR"/);
      expect(enLink).toMatch(/hrefLang="en" lang="en"/);
      expect(esLink).toContain("Español");
      expect(enLink).toContain("English");
      expect(esLink.includes('aria-current="page"')).toBe(locale === "es");
      expect(enLink.includes('aria-current="page"')).toBe(locale === "en");
      for (const link of links)
        expect(link).toMatch(/href="\/(en\/)?\?metric=income&amp;place=\d+&amp;view=fuente"/);
      // A real touch target, and no flags.
      for (const link of links) expect(link).toMatch(/min-h-11 min-w-11/);
      expect(html).not.toMatch(/🇵🇷|🇺🇸|flag/i);
    }
  });

  it("a switched page opens on the reader's view: measure, municipio and tab carried over", () => {
    const html = en(
      <PuertoRicoApp initial={{ metric: "income", place: MAYAGUEZ, view: "fuente" }} />,
    );
    expect(html).toContain('aria-label="Selected municipio: Mayagüez"');
    expect(html).toMatch(/<h2[^>]*>Median household income<\/h2>/);
    expect(html).toMatch(/<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>Source<\/button>/);
    // And its own switch points back to the same view in Spanish.
    expect(html).toContain(`href="/?metric=income&amp;place=${MAYAGUEZ}&amp;view=fuente"`);
    // A fresh page carries nothing.
    expect(en(<PuertoRicoApp />)).toContain('href="/"');
  });

  it("Spanish stays the default: no provider, no URL, no query means Spanish", () => {
    const html = renderToStaticMarkup(<PuertoRicoApp />);
    expect(html).toContain("Ahora en Puerto Rico");
    expect(html).toContain('aria-current="page" class');
    expect(html).toMatch(/hrefLang="es-PR" lang="es-PR" aria-current="page"/);
  });
});
