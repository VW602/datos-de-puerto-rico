import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  alertsStatus,
  quakesStatus,
  type NwsSnapshot,
  type UsgsSnapshot,
} from "../../src/data/pr/current";
import { alertInForce, freshness, prTime, withinHours } from "../../src/data/pr/currentModel";
import { validateNws, validateUsgs } from "./check.ts";
import {
  contentHash,
  excerpt,
  normalizeNws,
  normalizeUsgs,
  nwsSnapshot,
  recordFailure,
  sha256,
  stableJson,
  usgsSnapshot,
  type NwsData,
  type Snapshot,
  type UsgsData,
} from "./normalize.ts";
import { FRESHNESS, NWS_FIELDS, NWS_OUTPUT, USGS_FIELDS, USGS_OUTPUT } from "./source.ts";
import { atomicWrite } from "./update.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const fixture = (name: string) => read(`scripts/live/fixtures/${name}`);
const census = JSON.parse(read("data/generated/census-municipios.json")) as {
  municipios: Record<string, unknown>;
};
const IDS = new Set(Object.keys(census.municipios));
const RETRIEVED = "2026-10-07T21:40:00.000Z";
const minutesAfter = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60000);

function nwsFrom(raw: string, retrievedAt = RETRIEVED): Snapshot<NwsData> {
  const n = normalizeNws(raw, IDS);
  return nwsSnapshot({
    retrievedAt,
    sourceUpdatedAt: n.sourceUpdatedAt,
    raw: { sha256: sha256(raw), bytes: raw.length, note: "fixture" },
    lastAttempt: { at: retrievedAt, ok: true, error: null },
    data: { alerts: n.alerts },
  });
}
function usgsFrom(raw: string, retrievedAt: string): Snapshot<UsgsData> {
  const n = normalizeUsgs(raw);
  return usgsSnapshot({
    retrievedAt,
    sourceUpdatedAt: n.sourceUpdatedAt,
    raw: { sha256: sha256(raw), bytes: raw.length, note: "fixture" },
    lastAttempt: { at: retrievedAt, ok: true, error: null },
    data: { windowHours: 168, worldCount: n.worldCount, events: n.events },
  });
}
const asNws = (s: Snapshot<NwsData>) => s as unknown as NwsSnapshot;
const asUsgs = (s: Snapshot<UsgsData>) => s as unknown as UsgsSnapshot;

const usgsRaw = fixture("usgs-week.json");
const usgsGenerated = new Date(
  (JSON.parse(usgsRaw) as { metadata: { generated: number } }).metadata.generated,
).toISOString();

describe("NWS: alertas", () => {
  const alerts = normalizeNws(fixture("nws-alerts.json"), IDS).alerts;

  it("lee los campos oficiales de cada alerta, con los nombres del NWS", () => {
    const flood = alerts.find((a) => a.event === "Flood Advisory")!;
    expect(flood.id).toMatch(/^urn:oid:/);
    expect(flood.severity).toBe("Minor");
    expect(flood.status).toBe("Actual");
    expect(flood.url).toMatch(/^https:\/\/api\.weather\.gov\/alerts\//);
    expect(flood.effective).toMatch(/Z$/);
    for (const a of alerts) expect(Object.keys(a)).toEqual([...NWS_FIELDS]);
  });

  it("guarda la severidad con los términos del NWS y rechaza cualquier otra", () => {
    expect(alerts.map((a) => a.severity)).toEqual(
      expect.arrayContaining(["Extreme", "Minor", "Moderate"]),
    );
    const bad = fixture("nws-alerts.json").replace(
      '"severity": "Minor"',
      '"severity": "Peligroso"',
    );
    expect(() => normalizeNws(bad, IDS)).toThrow(/severidad/);
  });

  it("municipios solo por los códigos SAME oficiales; zonas marinas y «todo PR» no se adivinan", () => {
    const flood = alerts.find((a) => a.event === "Flood Advisory")!;
    expect(flood.geography).toBe("MUNICIPIOS");
    expect(flood.municipios.every((m) => /^72\d{3}$/.test(m))).toBe(true);
    expect(flood.municipios).toEqual(flood.same.map((c) => `72${c.slice(3)}`).sort());
    const marine = alerts.find((a) => a.event === "Small Craft Advisory")!;
    // Its prose names San Juan and Bayamón; no SAME code does, so no municipio.
    expect(marine.description).toMatch(/San Juan/);
    expect(marine.municipios).toEqual([]);
    expect(marine.geography).toBe("NWS_ZONE");
    const statewide = alerts.find((a) => a.event === "Tsunami Warning")!;
    expect(statewide.geography).toBe("PUERTO_RICO");
    expect(statewide.municipios).toEqual([]);
  });

  it("una alerta vence cuando NWS dice que vence; una cancelación no está en vigor", () => {
    const flood = alerts.find((a) => a.event === "Flood Advisory")!;
    expect(alertInForce(flood, new Date(Date.parse(flood.expires!) - 60000))).toBe(
      flood.messageType !== "Cancel",
    );
    expect(alertInForce(flood, new Date(Date.parse(flood.expires!) + 60000))).toBe(false);
    expect(alertInForce({ ...flood, messageType: "Cancel" }, new Date(0))).toBe(false);
    const broken = fixture("nws-alerts.json").replace(
      /"expires": "[^"]+"/,
      '"expires": "2000-01-01T00:00:00+00:00"',
    );
    expect(() => normalizeNws(broken, IDS)).toThrow(/expira antes/);
  });

  it("un ID repetido hace fallar", () => {
    const json = JSON.parse(fixture("nws-alerts.json")) as { features: unknown[] };
    json.features.push(json.features[0]);
    expect(() => normalizeNws(JSON.stringify(json), IDS)).toThrow(/repetida/);
  });

  it("guarda solo un extracto corto del texto oficial y lo marca", () => {
    const long = excerpt("palabra ".repeat(200), 600);
    expect(long.truncated).toBe(true);
    expect(long.text!.length).toBeLessThanOrEqual(601);
    expect(long.text!.endsWith("…")).toBe(true);
    expect(excerpt(null, 600)).toEqual({ text: null, truncated: false });
  });
});

