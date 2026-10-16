import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PuertoRicoApp } from "@/components/explorer/PuertoRicoApp";
import { AppErrorComponent } from "@/lib/error-component";
import { NotFoundPage } from "@/lib/not-found";
import { SECURITY_HEADERS } from "@/lib/security-headers";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { Route as RootRoute } from "@/routes/__root";
import { Route as SpanishRoute } from "@/routes/index";
import { FRESHNESS } from "../../../scripts/live/source.ts";
import { freshness } from "./currentModel";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

type Meta = { title?: string; name?: string; property?: string; content?: string };
type Link = { rel: string; href: string };
type Head = { meta: Meta[]; links: Link[] };
// The page's head is the root's shared tags plus the Spanish page's own (later tags win, as in HeadContent).
const rootHead = RootRoute.options.head!({} as never) as Head;
const spanishHead = SpanishRoute.options.head!({} as never) as Head;
const head: Head = {
  meta: [...rootHead.meta, ...spanishHead.meta],
  links: [...rootHead.links, ...spanishHead.links],
};
const meta = (key: string) =>
  [...head.meta].reverse().find((m) => m.name === key || m.property === key)?.content;

describe("public name, URL and metadata", () => {
  it("the page title and Open Graph name are the public name", () => {
    expect(SITE_NAME).toBe("Datos de Puerto Rico");
    expect([...head.meta].reverse().find((m) => m.title)?.title).toBe(SITE_NAME);
    expect(meta("og:title")).toBe(SITE_NAME);
    expect(meta("og:site_name")).toBe(SITE_NAME);
  });

  it("canonical and og:url point to the intended public address", () => {
    expect(SITE_URL).toBe("https://datos.tn242.com/");
    expect(head.links).toContainEqual({ rel: "canonical", href: SITE_URL });
    expect(meta("og:url")).toBe(SITE_URL);
    expect(JSON.parse(read("package.json")).homepage).toBe(SITE_URL);
  });

  it("the description covers the v1 sources in a sentence, not a keyword list", () => {
    expect(meta("description")).toBe(SITE_DESCRIPTION);
    expect(meta("og:description")).toBe(SITE_DESCRIPTION);
    for (const word of [
      "78 municipios",
      "Censo",
      "empleo",
      "fondos federales",
      "FEMA",
      "NWS",
      "USGS",
    ])
      expect(SITE_DESCRIPTION).toContain(word);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(200);
    expect(SITE_DESCRIPTION.split(",").length).toBeLessThan(6);
  });

  it("the share image is real: the municipio outlines and the name, no figures, 1200×630", () => {
    expect(meta("og:image")).toBe("https://datos.tn242.com/og.png");
    expect(meta("og:image:width")).toBe("1200");
    expect(meta("og:image:height")).toBe("630");
    expect(meta("og:image:type")).toBe("image/png");
    expect(meta("og:image:alt")).toMatch(/78 municipios.*sin cifras/);
    expect(meta("twitter:card")).toBe("summary_large_image");
    const png = readFileSync(join(ROOT, "public/og.png"));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(png.length).toBeLessThan(100_000);
  });

  it("the header shows the public name as the page's only h1", () => {
    const html = renderToStaticMarkup(<PuertoRicoApp />);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<h1 [^>]*>${SITE_NAME}</h1>`));
  });
});

describe("robots.txt", () => {
  const robots = read("public/robots.txt");
  it("allows normal indexing and names no internal paths", () => {
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
    expect(robots).not.toMatch(/data\/|scripts\/|\.cache|\.output|api/i);
  });
});

describe("Spanish 404", () => {
  it("says the page was not found and links home, with no stack details", () => {
    const html = renderToStaticMarkup(<NotFoundPage />);
    const t = text(html);
    expect(html).toMatch(/<h1 [^>]*>Página no encontrada<\/h1>/);
    expect(html).toMatch(/<a href="\/"[^>]*>Volver al inicio<\/a>/);
    expect(t).toContain(SITE_NAME);
    expect(t).not.toMatch(/Not Found|TanStack|Nitro|React|Vite|Cannot find/i);
  });

  it("is the root route's not-found page", () => {
    expect(RootRoute.options.notFoundComponent).toBe(NotFoundPage);
  });
});

describe("error page", () => {
  afterEach(() => vi.unstubAllEnvs());
  const SECRET = "Cannot read properties of undefined (reading 'x') at /srv/app.js";
  const render = () =>
    renderToStaticMarkup(
      <AppErrorComponent error={new Error(SECRET)} reset={() => {}} info={undefined} />,
    );

  it("in production readers see a short Spanish message and a way back, never the raw error", () => {
    vi.stubEnv("DEV", false);
    const html = render();
    expect(html).toMatch(/<h1 [^>]*>Algo salió mal<\/h1>/);
    expect(html).toMatch(/<button type="button"[^>]*>Volver a cargar<\/button>/);
    expect(html).toMatch(/<a href="\/"[^>]*>Ir al inicio<\/a>/);
    expect(html).not.toContain("Cannot read");
    expect(html).not.toContain("/srv/app.js");
    expect(html).not.toContain("data-dev-error");
  });

  it("in development the technical detail stays visible", () => {
    vi.stubEnv("DEV", true);
    expect(text(render())).toContain(SECRET);
  });
});

describe("README release sections", () => {
  const readme = read("README.md");
  const section = (title: string) => {
    const start = readme.indexOf(`\n## ${title}\n`);
    expect(start, title).toBeGreaterThan(-1);
    const end = readme.indexOf("\n## ", start + 4);
    return readme.slice(start, end < 0 ? undefined : end);
  };

  it("public name and address", () => {
    expect(readme.startsWith(`# ${SITE_NAME}\n`)).toBe(true);
    expect(readme).toContain("https://datos.tn242.com");
    expect(readme).not.toMatch(/Nombre provisional/);
  });

  it("Privacidad: no accounts, analytics, tracking cookies or data collection", () => {
    const s = section("Privacidad");
    expect(s).toMatch(/No hay cuentas/);
    expect(s).toMatch(/No hay analíticas ni rastreadores/);
    expect(s).toMatch(/cookies de rastreo/);
    expect(s).toMatch(/no recoge ni envía datos/);
    expect(s).toContain("localStorage");
  });

  it("Datos actuales: the four freshness states and last-known-good", () => {
    const s = section("Datos actuales");
    for (const state of ["CURRENT", "AGING", "STALE", "UNAVAILABLE"]) expect(s).toContain(state);
    expect(s).toMatch(/hasta 30 minutos/);
    expect(s).toMatch(/se conserva la última copia buena/);
  });

  it("Seguridad links SECURITY.md", () => {
    expect(section("Seguridad")).toContain("[SECURITY.md](SECURITY.md)");
  });
});

describe("NWS freshness: current up to 30 minutes, aging to 60, stale after", () => {
  const at = "2026-10-11T12:00:00.000Z";
  const after = (minutes: number) => new Date(Date.parse(at) + minutes * 60000);

  it("thresholds in the source definition and in the saved snapshot agree", () => {
    expect(FRESHNESS.nws).toEqual({ currentMinutes: 30, staleMinutes: 60 });
    expect(JSON.parse(read("data/current/nws.json")).freshness).toEqual(FRESHNESS.nws);
  });

  it("boundaries", () => {
    const f = (m: number) => freshness(at, after(m), FRESHNESS.nws);
    expect(f(0)).toBe("CURRENT");
    expect(f(30)).toBe("CURRENT");
    expect(f(30.5)).toBe("AGING");
    expect(f(60)).toBe("AGING");
    expect(f(60.5)).toBe("STALE");
    expect(freshness(null, after(0), FRESHNESS.nws)).toBe("UNAVAILABLE");
  });

  it("documentation says 30 minutes, not 15", () => {
    expect(read("DATA_SOURCES.md")).toContain(
      "NWS al día hasta 30 minutos, algo atrasado hasta 60",
    );
    expect(read("data/registry/sources.json")).toContain(
      "después de 30 minutos se considera algo atrasada y después de 60, desactualizada",
    );
  });
});

/** Every heading with the classes of all its ancestors, from server-rendered markup. */
function headings(html: string) {
  const VOID = new Set([
    "area",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "source",
    "track",
    "wbr",
    "path",
    "circle",
    "line",
    "rect",
    "stop",
  ]);
  const stack: string[] = [];
  const out: { level: number; text: string; ancestors: string[] }[] = [];
  const tag = /<(\/?)([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const [, close, name, attrs, selfClose] = m;
    if (close) {
      stack.pop();
      continue;
    }
    const h = /^h([1-6])$/.exec(name);
    if (h) {
      const end = html.indexOf(`</${name}>`, m.index);
      out.push({
        level: Number(h[1]),
        text: text(html.slice(m.index, end)).trim(),
        ancestors: [...stack],
      });
    }
    if (!selfClose && !VOID.has(name)) stack.push(/class="([^"]*)"/.exec(attrs)?.[1] ?? "");
  }
  return out;
}

describe("heading order and responsive duplicates", () => {
  const html = renderToStaticMarkup(<PuertoRicoApp />);
  const list = headings(html);

  it("the h1 comes first and no heading skips a level on the way down", () => {
    expect(list[0]).toMatchObject({ level: 1, text: SITE_NAME });
    for (let i = 1; i < list.length; i++)
      expect(list[i]!.level, list[i]!.text).toBeLessThanOrEqual(list[i - 1]!.level + 1);
    const ahora = list.findIndex((h) => h.text === "Ahora en Puerto Rico");
    expect(list[ahora]!.level).toBe(2);
  });

  it("the desktop and mobile 'Los 78' headings never show at the same width", () => {
    const los78 = list.filter((h) => h.text === "Los 78, de mayor a menor");
    expect(los78.length).toBeGreaterThanOrEqual(1);
    const desktopOnly = (h: (typeof los78)[number]) =>
      h.ancestors.some((c) => /(^| )hidden( |$)/.test(c) && /(^| )md:block( |$)/.test(c));
    const mobileOnly = (h: (typeof los78)[number]) =>
      h.ancestors.some((c) => /(^| )md:hidden( |$)/.test(c));
    // Each copy is hidden (display: none, so also hidden from assistive technology) at one side
    // of the md breakpoint, and the two sides are never the same copy.
    for (const h of los78) expect(desktopOnly(h) !== mobileOnly(h)).toBe(true);
    expect(los78.filter(desktopOnly).length).toBeLessThanOrEqual(1);
    expect(los78.filter(mobileOnly).length).toBeLessThanOrEqual(1);
  });
});

describe("security headers", () => {
  it("the agreed set: a short, host-only HSTS and no script CSP", () => {
    expect(SECURITY_HEADERS).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "Strict-Transport-Security": "max-age=86400",
    });
    // First step only: this host, no subdomains, never on the preload list.
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).not.toMatch(/includeSubDomains|preload/i);
  });

  it("are applied as a route rule (static files) and a runtime hook (all rendered pages)", () => {
    const config = read("vite.config.ts");
    expect(config).toContain('routeRules: { "/**": { headers: SECURITY_HEADERS } }');
    expect(config).toContain('plugins: ["./src/server/security-headers.ts"]');
    expect(read("src/server/security-headers.ts")).toMatch(/hooks\.hook\("response"/);
  });
});
