import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { buildGeometry, polygonsOf, sha256, type GeoManifest, type RawFeature } from "./pipeline.ts";
import { pointInRing, readDbf, signedArea2, type Ring } from "./shapefile.ts";
import { GEO_ATTRIBUTION, MANIFEST, OUTPUT, PR, RAW_EXTRACT, SIMPLIFY, TIGER } from "./source.ts";
import { douglasPeucker, simplifyTopology } from "./topology.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

type OutFeature = { properties: { id: string; name: string }; geometry: RawFeature["geometry"] };
const manifest = JSON.parse(read(MANIFEST)) as GeoManifest;
const raw = (JSON.parse(read(RAW_EXTRACT)) as { features: RawFeature[] }).features;
const generated = JSON.parse(read(OUTPUT)) as { features: OutFeature[]; source: string; attribution: string };
const out = generated.features;
const census = JSON.parse(read("data/generated/census-municipios.json")) as { municipios: Record<string, { name: string }> };
const parts = (f: { geometry: RawFeature["geometry"] }) => polygonsOf(f as RawFeature);

const MONA: [number, number] = [-67.89, 18.08];
const DESECHEO: [number, number] = [-67.483, 18.383];

describe("78 municipios en la geometría generada", () => {
  it("hay exactamente 78, con GEOID y nombre únicos", () => {
    expect(out).toHaveLength(78);
    expect(new Set(out.map((f) => f.properties.id)).size).toBe(78);
    expect(new Set(out.map((f) => f.properties.name)).size).toBe(78);
  });

  it("cada municipio del Censo tiene geometría, con el mismo nombre", () => {
    const byId = new Map(out.map((f) => [f.properties.id, f.properties.name]));
    for (const [id, { name }] of Object.entries(census.municipios)) expect(byId.get(id), id).toBe(name);
  });

  it("cada geometría corresponde a un municipio del Censo", () => {
    for (const f of out) expect(census.municipios[f.properties.id]?.name, f.properties.id).toBe(f.properties.name);
  });
});

describe("geometría válida", () => {
  const all = out.flatMap((f) => parts(f).map((polygon) => ({ name: f.properties.name, polygon })));

  it("no hay geometrías ni anillos vacíos o colapsados", () => {
    for (const f of out) expect(parts(f).length, f.properties.name).toBeGreaterThan(0);
    for (const { name, polygon } of all) {
      for (const ring of polygon) {
        expect(ring.length, name).toBeGreaterThanOrEqual(4);
        expect(ring[0], name).toEqual(ring[ring.length - 1]);
        expect(signedArea2(ring), name).not.toBe(0);
      }
    }
  });

  it("todas las coordenadas son finitas y están dentro de Puerto Rico", () => {
    const { minLon, minLat, maxLon, maxLat } = PR.bbox;
    for (const { name, polygon } of all) {
      for (const [x, y] of polygon.flat()) {
        expect(Number.isFinite(x) && Number.isFinite(y), name).toBe(true);
        expect(x >= minLon && x <= maxLon && y >= minLat && y <= maxLat, `${name} ${x},${y}`).toBe(true);
      }
    }
  });

  it("los anillos exteriores van en sentido horario, como los espera d3-geo", () => {
    for (const { name, polygon } of all) expect(signedArea2(polygon[0]), name).toBeLessThan(0);
  });

  it("las coordenadas tienen como mucho 5 decimales", () => {
    for (const { polygon } of all.slice(0, 10)) {
      for (const [x, y] of polygon.flat()) {
        expect(Math.round(x * 1e5) / 1e5).toBe(x);
        expect(Math.round(y * 1e5) / 1e5).toBe(y);
      }
    }
  });
});

describe("islas y polígonos de varias partes", () => {
  it("cada municipio conserva el mismo número de partes que en TIGER/Line", () => {
    const rawParts = new Map(raw.map((f) => [f.properties.GEOID, parts(f).length]));
    for (const f of out) expect(parts(f).length, f.properties.name).toBe(rawParts.get(f.properties.id));
    expect(out.filter((f) => parts(f).length > 1).map((f) => f.properties.name)).toEqual(["Mayagüez"]);
  });

  it("Mayagüez incluye Mona y Desecheo, y ningún otro municipio las tiene", () => {
    for (const [label, features] of [
      ["TIGER/Line", raw.map((f) => ({ name: f.properties.NAME, polygons: parts(f) }))],
      ["generada", out.map((f) => ({ name: f.properties.name, polygons: parts(f) }))],
    ] as const) {
      for (const island of [MONA, DESECHEO]) {
        const owners = features.filter((f) => f.polygons.some((p) => pointInRing(island, p[0]))).map((f) => f.name);
        expect(owners, `${label} ${island}`).toEqual(["Mayagüez"]);
      }
      const mayaguez = features.find((f) => f.name === "Mayagüez")!;
      expect(mayaguez.polygons, label).toHaveLength(3);
    }
  });

  it("Culebra y Vieques siguen siendo un polígono cada una", () => {
    for (const name of ["Culebra", "Vieques"]) {
      const f = out.find((item) => item.properties.name === name)!;
      expect(f.geometry.type, name).toBe("Polygon");
    }
  });
});