describe("ninguna alerta ≠ fuente caída ≠ copia vieja", () => {
  it("respuesta correcta con 0 alertas: «no hay alertas activas»", () => {
    const s = asNws(nwsFrom(fixture("nws-empty.json")));
    expect(s.data.alerts).toEqual([]);
    expect(alertsStatus(s, minutesAfter(RETRIEVED, 5)).kind).toBe("NONE");
  });

  it("fuente caída sin copia previa: no se puede confirmar, nunca «ninguna»", () => {
    const failed = recordFailure<NwsData>(
      null,
      { at: RETRIEVED, ok: false, error: "HTTP 503 (2 intentos)" },
      { alerts: [] },
      nwsSnapshot,
    );
    expect(failed.retrievedAt).toBeNull();
    expect(freshness(failed.retrievedAt, minutesAfter(RETRIEVED, 1), FRESHNESS.nws)).toBe(
      "UNAVAILABLE",
    );
    expect(alertsStatus(asNws(failed), minutesAfter(RETRIEVED, 1)).kind).toBe("UNCONFIRMED");
    validateNws(failed, IDS);
  });

  it("fuente caída con copia previa: se conserva la última copia buena y su hora", () => {
    const good = nwsFrom(fixture("nws-alerts.json"));
    const failed = recordFailure(
      good,
      { at: "2026-10-07T22:00:00.000Z", ok: false, error: "timeout" },
      { alerts: [] },
      nwsSnapshot,
    );
    expect(failed.data).toEqual(good.data);
    expect(failed.retrievedAt).toBe(good.retrievedAt);
    expect(failed.lastAttempt.ok).toBe(false);
    validateNws(failed, IDS);
  });

  it("copia vieja con 0 alertas ≠ respuesta actual con 0 alertas", () => {
    const s = asNws(nwsFrom(fixture("nws-empty.json")));
    expect(alertsStatus(s, minutesAfter(RETRIEVED, 10)).kind).toBe("NONE");
    expect(freshness(RETRIEVED, minutesAfter(RETRIEVED, 30), FRESHNESS.nws)).toBe("AGING");
    expect(freshness(RETRIEVED, minutesAfter(RETRIEVED, 61), FRESHNESS.nws)).toBe("STALE");
    expect(alertsStatus(s, minutesAfter(RETRIEVED, 61)).kind).toBe("UNCONFIRMED");
  });

  it("lo mismo para sismos: 0 eventos ≠ fuente caída ≠ copia vieja", () => {
    const empty = JSON.stringify({
      type: "FeatureCollection",
      metadata: { generated: Date.parse(RETRIEVED), status: 200, count: 0 },
      features: [],
    });
    const s = asUsgs(usgsFrom(empty, RETRIEVED));
    expect(quakesStatus(s, minutesAfter(RETRIEVED, 10)).kind).toBe("NONE");
    expect(quakesStatus(s, minutesAfter(RETRIEVED, 181)).kind).toBe("UNCONFIRMED");
    const failed = recordFailure<UsgsData>(
      null,
      { at: RETRIEVED, ok: false, error: "HTTP 500" },
      { windowHours: 168, worldCount: null, events: [] },
      usgsSnapshot,
    );
    expect(quakesStatus(asUsgs(failed), minutesAfter(RETRIEVED, 1)).kind).toBe("UNCONFIRMED");
    validateUsgs(failed);
  });
});

