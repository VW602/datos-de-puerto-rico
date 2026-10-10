import type { NwsSnapshot, UsgsSnapshot } from "@/data/pr/current";
import { prTime } from "@/data/pr/currentModel";
import type { WaterSnapshot } from "@/data/pr/water";
import { WaterProvenance } from "../WaterPanel";
import { Disclosure } from "./Disclosure";

function Copy({ at, attempt }: { at: string | null; attempt: { at: string; ok: boolean } }) {
  return (
    <>
      Última copia: {at ? prTime(at) : "nunca obtenida"}.
      {!attempt.ok && ` Último intento fallido: ${prTime(attempt.at)}.`}
    </>
  );
}

/**
 * Level 3 of disclosure: exact times of every copy, attributions, rules and
 * links, in one place instead of repeated under each summary.
 */
export function Provenance({
  nws,
  usgs,
  water,
}: {
  nws: NwsSnapshot;
  usgs: UsgsSnapshot;
  water: WaterSnapshot | null;
}) {
  return (
    <Disclosure label="¿De dónde salen estos datos?" className="mt-1 text-[13px]">
      <div className="max-w-[72ch] pb-2">
        <p>
          Horas en hora de Puerto Rico (AST, UTC−4; sin horario de verano). El sitio muestra copias
          guardadas; nunca llama a las fuentes desde tu navegador.
        </p>
        <h4 className="mt-2 font-semibold">Alertas: Servicio Nacional de Meteorología (NWS)</h4>
        <p>
          <Copy at={nws.retrievedAt} attempt={nws.lastAttempt} /> {nws.source.attribution}{" "}
          <a href={nws.source.docs} target="_blank" rel="noreferrer">
            API del NWS ↗
          </a>
        </p>
        <h4 className="mt-2 font-semibold">Sismos: Servicio Geológico de EE. UU. (USGS)</h4>
        <p>
          <Copy at={usgs.retrievedAt} attempt={usgs.lastAttempt} /> {usgs.source.attribution}{" "}
          <a href={usgs.source.docs} target="_blank" rel="noreferrer">
            Feed del USGS ↗
          </a>
        </p>
        <h4 className="mt-2 font-semibold">Agua: estaciones del USGS</h4>
        {water ? <WaterProvenance water={water} /> : <p>Cargando…</p>}
      </div>
    </Disclosure>
  );
}
