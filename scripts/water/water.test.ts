import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { freshness } from "../../src/data/pr/currentModel";
import { stationPlace, stationState, valueWithUnit } from "../../src/data/pr/waterModel";
import { validateWater } from "./check.ts";
import {
  buildData,
  covers,
  normalizeWater,
  recordWaterFailure,
  seriesFile,
  stableSeriesJson,
  stableWaterJson,
  waterSnapshot,
  type SeriesFile,
  type WaterRaw,
  type WaterSnapshot,
} from "./normalize.ts";
import {
  API_BASE,
  ELEVATION_PREFERENCE,
  OBSERVATION_FIELDS,
  PARAMETERS,
  STATION_FIELDS,
  STATION_FRESHNESS,
  WATER,
  WATER_FRESHNESS,
  WATER_OUTPUT,
  WATER_SERIES_OUTPUT,
} from "./source.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const fx = (name: string) =>
  JSON.parse(read(`scripts/water/fixtures/${name}.json`)) as {
    retrievedAt: string;
    features: WaterRaw["latest"];
  };
const IDS = new Set(
  Object.keys(
    (JSON.parse(read("data/generated/census-municipios.json")) as { municipios: object })
      .municipios,
  ),
);
const RETRIEVED = fx("latest").retrievedAt;
const raw = (): WaterRaw => ({
  latest: fx("latest").features,
  meta: fx("meta").features,
  locations: fx("locations").features,
  continuous: fx("continuous").features,
});
const REQUESTS = [
  {
    name: "latest",
    page: 0,
    url: `${API_BASE}/latest-continuous/items`,
    sha256: "a".repeat(64),
    bytes: 1,
    required: true,
  },
  {
    name: "locations",
    page: 0,
    url: `${API_BASE}/monitoring-locations/items`,
    sha256: "b".repeat(64),
    bytes: 1,
    required: true,
  },
  {
    name: "meta",
    page: 0,
    url: `${API_BASE}/time-series-metadata/items`,
    sha256: "c".repeat(64),
    bytes: 1,
    required: true,
  },
  {
    name: "continuous",
    page: 0,
    url: `${API_BASE}/continuous/items`,
    sha256: "d".repeat(64),
    bytes: 1,
    required: false,
  },
] as const;
function build(input = raw(), retrievedAt = RETRIEVED) {
  const n = normalizeWater(input, retrievedAt, IDS);
  const snap = waterSnapshot({
    retrievedAt,
    lastAttempt: { at: retrievedAt, ok: true, error: null },
    requests: input.continuous ? [...REQUESTS] : REQUESTS.slice(0, 3),
    seriesOk: input.continuous !== null,
    data: buildData(n),
  });
  return { n, snap, series: seriesFile(snap, n.series ?? {}) };
}
const obs = (snap: WaterSnapshot, site: string, code: string) =>
  snap.data.observations.find((o) => o.stationId === site && o.parameterCode === code);
const after = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60000);

