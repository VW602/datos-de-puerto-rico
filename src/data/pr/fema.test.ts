import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { colorForValue, NEGATIVE_FILL, NO_DATA_FILL } from "../scale";
import {
  ALL,
  FEMA_DISASTERS,
  FEMA_FILTER,
  FEMA_METRIC_IDS,
  femaIsland,
  femaPlaceValues,
  femaValue,
  disasterLabel,
  loadProjects,
} from "./fema";
import { applyLayers } from "./layers";
import { metricGroup, prMetricById } from "./metrics";
import { municipios } from "./places";
import { agencyDisplay } from "./present";
import { isPublicMetric, toPublicPlaces } from "./public";
import { rankByMetric } from "./ranking";
import { publicSourceForMetric } from "./sources";
import { FEMA_MESSAGES } from "@/i18n/messages/fema";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const places = toPublicPlaces(applyLayers(municipios));
const byName = (name: string) => places.find((p) => p.name === name)!;
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("recuperación y desastres en el sitio", () => {
  it("cuatro medidas públicas en su propio grupo, ninguna mezcla programas", () => {
    for (const id of FEMA_METRIC_IDS) {
      expect(isPublicMetric(id), id).toBe(true);
      expect(metricGroup(id)).toBe("Recuperación y desastres");
      expect(prMetricById(id).signed).toBe(true);
      expect(prMetricById(id).label).not.toMatch(/Dinero FEMA|Fondos FEMA/);
    }
    expect(prMetricById("femaPaObligated").hint).toMatch(/Obligado no quiere decir gastado/);
    expect(prMetricById("femaIhpApproved").hint).toMatch(/Aprobado no quiere decir pagado/);
  });

  it("el mapa pinta solo lo atribuible: el valor de cada municipio es su suma de FEMA, sin «Statewide»", () => {
    for (const place of places) {
      const v = femaPlaceValues(place.id);
      for (const id of FEMA_METRIC_IDS) expect(place.values[id], `${place.name} ${id}`).toBe(v[id]);
    }
    const sj = byName("San Juan");
    const island = femaIsland("paObligated");
    expect(sj.values.femaPaObligated!).toBeLessThan(island.PUERTO_RICO_STATEWIDE!);
  });

  it("San Juan, Ponce, Bayamón, Mayagüez, Vieques y Culebra tienen su Asistencia Pública", () => {
    for (const name of ["San Juan", "Ponce", "Bayamón", "Mayagüez", "Vieques", "Culebra"]) {
      expect(typeof byName(name).values.femaPaObligated, name).toBe("number");
    }
  });

  it("filtrar por desastre cambia las cifras y la suma de los desastres da el total", () => {
    const id = byName("Utuado").id;
    const total = femaValue(id, "paObligated", ALL)!;
    const parts = FEMA_FILTER.filter((k) => k !== ALL).reduce(
      (a, k) => a + (femaValue(id, "paObligated", k) ?? 0),
      0,
    );
    expect(Math.abs(parts - total)).toBeLessThan(1);
    expect(femaValue(id, "paObligated", "4339")).not.toBe(total);
    expect(disasterLabel("4339")).toMatch(/^DR-4339-PR · HURRICANE MARIA \(2017\)$/);
    expect(FEMA_FILTER[0]).toBe(ALL);
    // Newest disasters first, as the source dates them.
    const dates = FEMA_DISASTERS.filter((d) => d.declarationDate).map((d) => d.declarationDate!);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("el ranking va de mayor a menor y deja fuera lo que falta", () => {
    for (const id of FEMA_METRIC_IDS) {
      const ranking = rankByMetric(places, id, prMetricById(id).scale);
      for (let i = 1; i < ranking.ranked.length; i++)
        expect(ranking.ranked[i - 1].values[id]!).toBeGreaterThanOrEqual(
          ranking.ranked[i].values[id]!,
        );
      expect(ranking.ranked.every((p) => p.values[id] != null)).toBe(true);
    }
  });

  it("un neto negativo de FEMA no es $0 ni «sin dato» en el mapa", () => {
    expect(colorForValue(-5_000, 1000, 1e9, "log", prMetricById("femaPaObligated").signed)).toBe(
      NEGATIVE_FILL,
    );
    expect(colorForValue(null, 1000, 1e9, "log", true)).toBe(NO_DATA_FILL);
  });

  it("los proyectos se cargan aparte, por desastre, y respetan «Statewide»", async () => {
    const rows = await loadProjects("4339");
    expect(rows.length).toBeGreaterThan(10000);
    for (const r of rows) {
      if (r.geo === "S") expect(r.municipio).toBeNull();
      // Public Assistance rows carry the applicant's municipio, never a project-location "A".
      expect(r.geo).not.toBe("A");
      if (r.geo === "P") expect(r.municipio).toMatch(/^72\d{3}$/);
    }
    const sj = rows
      .filter((r) => r.geo === "P" && r.municipio === "72127")
      .reduce((a, r) => a + (r.federalShareObligated ?? 0), 0);
    expect(Math.abs(sj - femaValue("72127", "paObligated", "4339")!)).toBeLessThan(1);
    expect(await loadProjects(ALL)).toEqual([]);
  });

  it("la procedencia nombra a FEMA y OpenFEMA, con versión, enlace y aviso", () => {
    for (const id of FEMA_METRIC_IDS) {
      const record = publicSourceForMetric(id)!;
      expect(record.datasetId, id).toMatch(/^openfema-/);
      expect(record.sourceAgency).toMatch(/^Federal Emergency Management Agency/);
      expect(record.sourceURL).toMatch(/^https:\/\/www\.fema\.gov\/openfema-data-page\//);
      expect(record.attribution).toContain("not endorsed by FEMA");
      expect(record.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.sourceTitle).toMatch(/v\d/);
    }
    expect(agencyDisplay("Federal Emergency Management Agency (FEMA), OpenFEMA").from).toBe(
      "la Agencia Federal para el Manejo de Emergencias (FEMA)",
    );
  });

  it("el sitio nunca llama a OpenFEMA: solo lee archivos generados", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(ROOT, "src"));
    for (const file of files)
      expect(readFileSync(file, "utf8"), file).not.toMatch(/fema\.gov\/api|api\/open/);
  });

  it("FEMA y USAspending nunca se suman: sus módulos no se importan entre sí", () => {
    for (const file of ["src/data/pr/fema.ts", "src/components/explorer/FemaDetail.tsx"]) {
      expect(read(file), file).not.toMatch(/from "(\.\/funds|@\/data\/pr\/funds|\.\/FundsDetail)"/);
    }
    for (const file of ["src/data/pr/funds.ts", "src/components/explorer/FundsDetail.tsx"]) {
      expect(read(file), file).not.toMatch(/from "(\.\/fema|@\/data\/pr\/fema|\.\/FemaDetail)"/);
    }
    // No combined "federal + FEMA" figure anywhere in the UI copy.
    for (const file of [
      "src/components/explorer/FemaDetail.tsx",
      "src/components/explorer/FundsDetail.tsx",
      "src/components/explorer/Summary.tsx",
    ]) {
      expect(read(file)).not.toMatch(
        /fedObligations\s*\+|femaPaObligated\s*\+|Dinero FEMA|Fondos FEMA/,
      );
    }
    expect(read("src/components/explorer/FemaDetail.tsx")).toMatch(/\{t\.notAdded\}/);
    expect(FEMA_MESSAGES.es.island.notAdded).toMatch(/El sitio no las suma/);
    expect(FEMA_MESSAGES.en.island.notAdded).toMatch(/does not add them together/);
  });

  it("Asistencia Pública se describe por el municipio del solicitante, nunca como dinero del lugar", () => {
    for (const id of ["femaPaObligated", "femaPaProjects"] as const) {
      const m = prMetricById(id);
      expect(m.label, id).toMatch(/municipio del solicitante/);
      expect(m.hint, id).toMatch(/necesariamente el (de la obra|lugar de la obra)/i);
    }
    for (const id of ["femaPaObligated", "femaPaProjects"] as const) {
      const m = prMetricById(id, "en");
      expect(m.label, id).toMatch(/by applicant's municipio/);
      expect(m.hint, id).toMatch(/not necessarily where the work is/i);
    }
    const es = FEMA_MESSAGES.es;
    const en = FEMA_MESSAGES.en;
    expect(es.municipio.paHeading("Ponce")).toMatch(/solicitantes ubicados en Ponce/);
    expect(en.municipio.paHeading("Ponce")).toMatch(/applicants located in Ponce/);
    for (const text of [JSON.stringify(es), JSON.stringify(en)])
      expect(text).not.toMatch(
        /proyectos con este municipio|Fondos de proyectos en|projects in this municipio/,
      );
    expect(es.places.publicAssistance).toMatch(/ubicación de quien solicita/);
    expect(en.places.publicAssistance).toMatch(/where the applicant is located/);
    expect(read("src/components/explorer/SourcePanel.tsx")).toMatch(/t\.places\.publicAssistance/);
  });

  it("las etiquetas de hogares dicen lo que dice FEMA: un registro válido no es una aprobación", () => {
    const detail = read("src/components/explorer/FemaDetail.tsx");
    // Each label sits next to the FEMA field it describes, in both languages.
    expect(detail).toMatch(/label=\{t\.ihpValid\}\s+note=\{t\.ihpValidNote\}/);
    expect(detail).toMatch(/label=\{t\.ihpApplicants\}\s+note="approvedForFemaAssistance"/);
    expect(detail).toMatch(/label=\{t\.ihpApproved\}\s+note=\{t\.ihpApprovedNote\}/);
    const es = FEMA_MESSAGES.es.municipio;
    const en = FEMA_MESSAGES.en.municipio;
    // validRegistrations is labelled as valid, with an explicit "not approved".
    expect(es.ihpValid).toBe("Registros válidos");
    expect(es.ihpValidNote).toBe(
      "validRegistrations: registros que FEMA acepta como válidos; no quiere decir aprobados",
    );
    expect(en.ihpValid).toBe("Valid registrations");
    expect(en.ihpValidNote).toMatch(/^validRegistrations: .*this does not mean approved$/);
    for (const label of [es.ihpValid, en.ihpValid]) expect(label).not.toMatch(/aprobad|approved/i);
    // approvedForFemaAssistance and totalApprovedIhpAmount are the approved fields.
    expect(es.ihpApplicants).toBe("Solicitantes aprobados para IHP");
    expect(es.ihpApproved).toBe("Monto aprobado bajo IHP");
    expect(es.ihpApprovedNote).toMatch(/^totalApprovedIhpAmount/);
    expect(en.ihpApproved).toBe("Amount approved under IHP");
    expect(en.ihpApprovedNote).toMatch(/^totalApprovedIhpAmount.*approved does not mean paid$/);
    expect(prMetricById("femaIhpApproved").hint).toMatch(/Aprobado no quiere decir pagado/);
    expect(prMetricById("femaIhpApproved", "en").hint).toMatch(/Approved does not mean paid/);
  });

  it("CDBG-DR no aparece como dinero de FEMA", () => {
    expect(read("src/components/explorer/FemaDetail.tsx")).not.toMatch(/CDBG/);
    expect(read("data/generated/fema-pr.json")).not.toMatch(/14\.228|CDBG/);
  });
});