describe("calidad de la simplificación", () => {
  const { report } = buildGeometry(ROOT);

  it("no crea cruces y ningún municipio cambia más de 1% de área", () => {
    expect(report.crossings).toBe(0);
    expect(report.maxAreaChange).toBeLessThan(0.01);
    expect(report.outputVertices).toBeLessThan(report.rawVertices);
  });

  it("cada segmento es costa (1 municipio) o borde compartido (2): sin huecos ni encimas", () => {
    const owners = new Map<string, Set<string>>();
    for (const f of out) {
      for (const polygon of parts(f)) {
        for (const ring of polygon) {
          for (let i = 0; i < ring.length - 1; i += 1) {
            const a = ring[i].join(",");
            const b = ring[i + 1].join(",");
            const k = a < b ? `${a}|${b}` : `${b}|${a}`;
            if (!owners.has(k)) owners.set(k, new Set());
            owners.get(k)!.add(f.properties.id);
          }
        }
      }
    }
    const counts = [...owners.values()].map((s) => s.size);
    expect(Math.max(...counts)).toBeLessThanOrEqual(2);
    expect(counts.filter((c) => c === 2).length).toBeGreaterThan(1000);
  });

  it("un borde compartido simplificado es idéntico en los dos vecinos", () => {
    // Two squares sharing the edge x = 1, with a wiggly shared border.
    const left: Ring = [[0, 0], [0, 2], [1, 2], [1.001, 1.5], [1, 1], [0.999, 0.5], [1, 0], [0, 0]];
    const right: Ring = [[1, 0], [0.999, 0.5], [1, 1], [1.001, 1.5], [1, 2], [2, 2], [2, 0], [1, 0]];
    const { features } = simplifyTopology([[[left]], [[right]]], 0.01);
    const edge = (ring: Ring) => ring.slice(0, -1).filter(([x]) => x > 0.9 && x < 1.1).map((p) => p.join(",")).sort();
    expect(edge(features[0][0][0])).toEqual(edge(features[1][0][0]));
    // The wiggles are within tolerance, so the shared border becomes the straight edge in both.
    expect(edge(features[0][0][0])).toEqual(["1,0", "1,2"]);
  });

  it("Douglas–Peucker conserva los extremos y da siempre el mismo resultado", () => {
    const line: [number, number][] = Array.from({ length: 50 }, (_, i) => [i, Math.sin(i) * 0.001]);
    const once = douglasPeucker(line, 0.01);
    expect(once[0]).toEqual(line[0]);
    expect(once[once.length - 1]).toEqual(line[49]);
    expect(douglasPeucker(line, 0.01)).toEqual(once);
  });
});