describe("source: official USGS Water Data API", () => {
  it("uses the modernized OGC API V1, not the legacy WaterServices", () => {
    expect(API_BASE).toBe("https://api.waterdata.usgs.gov/ogcapi/v1/collections");
    expect(JSON.stringify(WATER)).not.toMatch(/waterservices\.usgs\.gov|nwis\/iv/);
    expect(WATER.docs).toBe("https://api.waterdata.usgs.gov/docs/ogcapi/");
    expect(WATER.provisional).toBe("https://waterdata.usgs.gov/provisional-data-statement/");
    expect(WATER.attribution).toMatch(/U\.S\. Geological Survey/);
    expect(WATER.attribution).toMatch(/provisionales sujetos a revisión/);
  });

  it("keeps the exact official parameter meanings, units and statistics", () => {
    const byCode = Object.fromEntries(PARAMETERS.map((p) => [p.code, p]));
    expect(byCode["00060"]).toMatchObject({
      unit: "ft^3/s",
      statisticId: "00011",
      kind: "DISCHARGE",
    });
    expect(byCode["00065"]).toMatchObject({
      unit: "ft",
      statisticId: "00011",
      kind: "GAGE_HEIGHT",
    });
    expect(byCode["00045"]).toMatchObject({
      unit: "in",
      statisticId: null,
      computation: "Decumulated",
    });
    expect(ELEVATION_PREFERENCE[0]).toBe("72379");
    // Out of scope: groundwater, stream elevation, gate openings, water quality.
    for (const code of ["72019", "72232", "72365", "45592", "00010", "00300"])
      expect(byCode[code]).toBeUndefined();
  });

  it("source freshness keeps the four snapshot states", () => {
    const t = WATER_FRESHNESS;
    expect(freshness(null, new Date(), t)).toBe("UNAVAILABLE");
    expect(freshness(RETRIEVED, after(RETRIEVED, 30), t)).toBe("CURRENT");
    expect(freshness(RETRIEVED, after(RETRIEVED, 120), t)).toBe("AGING");
    expect(freshness(RETRIEVED, after(RETRIEVED, 600), t)).toBe("STALE");
  });

  it("a failed update keeps the last known good snapshot, never zero stations", () => {
    const { snap } = build();
    const failed = recordWaterFailure(snap, {
      at: after(RETRIEVED, 60).toISOString(),
      ok: false,
      error: "HTTP 503 (2 intentos)",
    });
    expect(failed.retrievedAt).toBe(RETRIEVED);
    expect(failed.data).toEqual(snap.data);
    expect(failed.contentSha256).toBe(snap.contentSha256);
    expect(failed.lastAttempt).toMatchObject({ ok: false, error: "HTTP 503 (2 intentos)" });
    const never = recordWaterFailure(null, { at: RETRIEVED, ok: false, error: "timeout" });
    expect(never.retrievedAt).toBeNull();
    expect(never.data.observations).toEqual([]);
    expect(() => validateWater(never, null, IDS)).not.toThrow();
  });

  it("an optional 24-hour failure still publishes current values, without series or trends", () => {
    const { snap, series } = build({ ...raw(), continuous: null });
    expect(snap.provenance.series).toBe("UNAVAILABLE");
    expect(snap.data.observations.length).toBeGreaterThan(0);
    expect(snap.data.observations.every((o) => o.trend === null && o.rain24h === null)).toBe(true);
    expect(() => validateWater(snap, series, IDS)).not.toThrow();
  });
});

describe("sites", () => {
  const { snap } = build();
  const stations = snap.data.siteInventory.stations;

  it("unique USGS site IDs with coordinates in Puerto Rico and the allowlisted fields", () => {
    expect(new Set(stations.map((s) => s.id)).size).toBe(stations.length);
    for (const s of stations) {
      expect(s.id).toMatch(/^USGS-\d{8,15}$/);
      expect(Object.keys(s)).toEqual([...STATION_FIELDS]);
      expect(s.latitude).toBeGreaterThan(17.8);
      expect(s.longitude).toBeLessThan(-65.1);
      expect(s.url).toBe(`https://waterdata.usgs.gov/monitoring-location/${s.id}/`);
    }
  });

  it("classifies by the official USGS site type; other types are excluded with a reason", () => {
    expect(obs(snap, "USGS-50136400", "00060")!.view).toBe("RIOS");
    expect(obs(snap, "USGS-50999964", "00045")!.view).toBe("LLUVIA");
    expect(obs(snap, "USGS-50020100", "72379")!.view).toBe("EMBALSES");
    const diversion = snap.data.exclusions.listed.filter((e) => e.stationId === "USGS-50093090");
    expect(diversion.map((e) => e.reason)).toEqual([
      "SITE_TYPE_OUT_OF_SCOPE",
      "SITE_TYPE_OUT_OF_SCOPE",
    ]);
  });

  it("municipio comes from USGS site metadata and means where the station is, not the municipio's conditions", () => {
    expect(stations.find((s) => s.id === "USGS-50136400")!.municipio).toBe("72067"); // Hormigueros
    expect(stationPlace("Ponce")).toBe("Estación ubicada en Ponce");
    expect(stationPlace("Ponce")).not.toMatch(/condiciones|todo/i);
  });
});