describe("USGS: sismos", () => {
  const n = normalizeUsgs(usgsRaw);

  it("solo la región documentada, con coordenadas, magnitud y profundidad tal como las da el USGS", () => {
    expect(n.worldCount).toBe(13);
    expect(n.events.length).toBe(10);
    for (const e of n.events) {
      expect(e.latitude).toBeGreaterThanOrEqual(17);
      expect(e.latitude).toBeLessThanOrEqual(20);
      expect(e.longitude).toBeGreaterThanOrEqual(-69);
      expect(e.longitude).toBeLessThanOrEqual(-63.5);
      expect(Object.keys(e)).toEqual([...USGS_FIELDS]);
    }
    const raw = (
      JSON.parse(usgsRaw) as {
        features: {
          id: string;
          properties: { mag: number };
          geometry: { coordinates: number[] };
        }[];
      }
    ).features.find((f) => f.id === n.events[0].id)!;
    expect(n.events[0].mag).toBe(raw.properties.mag);
    expect(n.events[0].depthKm).toBe(raw.geometry.coordinates[2]);
  });

  it("un dato que el USGS deja vacío sigue vacío; nunca 0", () => {
    const e = n.events.find((x) => x.id === "prtestnullmag")!;
    expect(e.mag).toBeNull();
    expect(e.felt).toBeNull();
    expect(e.sig).toBeNull();
  });

  it("un evento repetido o fuera de rango hace fallar", () => {
    const json = JSON.parse(usgsRaw) as { features: unknown[]; metadata: { count: number } };
    json.features.push(json.features[0]);
    json.metadata.count += 1;
    expect(() => normalizeUsgs(JSON.stringify(json))).toThrow(/repetido/);
    expect(() => normalizeUsgs(usgsRaw.replace(/"mag": [0-9.]+/, '"mag": 42'))).toThrow(/magnitud/);
  });

  it("ventanas de 24 horas y 7 días medidas desde la hora de la copia, no desde el reloj de quien mira", () => {
    const s = asUsgs(usgsFrom(usgsRaw, usgsGenerated));
    const day = withinHours(s.data.events, usgsGenerated, 24);
    const week = withinHours(s.data.events, usgsGenerated, 168);
    expect(day.length).toBeLessThanOrEqual(week.length);
    for (const e of day)
      expect(Date.parse(usgsGenerated) - Date.parse(e.time)).toBeLessThanOrEqual(24 * 3600_000);
    expect(quakesStatus(s, minutesAfter(usgsGenerated, 5)).day).toEqual(day);
  });

  it("la bandera tsunami del USGS se guarda como bandera, nunca como aviso", () => {
    const flagged = n.events.find((x) => x.id === "prtesttsunami")!;
    expect(flagged.tsunami).toBe(1);
    expect(Object.keys(flagged)).not.toContain("tsunamiWarning");
    const panel = read("src/components/explorer/NowPanel.tsx");
    expect(panel).toMatch(/no es un aviso de tsunami/);
    expect(panel).toMatch(/indicador tsunami USGS: 1/);
    // The only "aviso" wording next to the flag is the negation; warnings come from NOAA/NWS alerts.
    expect(panel).not.toMatch(/(^|[^o] )[Aa]viso de tsunami del USGS/);
    expect(panel).not.toMatch(/tsunami === 1 && <[^>]*>\s*Aviso/);
  });
});

