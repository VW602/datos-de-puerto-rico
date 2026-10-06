/**
 * Minimal, dependency-free readers for the pieces of a TIGER/Line shapefile
 * ZIP this project needs: the ZIP container, the .dbf attribute table and the
 * .shp polygon records. Only node:zlib is used.
 */

import { inflateRawSync } from "node:zlib";

/** Reads every member of a ZIP archive (stored or deflated). */
export function unzip(archive: Buffer): Map<string, Buffer> {
  const eocd = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("ZIP sin directorio central");
  const count = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP: entrada del directorio central dañada");
    const method = archive.readUInt16LE(offset + 10);
    const compressed = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const local = archive.readUInt32LE(offset + 42);
    const name = archive.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (archive.readUInt32LE(local) !== 0x04034b50) throw new Error(`ZIP: encabezado local dañado (${name})`);
    const dataStart = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const raw = archive.subarray(dataStart, dataStart + compressed);
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null;
    if (!data) throw new Error(`ZIP: método de compresión ${method} no soportado (${name})`);
    if (data.length !== size) throw new Error(`ZIP: tamaño inesperado para ${name}`);
    out.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

export type DbfRow = Record<string, string> & { __deleted?: "true" };

/**
 * dBASE III table. TIGER/Line declares UTF-8 in its .cpg file. Rows stay
 * aligned with the .shp records: a deleted record is returned with
 * `__deleted: "true"` instead of being skipped, so callers filter it out
 * without shifting attributes onto the wrong polygon.
 */
export function readDbf(dbf: Buffer, encoding: BufferEncoding = "utf8"): DbfRow[] {
  const records = dbf.readUInt32LE(4);
  const headerLength = dbf.readUInt16LE(8);
  const recordLength = dbf.readUInt16LE(10);
  const fields: { name: string; length: number }[] = [];
  for (let o = 32; dbf[o] !== 0x0d; o += 32) {
    const name = dbf.toString("latin1", o, o + 11).replace(/\0.*$/, "");
    fields.push({ name, length: dbf[o + 16] });
  }
  const rows: DbfRow[] = [];
  for (let r = 0; r < records; r += 1) {
    let o = headerLength + r * recordLength;
    const deleted = dbf[o] === 0x2a;
    o += 1;
    const row: DbfRow = {};
    for (const field of fields) {
      row[field.name] = dbf.toString(encoding, o, o + field.length).trim();
      o += field.length;
    }
    if (deleted) row.__deleted = "true";
    rows.push(row);
  }
  return rows;
}

export type Ring = [number, number][];

/** Polygon records (shape type 5): one list of rings per record, as stored. */
export function readShpPolygons(shp: Buffer): Ring[][] {
  if (shp.readInt32BE(0) !== 9994) throw new Error("No es un archivo .shp");
  const shapeType = shp.readInt32LE(32);
  if (shapeType !== 5) throw new Error(`Se esperaba tipo de forma 5 (polígono); es ${shapeType}`);
  const out: Ring[][] = [];
  let o = 100;
  while (o < shp.length) {
    const length = shp.readInt32BE(o + 4) * 2;
    const content = o + 8;
    const type = shp.readInt32LE(content);
    if (type === 0) {
      out.push([]);
    } else {
      if (type !== 5) throw new Error(`Registro con tipo ${type}`);
      const parts = shp.readInt32LE(content + 36);
      const points = shp.readInt32LE(content + 40);
      const starts: number[] = [];
      for (let i = 0; i < parts; i += 1) starts.push(shp.readInt32LE(content + 44 + 4 * i));
      const base = content + 44 + 4 * parts;
      const rings: Ring[] = [];
      for (let i = 0; i < parts; i += 1) {
        const end = i + 1 < parts ? starts[i + 1] : points;
        const ring: Ring = [];
        for (let k = starts[i]; k < end; k += 1) {
          ring.push([shp.readDoubleLE(base + 16 * k), shp.readDoubleLE(base + 16 * k + 8)]);
        }
        rings.push(ring);
      }
      out.push(rings);
    }
    o = content + length;
  }
  return out;
}

/** Twice the signed area (shoelace) in coordinate units; negative = clockwise. */
export function signedArea2(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum;
}

export function pointInRing(point: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Groups shapefile rings into polygons the way the format defines them:
 * clockwise rings are outer boundaries, counter-clockwise rings are holes of
 * the outer ring that contains them. Ring orientation is kept as published
 * (clockwise outer rings, which is also what d3-geo expects).
 */
export function toPolygons(rings: Ring[]): Ring[][] {
  const outers = rings.filter((ring) => signedArea2(ring) < 0).map((ring) => [ring]);
  for (const hole of rings.filter((ring) => signedArea2(ring) > 0)) {
    const owner = outers.find((polygon) => pointInRing(hole[0], polygon[0]));
    if (!owner) throw new Error("Hueco sin polígono que lo contenga");
    owner.push(hole);
  }
  if (outers.length === 0) throw new Error("Registro sin anillo exterior");
  return outers;
}