describe("series selection", () => {
  it("is deterministic whatever order the API returns", () => {
    const a = build();
    const shuffled = raw();
    shuffled.latest = [...shuffled.latest].reverse();
    shuffled.meta = [...shuffled.meta].reverse();
    shuffled.locations = [...shuffled.locations].reverse();
    shuffled.continuous = [...shuffled.continuous!].reverse();
    const b = build(shuffled);
    expect(stableWaterJson(b.snap)).toBe(stableWaterJson(a.snap));
    expect(stableSeriesJson(b.series)).toBe(stableSeriesJson(a.series));
  });

  it("ignores an inactive historic series next to the active one", () => {
    const { snap } = build();
    expect(obs(snap, "USGS-50011000", "00060")!.valueText).toBe("50.6");
    expect(snap.data.exclusions.counts.INACTIVE).toBeGreaterThan(0);
  });

  it("excludes two active series of one parameter instead of choosing one (Lago Guerrero)", () => {
    const { snap } = build();
    const e = snap.data.exclusions.listed.find((x) => x.reason === "AMBIGUOUS_DUPLICATE")!;
    expect(e.stationId).toBe("USGS-182827067040500");
    expect(e.timeSeriesIds).toHaveLength(2);
    expect(e.detail).toMatch(/124\.11/);
    expect(e.detail).toMatch(/407\.19/);
    expect(obs(snap, "USGS-182827067040500", "72379")).toBeUndefined();
    // Its gage height, a different parameter, is still published.
    expect(obs(snap, "USGS-182827067040500", "00065")!.valueText).toBe("409.20");
  });

  it("excludes two active discharge series at one site instead of choosing one", () => {
    const twin = raw();
    const flow = twin.latest.find(
      (f) =>
        f.properties?.monitoring_location_id === "USGS-50136400" &&
        f.properties?.parameter_code === "00060",
    )!;
    const tsid = String(flow.properties!.time_series_id);
    const metaOf = twin.meta.find((f) => f.id === tsid)!;
    twin.latest = [
      ...twin.latest,
      { ...flow, properties: { ...flow.properties, time_series_id: "test-twin", value: "61.0" } },
    ];
    twin.meta = [...twin.meta, { ...metaOf, id: "test-twin" }];
    const { snap } = build(twin);
    expect(obs(snap, "USGS-50136400", "00060")).toBeUndefined();
    const e = snap.data.exclusions.listed.find(
      (x) => x.stationId === "USGS-50136400" && x.parameterCode === "00060",
    )!;
    expect(e.reason).toBe("AMBIGUOUS_DUPLICATE");
    expect(e.timeSeriesIds).toEqual([tsid, "test-twin"].sort());
    // The gage height at the same site is unaffected.
    expect(obs(snap, "USGS-50136400", "00065")!.valueText).toBe("1.79");
  });

  it("shows one reservoir elevation (PRVD02, feet) and counts the other datums and units", () => {
    const { snap } = build();
    const lago = snap.data.observations.filter((o) => o.stationId === "USGS-50020100");
    expect(lago.map((o) => o.parameterCode)).toEqual(["72379"]);
    expect(lago[0]).toMatchObject({ unit: "ft", datum: "PRVD02", kind: "RESERVOIR_ELEVATION" });
    expect(snap.data.exclusions.counts.ALTERNATE_DATUM_OR_UNIT).toBe(3);
  });

  it("excludes a series whose unit or computation is not the official one", () => {
    const { snap } = build();
    expect(
      snap.data.exclusions.listed.find((e) => e.stationId === "USGS-99999999005"),
    ).toMatchObject({
      reason: "METADATA_MISMATCH",
    });
    const cumulative = raw();
    cumulative.meta = cumulative.meta.map((f) =>
      f.id && String(f.properties?.parameter_code) === "00045"
        ? { ...f, properties: { ...f.properties, computation_identifier: "Cumulative" } }
        : f,
    );
    const b = build(cumulative);
    expect(b.snap.data.observations.filter((o) => o.kind === "PRECIPITATION")).toEqual([]);
  });
});