describe("hora de Puerto Rico", () => {
  it("se muestra en AST (UTC−4, sin horario de verano), sea cual sea la zona del equipo", () => {
    expect(prTime("2026-10-08T01:38:21.957Z")).toBe(
      "7 oct 2026, 9:38 p. m. hora de Puerto Rico (AST)",
    );
    expect(prTime("2026-01-15T16:00:00.000Z", true)).toMatch(/^15 ene, 12:00 p\. m\. AST$/);
    expect(prTime("2026-07-15T16:00:00.000Z", true)).toMatch(/^15 jul, 12:00 p\. m\. AST$/);
    expect(prTime(null)).toBe("—");
  });
});

describe("copias publicadas", () => {
  const nws = JSON.parse(read(NWS_OUTPUT)) as Snapshot<NwsData>;
  const usgs = JSON.parse(read(USGS_OUTPUT)) as Snapshot<UsgsData>;

  it("pasan la validación, con hash del contenido y SHA-256 de la respuesta original", () => {
    validateNws(nws, IDS);
    validateUsgs(usgs);
    for (const s of [nws, usgs] as Snapshot<unknown>[]) {
      expect(s.contentSha256).toBe(contentHash(s.data));
      if (s.retrievedAt) expect(s.raw!.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(s.source.endpoint).toMatch(/^https:\/\/(api\.weather\.gov|earthquake\.usgs\.gov)\//);
      expect(s.source.attribution).toMatch(/no respalda/);
    }
  });

  it("solo campos permitidos: sin texto completo de NWS ni campos del feed que el sitio no usa", () => {
    for (const a of nws.data.alerts) expect(Object.keys(a)).toEqual([...NWS_FIELDS]);
    for (const e of usgs.data.events) expect(Object.keys(e)).toEqual([...USGS_FIELDS]);
    const text = read(USGS_OUTPUT);
    expect(text).not.toMatch(
      /"(ids|sources|types|nst|dmin|rms|gap|net|code|detail|cdi|mmi|alert)":/,
    );
    expect(Buffer.byteLength(read(NWS_OUTPUT))).toBeLessThan(200_000);
    expect(Buffer.byteLength(text)).toBeLessThan(200_000);
  });

  it("una copia rota no pasa: futuro, repetidos, fuera de la región, hash", () => {
    const s = usgsFrom(usgsRaw, usgsGenerated);
    const tamper = (f: (x: Snapshot<UsgsData>) => void) => {
      const x = structuredClone(s);
      f(x);
      x.contentSha256 = contentHash(x.data);
      return x;
    };
    expect(() =>
      validateUsgs(tamper((x) => (x.data.events[0].time = "2099-01-01T00:00:00.000Z"))),
    ).toThrow();
    expect(() => validateUsgs(tamper((x) => x.data.events.push(x.data.events[0])))).toThrow(
      /repetido/,
    );
    expect(() => validateUsgs(tamper((x) => (x.data.events[0].latitude = 25)))).toThrow(/región/);
    const bad = structuredClone(s);
    bad.data.events[0].mag = 1.11;
    expect(() => validateUsgs(bad)).toThrow(/SHA-256 del contenido/);
  });

  it("normalizar dos veces la misma respuesta da los mismos bytes", () => {
    const a = stableJson(usgsFrom(usgsRaw, usgsGenerated) as Snapshot<unknown>, "events");
    const b = stableJson(usgsFrom(usgsRaw, usgsGenerated) as Snapshot<unknown>, "events");
    expect(a).toBe(b);
    const c = stableJson(nwsFrom(fixture("nws-alerts.json")) as Snapshot<unknown>, "alerts");
    expect(c).toBe(stableJson(nwsFrom(fixture("nws-alerts.json")) as Snapshot<unknown>, "alerts"));
  });
});

describe("instalación atómica", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  it("escribe el archivo completo o nada, sin dejar temporales", () => {
    const dir = mkdtempSync(join(tmpdir(), "live-test-"));
    dirs.push(dir);
    const path = join(dir, "current", "nws.json");
    atomicWrite(path, "uno");
    atomicWrite(path, "dos");
    expect(readFileSync(path, "utf8")).toBe("dos");
    expect(readdirSync(join(dir, "current"))).toEqual(["nws.json"]);
  });
});

describe("el sitio no llama a NWS ni al USGS", () => {
  it("ningún archivo del sitio pide datos a esas fuentes", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(join(ROOT, "src"));
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/fetch\(|XMLHttpRequest|EventSource|WebSocket/);
      expect(text, f).not.toMatch(/api\.weather\.gov\/alerts\/active|summary\/all_week\.geojson/);
    }
    expect(existsSync(join(ROOT, "data/raw/fema"))).toBe(false);
  });
});
