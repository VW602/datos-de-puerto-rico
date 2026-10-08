/**
 * PUBLIC-SAFE EXTRACT of OpenFEMA responses.
 *
 * The exact bytes OpenFEMA returns stay only in the git-ignored local cache
 * (.cache/fema/raw). What the repository keeps is an extract: the same
 * records and values, but only the fields on the allowlists below. It is NOT
 * the original response and never claims to be; the manifest records the
 * SHA-256 of the original bytes next to the SHA-256 of the extract.
 *
 * Left out on purpose: free-text project titles (they sometimes name
 * families next to a road), recipient and subrecipient names, addresses,
 * contact e-mails in catalog entries, internal hashes and system IDs, and
 * every field the generator does not use.
 */

import { DATASETS, type DatasetKey } from "./source.ts";

/** Fields kept per dataset, in this order. Any other field is dropped. */
export const EXTRACT_FIELDS: Record<DatasetKey, readonly string[]> = {
  declarations: [
    "id",
    "disasterNumber",
    "femaDeclarationString",
    "state",
    "fipsStateCode",
    "fipsCountyCode",
    "designatedArea",
    "declarationType",
    "declarationTitle",
    "incidentType",
    "declarationDate",
    "incidentBeginDate",
    "incidentEndDate",
    "disasterCloseoutDate",
    "ihProgramDeclared",
    "iaProgramDeclared",
    "paProgramDeclared",
    "hmProgramDeclared",
  ],
  publicAssistance: [
    "disasterNumber",
    "pwNumber",
    "stateAbbreviation",
    "stateNumberCode",
    "county",
    "countyCode",
    "damageCategoryCode",
    "damageCategoryDescrip",
    "projectStatus",
    "projectProcessStep",
    "projectAmount",
    "federalShareObligated",
    "totalObligated",
    "firstObligationDate",
    "lastObligationDate",
  ],
  mitigation: [
    "id",
    "projectIdentifier",
    "programArea",
    "disasterNumber",
    "state",
    "stateNumberCode",
    "county",
    "countyCode",
    "projectCounties",
    "status",
    "projectAmount",
    "federalShareObligated",
  ],
  housingOwners: [
    "id",
    "disasterNumber",
    "state",
    "county",
    "validRegistrations",
    "approvedForFemaAssistance",
    "totalApprovedIhpAmount",
  ],
  housingRenters: [
    "id",
    "disasterNumber",
    "state",
    "county",
    "validRegistrations",
    "approvedForFemaAssistance",
    "totalApprovedIhpAmount",
  ],
};

/** Catalog entries: dates and counts only (the full entry also lists FEMA contact e-mails). */
export const CATALOG_FIELDS = [
  "name",
  "version",
  "title",
  "lastRefresh",
  "lastDataSetRefresh",
  "recordCount",
  "webService",
] as const;

/** Fields that must never reach a committed file, whatever an allowlist says (tested). */
export const FORBIDDEN_FIELDS = [
  "applicationTitle",
  "projectTitle",
  "projectDescription",
  "applicantName",
  "addressLine1",
  "addressLine2",
  "city",
  "zipCode",
  "recipient",
  "subrecipient",
  "contactPoint",
  "mbox",
] as const;

export const EXTRACT_NOTE =
  "PUBLIC-SAFE EXTRACT: registros de una respuesta de la API OpenFEMA con solo los campos de la lista permitida (scripts/fema/extract.ts). No es la respuesta original; su SHA-256 está en el manifiesto como rawSha256.";

function pick(
  record: Record<string, unknown>,
  fields: readonly string[],
  where: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    // A field missing from the source means the dataset changed shape: stop, never invent a null.
    if (!(field in record))
      throw new Error(`${where}: falta el campo ${field} en la respuesta de OpenFEMA`);
    out[field] = record[field];
  }
  return out;
}

/**
 * The extract of one OpenFEMA response, as text. Deterministic: same response,
 * same bytes. Idempotent: the extract of an extract is itself.
 */
export function extractResponse(
  text: string,
  key: string,
  dataset?: DatasetKey,
): { text: string; sourceCount: number | null; records: number } {
  const json = JSON.parse(text) as Record<string, unknown>;
  const metadata = (json.metadata ?? {}) as { count?: number; skip?: number; top?: number };
  const sourceCount = typeof metadata.count === "number" ? metadata.count : null;
  if (dataset) {
    const entity = DATASETS[dataset].name;
    const rows = json[entity];
    if (!Array.isArray(rows)) throw new Error(`${key}: falta «${entity}»`);
    const kept = rows.map((r, i) =>
      JSON.stringify(pick(r as Record<string, unknown>, EXTRACT_FIELDS[dataset], `${key} #${i}`)),
    );
    const head = JSON.stringify({
      extract: EXTRACT_NOTE,
      dataset: entity,
      version: DATASETS[dataset].version,
      metadata: { count: sourceCount, skip: metadata.skip ?? null, top: metadata.top ?? null },
      fields: EXTRACT_FIELDS[dataset],
    }).slice(0, -1);
    return {
      text: `${head},${JSON.stringify(entity)}:[\n${kept.join(",\n")}\n]}\n`,
      sourceCount,
      records: rows.length,
    };
  }
  const entries = json.DataSets;
  if (!Array.isArray(entries)) throw new Error(`${key}: falta «DataSets»`);
  const kept = entries.map((e, i) =>
    pick(e as Record<string, unknown>, CATALOG_FIELDS, `${key} #${i}`),
  );
  return {
    text:
      JSON.stringify({ extract: EXTRACT_NOTE, fields: CATALOG_FIELDS, DataSets: kept }, null, 1) +
      "\n",
    sourceCount: null,
    records: kept.length,
  };
}