describe("observations", () => {
  const { snap } = build();

  it("observation time is the station's own time, not the retrieval time", () => {
    for (const o of snap.data.observations) expect(o.observedAt).not.toBe(RETRIEVED);
    expect(obs(snap, "USGS-50136400", "00060")!.observedAt).toBe("2026-10-10T20:30:00.000Z");
  });

  it("keeps the USGS approval status and qualifiers", () => {
    expect(obs(snap, "USGS-50136400", "00060")!.approval).toBe("Provisional");
    expect(obs(snap, "USGS-50148890", "00060")!.qualifiers).toEqual(["RATINGDEV"]);
  });

  it("a measured zero is zero; a missing value is NO_DATA, never zero", () => {
    const dry = obs(snap, "USGS-50129254", "00060")!;
    expect(dry).toMatchObject({ value: 0, valueText: "0.00", qualifiers: ["DRY"] });
    expect(stationState(dry, after(dry.observedAt, 10), STATION_FRESHNESS)).toBe("CURRENT");
    expect(valueWithUnit(dry.valueText, dry.unit)).toBe("0.00 ft³/s");
    const missing = obs(snap, "USGS-99999999001", "00045")!;
    expect(missing.value).toBeNull();
    expect(stationState(missing, after(missing.observedAt, 10), STATION_FRESHNESS)).toBe("NO_DATA");
    expect(valueWithUnit(missing.valueText, missing.unit)).toBe("sin dato");
    expect(obs(snap, "USGS-50999963", "00045")!.rain24h!.totalText).toBe("0.00");
  });

  it("a negative value is kept and flagged for investigation, not clamped", () => {
    const neg = obs(snap, "USGS-99999999002", "00045")!;
    expect(neg.value).toBe(-0.01);
    expect(neg.flags).toEqual(["NEGATIVE_PRECIPITATION"]);
  });

  it("rejects future observations and repeated series", () => {
    expect(obs(snap, "USGS-99999999004", "00060")).toBeUndefined();
    expect(snap.data.exclusions.listed.some((e) => e.reason === "FUTURE_OBSERVATION")).toBe(true);
    const dup = raw();
    dup.latest = [...dup.latest, dup.latest[0]!];
    expect(() => normalizeWater(dup, RETRIEVED, IDS)).toThrow(/aparece dos veces/);
  });

  it("station freshness comes from each observation's own time", () => {
    const stale = obs(snap, "USGS-99999999006", "00060")!;
    expect(stationState(stale, new Date(RETRIEVED), STATION_FRESHNESS)).toBe("STALE");
    expect(snap.stationFreshness.atRetrieval.RIOS.STALE).toBe(1);
    expect(snap.stationFreshness.atRetrieval.RIOS.NO_DATA).toBe(2);
  });
});

describe("streamflow and gage height", () => {
  const { snap } = build();
  it("discharge and gage height are separate series with their own units", () => {
    const flow = obs(snap, "USGS-50136400", "00060")!;
    const gage = obs(snap, "USGS-50136400", "00065")!;
    expect(flow.kind).toBe("DISCHARGE");
    expect(gage.kind).toBe("GAGE_HEIGHT");
    expect(flow.unit).toBe("ft^3/s");
    expect(gage.unit).toBe("ft");
    expect(flow.timeSeriesId).not.toBe(gage.timeSeriesId);
  });
  it("trend is a factual change over 3 hours at the published precision", () => {
    const flow = obs(snap, "USGS-50136400", "00060")!;
    expect(flow.trend!.hours).toBe(3);
    expect(flow.trend!.fromAt).toBe("2026-10-10T17:30:00.000Z");
    expect(["UP", "DOWN", "SAME"]).toContain(flow.trend!.direction);
    expect(Number(flow.valueText) - Number(flow.trend!.fromValueText)).toBeCloseTo(
      Number(flow.trend!.deltaText),
      6,
    );
  });
  it("no flood, danger or normal/high categories anywhere in the snapshot", () => {
    const measures = JSON.stringify(snap.data.observations);
    expect(measures).not.toMatch(
      /\b(flood|danger|unsafe|emergency|peligro|normal|high|alto|inundaci\w*)\b/i,
    );
  });
});

