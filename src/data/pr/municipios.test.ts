import { describe, expect, it } from "vitest";
import geometry from "../../../data/generated/municipios.geometry.json";
import { municipios } from "./places";

const ids = municipios.map((place) => place.id);
const names = municipios.map((place) => place.name);

describe("los 78 municipios", () => {
  it("son exactamente 78", () => {
    expect(municipios).toHaveLength(78);
  });

  it("tienen identificadores únicos con forma de código FIPS de Puerto Rico", () => {
    expect(new Set(ids).size).toBe(78);
    for (const id of ids) expect(id).toMatch(/^72\d{3}$/);
  });

  it("tienen nombres válidos, sin espacios sobrantes y sin repetir", () => {
    for (const name of names) {
      expect(name.trim()).toBe(name);
      expect(name.length).toBeGreaterThan(1);
    }
    const folded = names.map((name) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());
    expect(new Set(folded).size).toBe(78);
  });
});

describe("las capas se unen a los municipios", () => {
  it("la geometría tiene un polígono por municipio, con el mismo id y nombre", () => {
    const features = (geometry as unknown as GeoJSON.FeatureCollection).features;
    expect(features).toHaveLength(78);
    const byId = new Map(municipios.map((place) => [place.id, place.name]));
    for (const feature of features) {
      const props = feature.properties as { id: string; name: string };
      expect(byId.get(props.id)).toBe(props.name);
    }
  });
});

describe("las cifras base cuadran entre sí", () => {
  it("la población es igual a hombres más mujeres, y los grupos de edad suman lo mismo", () => {
    for (const place of municipios) {
      expect(place.male + place.female, place.name).toBe(place.values.population);
      const ages = place.ages.reduce((sum, band) => sum + band.male + band.female, 0);
      expect(ages, place.name).toBe(place.values.population);
    }
  });

  it("la tasa de muertes de tránsito sale de las muertes de FARS y la población del ACS", () => {
    for (const place of municipios) {
      const rate = (place.trafficDeaths / 2 / place.values.population!) * 100_000;
      expect(Math.abs(rate - place.values.traffic!), place.name).toBeLessThanOrEqual(0.005);
    }
    expect(municipios.reduce((sum, place) => sum + place.trafficDeaths, 0)).toBe(271 + 307);
  });
});