describe("procedencia oficial", () => {
  it("el manifiesto describe la fuente oficial de TIGER/Line 2024", () => {
    expect(manifest.source.vintage).toBe(2024);
    expect(manifest.source.url).toBe(TIGER.url);
    expect(manifest.source.url).toMatch(/^https:\/\/www2\.census\.gov\/geo\/tiger\/TIGER2024\//);
    expect(manifest.source.fileName).toBe("tl_2024_us_county.zip");
    expect(manifest.source.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(manifest.source.bytes).toBeGreaterThan(10_000_000);
    expect(manifest.source.coordinateReferenceSystem).toMatch(/North_American_1983/);
    expect(manifest.extract.features).toBe(78);
    expect(manifest.extract.stateFips).toBe("72");
    expect(manifest.extract.path).toBe(RAW_EXTRACT);
    expect(manifest.source.attribution).toBe(GEO_ATTRIBUTION);
  });

  it("los SHA-256 tienen formato válido y el del extracto coincide con el archivo", () => {
    expect(manifest.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.extract.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const member of Object.values(manifest.source.members)) expect(member.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256(readFileSync(join(ROOT, RAW_EXTRACT)))).toBe(manifest.extract.sha256);
    expect(generated.source).toContain(manifest.source.sha256);
  });

  it("el extracto trae solo Puerto Rico, con los atributos oficiales", () => {
    expect(raw).toHaveLength(78);
    for (const f of raw) {
      expect(f.properties.STATEFP).toBe("72");
      expect(f.properties.GEOID).toBe(`72${f.properties.COUNTYFP}`);
      expect(f.properties.NAMELSAD).toBe(`${f.properties.NAME} Municipio`);
    }
    const vertices = raw.reduce((sum, f) => sum + parts(f).flat().reduce((s, r) => s + r.length, 0), 0);
    expect(vertices).toBe(manifest.extract.vertices);
  });

  it("el archivo generado lleva la atribución del Censo y avisa que no se edita a mano", () => {
    expect(JSON.parse(read(OUTPUT)).generated).toMatch(/NO EDITAR A MANO/);
    expect(generated.attribution).toMatch(/TIGER\/Line®/);
    expect(generated.attribution).toMatch(/no respalda ni certifica/);
    expect(generated.attribution).toMatch(/fines estadísticos/);
  });

  it("la lectura del .dbf no desalinea los registros borrados", () => {
    // Minimal dBASE III: 1 field (NAME, 5 chars), 2 records, the first one deleted.
    const header = Buffer.alloc(32 + 32 + 1);
    header.writeUInt32LE(2, 4);
    header.writeUInt16LE(32 + 32 + 1, 8);
    header.writeUInt16LE(1 + 5, 10);
    header.write("NAME", 32, "latin1");
    header[32 + 16] = 5;
    header[64] = 0x0d;
    const records = Buffer.from("*AAAAA BBBBB", "latin1");
    const rows = readDbf(Buffer.concat([header, records]));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ NAME: "AAAAA", __deleted: "true" });
    expect(rows[1]).toEqual({ NAME: "BBBBB" });
  });
});

describe("reproducible y sin red", () => {
  it("generar dos veces da exactamente los mismos bytes, iguales al archivo del repositorio", () => {
    const a = buildGeometry(ROOT).content;
    const b = buildGeometry(ROOT).content;
    expect(a).toBe(b);
    expect(read(OUTPUT)).toBe(a);
  });

  it("la generación no usa la red", () => {
    for (const file of ["pipeline.ts", "topology.ts", "shapefile.ts", "generate.ts", "source.ts"]) {
      expect(read(`scripts/geo/${file}`), file).not.toMatch(/\bfetch\(|node:https?|node:net/);
    }
  });

  describe("data:check falla si algo no cuadra", () => {
    const temp = mkdtempSync(join(tmpdir(), "geo-check-"));
    const copy = () => {
      const dir = mkdtempSync(join(temp, "root-"));
      cpSync(join(ROOT, "data/raw/geo"), join(dir, "data/raw/geo"), { recursive: true });
      cpSync(join(ROOT, "data/generated"), join(dir, "data/generated"), { recursive: true });
      return dir;
    };
    const check = (dir: string) => {
      try {
        execFileSync(process.execPath, [join(ROOT, "scripts/geo/generate.ts"), "--check", `--root=${dir}`], { stdio: "pipe" });
        return 0;
      } catch (error) {
        return (error as { status: number }).status;
      }
    };
    afterAll(() => rmSync(temp, { recursive: true, force: true }));

    it("pasa con los archivos tal cual", () => {
      expect(check(copy())).toBe(0);
    });

    it("falla si la geometría generada está desactualizada o editada a mano", () => {
      const dir = copy();
      const path = join(dir, OUTPUT);
      writeFileSync(path, readFileSync(path, "utf8").replace(/-66\.\d{5}/, "-66.00000"));
      expect(check(dir)).not.toBe(0);
    });

    it("falla si el extracto crudo no coincide con su SHA-256", () => {
      const dir = copy();
      const path = join(dir, RAW_EXTRACT);
      writeFileSync(path, readFileSync(path, "utf8").replace("Ciales", "Cialez"));
      expect(check(dir)).not.toBe(0);
    });
  });
});

describe("el sitio usa la geometría generada", () => {
  it("el mapa importa la geometría generada", () => {
    expect(read("src/components/explorer/IslandMap.tsx")).toMatch(/data\/generated\/municipios\.geometry\.json/);
  });

  it("los parámetros documentados son los que usa el generador", () => {
    expect(SIMPLIFY.toleranceDegrees).toBe(0.0001);
    expect(SIMPLIFY.precision).toBe(5);
    expect(JSON.parse(read(OUTPUT)).transform).toMatchObject({ toleranceDegrees: 0.0001, precision: 5 });
  });
});