describe("precipitation", () => {
  const { snap, series } = build();
  it("24-hour total only when the 15-minute increments cover the whole window", () => {
    const full = obs(snap, "USGS-50999964", "00045")!;
    expect(full.rain24h).toMatchObject({ complete: true, totalText: "0.43" });
    expect(full.rain24h!.to).toBe(full.observedAt);
    const gap = obs(snap, "USGS-99999999003", "00045")!;
    expect(gap.rain24h).toMatchObject({ complete: false, totalText: null });
    expect(covers([0, 900_000, 1_800_000], 0, 1_800_000, 1_800_000)).toBe(true);
    expect(covers([0, 3_600_000], 0, 3_600_000, 1_800_000)).toBe(false);
  });
  it("precipitation is never mixed with other series, and has no trend", () => {
    for (const o of snap.data.observations.filter((x) => x.kind === "PRECIPITATION")) {
      expect(o.trend).toBeNull();
      expect(series.series[o.timeSeriesId]?.kind ?? "SUM").toBe("SUM");
    }
    expect(Object.keys(snap.data)).not.toContain("islandRainTotal");
  });
});

describe("reservoirs", () => {
  it("never a percent full or capacity", () => {
    const { snap } = build();
    const data = JSON.stringify(snap.data).replace(/"url":"[^"]*"/g, "");
    expect(data).not.toMatch(/percent|capacity|capacidad|lleno|%/i);
    for (const o of snap.data.observations) expect(Object.keys(o)).toEqual([...OBSERVATION_FIELDS]);
  });
});

describe("published snapshot", () => {
  const snap = JSON.parse(read(WATER_OUTPUT)) as WaterSnapshot;
  const series = JSON.parse(read(WATER_SERIES_OUTPUT)) as SeriesFile;

  it("validates, with series that belong to it", () => {
    expect(() => validateWater(snap, series, IDS)).not.toThrow();
    expect(series.snapshotContentSha256).toBe(snap.contentSha256);
  });

  it("rejects tampering", () => {
    const clone = () => JSON.parse(JSON.stringify(snap)) as WaterSnapshot;
    const changed = clone();
    changed.data.observations[0]!.valueText = "999999";
    expect(() => validateWater(changed, series, IDS)).toThrow();
    const future = clone();
    future.data.observations[0]!.observedAt = after(snap.retrievedAt!, 600).toISOString();
    expect(() => validateWater(future, series, IDS)).toThrow();
    const extra = clone();
    (extra.data.observations[0] as unknown as Record<string, unknown>).percentFull = 50;
    expect(() => validateWater(extra, series, IDS)).toThrow();
    const wrongSeries = { ...series, snapshotContentSha256: "0".repeat(64) };
    expect(() => validateWater(snap, wrongSeries, IDS)).toThrow(/no corresponde/);
  });

  it("normalizing the fixtures twice gives identical bytes", () => {
    expect(stableWaterJson(build().snap)).toBe(stableWaterJson(build().snap));
  });

  it("raw API responses stay out of the repository", () => {
    expect(read(".gitignore")).toMatch(/^\.cache\/$/m);
    const files = readdirSync(join(ROOT, "data/current"));
    expect(files.sort()).toEqual([
      "nws.json",
      "usgs-earthquakes.json",
      "usgs-water-series.json",
      "usgs-water.json",
    ]);
    expect(statSync(join(ROOT, WATER_OUTPUT)).size).toBeLessThan(400_000);
    expect(existsSync(join(ROOT, "data/raw/fema"))).toBe(false);
  });
});
