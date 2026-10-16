/**
 * FEMA recovery data from OpenFEMA. Kept exact in both languages: Public
 * Assistance is placed by the applicant's municipio, not necessarily where the
 * work is; obligated is not spent; IHP approved is not paid; a valid
 * registration is not an approval. Program names, field names, disaster titles
 * and FEMA's status words ("Statewide", "Closed", process steps) stay as FEMA
 * publishes them.
 */
import { defineMessages } from "../define.ts";

export const FEMA_MESSAGES = defineMessages({
  es: {
    geo: {
      MUNICIPIO_ATTRIBUTABLE: {
        label: "En un municipio",
        detail: "FEMA indica el municipio del proyecto (mitigación) o de los hogares (IHP).",
      },
      APPLICANT_MUNICIPIO: {
        label: "Solicitante ubicado en un municipio",
        detail:
          "Asistencia Pública: FEMA registra el municipio de quien solicita, no necesariamente el lugar de la obra.",
      },
      MUNICIPIO_UNCERTAIN: {
        label: "Varios municipios, sin certeza",
        detail: "FEMA indica varios municipios para un mismo proyecto.",
      },
      PUERTO_RICO_STATEWIDE: {
        label: "Todo Puerto Rico",
        detail: "FEMA lo registra como «Statewide». No se le asigna a ningún municipio.",
      },
      NO_MUNICIPIO_GEOGRAPHY: { label: "Sin municipio", detail: "FEMA no indica municipio." },
    },
    disaster: {
      all: "Todos los desastres",
      allLower: "todos los desastres",
      nonDisaster: "Mitigación fuera de un desastre (PDM, FMA)",
      outside: (n: number | null) => `Desastre ${n} (declarado fuera de Puerto Rico)`,
      untitled: "Sin título",
      filter: "Desastre",
      declared: (declared: string, begin: string, end: string, type: string) =>
        `Declarado el ${declared} · incidente del ${begin} al ${end} · ${type}`,
    },
    obligatedNote:
      "Obligado quiere decir que FEMA aprobó y comprometió el dinero federal para el proyecto. No quiere decir que ya se pagó ni que se gastó. OpenFEMA no publica lo gastado.",
    noRecord: "Sin registro",
    municipio: {
      label: (name: string) => `Recuperación en ${name}`,
      heading: (name: string, disaster: string) => `Recuperación · ${name} · ${disaster}`,
      declarations: "Declaraciones",
      declarationsIncluding: "Declaraciones que incluyen el municipio",
      declarationsNote:
        "Que un municipio esté en una declaración no quiere decir que cada residente recibió ayuda.",
      programs: {
        ih: "Individuos y Hogares",
        pa: "Asistencia Pública",
        hm: "Mitigación",
        none: "Sin programas marcados para el municipio",
      },
      paHeading: (name: string) => `Asistencia Pública de solicitantes ubicados en ${name}`,
      paNote:
        "FEMA registra el municipio de quien solicita (por ejemplo, el gobierno municipal o una entidad local), no necesariamente el lugar de la obra.",
      federalObligated: "Obligado federal",
      totalObligated: "Total obligado",
      totalObligatedNote: "totalObligated: parte federal más costos administrativos",
      projectCost: "Costo estimado de los proyectos",
      projectCostNote:
        "projectAmount: costo total estimado, sin costos administrativos; no es lo obligado",
      projects: "Proyectos",
      ihpHeading: "Asistencia a hogares (IHP)",
      ihpApproved: "Monto aprobado bajo IHP",
      ihpApprovedNote:
        "totalApprovedIhpAmount, dueños e inquilinos; aprobado no quiere decir pagado",
      ihpApplicants: "Solicitantes aprobados para IHP",
      ihpValid: "Registros válidos",
      ihpValidNote:
        "validRegistrations: registros que FEMA acepta como válidos; no quiere decir aprobados",
      hmaHeading: "Mitigación (HMA)",
      hmaObligatedNote: "federalShareObligated; los proyectos sin monto reportado no suman",
      hmaCost: "Costo de los proyectos",
      hmaCostNote: "projectAmount, según la solicitud",
      anyStatus: "De cualquier estado",
      statewideApart: (amount: string, name: string) =>
        `Aparte, FEMA registra ${amount} de Asistencia Pública para todo Puerto Rico («Statewide»). Ese dinero no se le asigna a ${name} ni a ningún otro municipio.`,
    },
    island: {
      label: "Recuperación en Puerto Rico",
      heading: (disaster: string) => `Puerto Rico · ${disaster}`,
      measures: {
        paObligated: "Asistencia Pública: obligado federal",
        paProjects: "Asistencia Pública: proyectos",
        ihpApproved: "Hogares: monto aprobado bajo IHP",
        hmaFederalObligated: "Mitigación: obligado federal",
      },
      partsNote:
        "Las partes suman el total de Puerto Rico de cada medida. El mapa solo pinta lo que está en un municipio; en Asistencia Pública, ese municipio es el del solicitante.",
      hmaStatuses: (list: string) =>
        `Proyectos de mitigación por estado (términos de FEMA): ${list}.`,
      notAdded:
        "FEMA y USAspending (en «Fondos federales») son dos publicaciones oficiales distintas que pueden describir el mismo dinero. El sitio no las suma.",
    },
    projects: {
      pickDisaster: "Escoge un desastre para ver sus proyectos de Asistencia Pública.",
      noProjects: "Este desastre no tiene proyectos de Asistencia Pública en OpenFEMA.",
      open: (name: string | null) =>
        `Ver proyectos de Asistencia Pública ${name ? `de solicitantes ubicados en ${name}` : "para todo Puerto Rico"}`,
      loading: "Cargando proyectos…",
      count: (n: string, name: string | null) =>
        `${n} proyectos ${name ? `de solicitantes ubicados en ${name}` : "«Statewide»"} · paso del proceso en los términos de FEMA`,
      project: "Proyecto",
      category: "Categoría",
      estimatedCost: "Costo estimado",
      federalObligated: "Obligado federal",
      step: "Paso (FEMA)",
      more: (n: string) => `Mostrar más (${n} quedan)`,
    },
    rows: {
      dataset: "Dataset de OpenFEMA",
      field: "Campo",
      disaster: "Desastre",
      disasterNumber: (n: number) => ` (número ${n})`,
      allDisasters: "Todos los desastres con registros de FEMA para Puerto Rico",
      place: "Lugar",
      dataDate: "Fecha del dato",
      dataDateValue: (name: string, day: string) => `${name}: actualizado por FEMA el ${day}`,
      retrieved: "Fecha de obtención",
      retrievedValue: (day: string) => `Copia obtenida de la API OpenFEMA el ${day}`,
      notice: "Aviso de FEMA",
    },
    fields: {
      femaPaObligated:
        "federalShareObligated: parte federal obligada para los proyectos aprobados (suma de todos los proyectos)",
      femaPaProjects:
        "Número de registros de proyecto (número de desastre + número de hoja de trabajo)",
      femaIhpApproved:
        "totalApprovedIhpAmount: monto aprobado bajo el programa de Individuos y Hogares, dueños más inquilinos. Aprobado no quiere decir pagado; un registro válido (validRegistrations) no quiere decir aprobado.",
      femaHmaObligated:
        "federalShareObligated: parte federal obligada (sin costos administrativos); los proyectos sin monto no suman",
    } as Record<string, string>,
    places: {
      publicAssistance:
        "El municipio del solicitante, según FEMA (el campo county de este dataset es la ubicación de quien solicita), no necesariamente el lugar de la obra. Si FEMA dice «Statewide», el dinero es de todo Puerto Rico: no se le asigna a San Juan ni se reparte entre municipios, aunque el registro traiga el código de condado de San Juan. El sitio no deduce nada de direcciones.",
      housing:
        "El municipio de los hogares registrados, según las filas agregadas de FEMA. «Statewide» queda como todo Puerto Rico.",
      mitigation:
        "El municipio principal del proyecto, según FEMA. Si FEMA indica varios municipios, queda sin certeza; si dice «Statewide», «PUERTO RICO» o «ISLANDWIDE», es todo Puerto Rico y no se le asigna a ningún municipio.",
    },
  },
  en: {
    geo: {
      MUNICIPIO_ATTRIBUTABLE: {
        label: "In one municipio",
        detail: "FEMA names the municipio of the project (mitigation) or of the households (IHP).",
      },
      APPLICANT_MUNICIPIO: {
        label: "Applicant located in a municipio",
        detail:
          "Public Assistance: FEMA records the applicant's municipio, not necessarily where the work is.",
      },
      MUNICIPIO_UNCERTAIN: {
        label: "Several municipios, not certain",
        detail: "FEMA names several municipios for the same project.",
      },
      PUERTO_RICO_STATEWIDE: {
        label: "All of Puerto Rico",
        detail: "FEMA records it as “Statewide.” It is not assigned to any municipio.",
      },
      NO_MUNICIPIO_GEOGRAPHY: { label: "No municipio", detail: "FEMA names no municipio." },
    },
    disaster: {
      all: "All disasters",
      allLower: "all disasters",
      nonDisaster: "Mitigation outside a disaster (PDM, FMA)",
      outside: (n: number | null) => `Disaster ${n} (declared outside Puerto Rico)`,
      untitled: "Untitled",
      filter: "Disaster",
      declared: (declared: string, begin: string, end: string, type: string) =>
        `Declared ${declared} · incident from ${begin} to ${end} · ${type}`,
    },
    obligatedNote:
      "Obligated means FEMA approved and committed the federal money for the project. It does not mean it has been paid or spent. OpenFEMA does not publish what was spent.",
    noRecord: "No record",
    municipio: {
      label: (name: string) => `Recovery in ${name}`,
      heading: (name: string, disaster: string) => `Recovery · ${name} · ${disaster}`,
      declarations: "Declarations",
      declarationsIncluding: "Declarations that include the municipio",
      declarationsNote:
        "A municipio being in a declaration does not mean every resident received aid.",
      programs: {
        ih: "Individuals and Households",
        pa: "Public Assistance",
        hm: "Hazard Mitigation",
        none: "No programs marked for the municipio",
      },
      paHeading: (name: string) => `Public Assistance for applicants located in ${name}`,
      paNote:
        "FEMA records the applicant's municipio (the municipal government or a local entity, for example), not necessarily where the work is.",
      federalObligated: "Federal share obligated",
      totalObligated: "Total obligated",
      totalObligatedNote: "totalObligated: federal share plus management costs",
      projectCost: "Estimated project cost",
      projectCostNote:
        "projectAmount: total estimated cost, without management costs; not the obligated amount",
      projects: "Projects",
      ihpHeading: "Assistance to households (IHP)",
      ihpApproved: "Amount approved under IHP",
      ihpApprovedNote: "totalApprovedIhpAmount, owners and renters; approved does not mean paid",
      ihpApplicants: "Applicants approved for IHP",
      ihpValid: "Valid registrations",
      ihpValidNote:
        "validRegistrations: registrations FEMA accepts as valid; this does not mean approved",
      hmaHeading: "Hazard Mitigation (HMA)",
      hmaObligatedNote: "federalShareObligated; projects with no reported amount add nothing",
      hmaCost: "Project cost",
      hmaCostNote: "projectAmount, as in the application",
      anyStatus: "In any status",
      statewideApart: (amount: string, name: string) =>
        `Separately, FEMA records ${amount} in Public Assistance for all of Puerto Rico (“Statewide”). That money is not assigned to ${name} or to any other municipio.`,
    },
    island: {
      label: "Recovery in Puerto Rico",
      heading: (disaster: string) => `Puerto Rico · ${disaster}`,
      measures: {
        paObligated: "Public Assistance: federal share obligated",
        paProjects: "Public Assistance: projects",
        ihpApproved: "Households: amount approved under IHP",
        hmaFederalObligated: "Mitigation: federal share obligated",
      },
      partsNote:
        "The parts add up to Puerto Rico's total for each measure. The map paints only what is in one municipio; for Public Assistance, that municipio is the applicant's.",
      hmaStatuses: (list: string) => `Mitigation projects by status (FEMA's terms): ${list}.`,
      notAdded:
        "FEMA and USAspending (under “Federal funds”) are two separate official publications that can describe the same money. The site does not add them together.",
    },
    projects: {
      pickDisaster: "Pick a disaster to see its Public Assistance projects.",
      noProjects: "This disaster has no Public Assistance projects in OpenFEMA.",
      open: (name: string | null) =>
        `See Public Assistance projects ${name ? `for applicants located in ${name}` : "for all of Puerto Rico"}`,
      loading: "Loading projects…",
      count: (n: string, name: string | null) =>
        `${n} projects ${name ? `for applicants located in ${name}` : "marked “Statewide”"} · process step in FEMA's terms`,
      project: "Project",
      category: "Category",
      estimatedCost: "Estimated cost",
      federalObligated: "Federal share obligated",
      step: "Step (FEMA)",
      more: (n: string) => `Show more (${n} left)`,
    },
    rows: {
      dataset: "OpenFEMA dataset",
      field: "Field",
      disaster: "Disaster",
      disasterNumber: (n: number) => ` (number ${n})`,
      allDisasters: "Every disaster with FEMA records for Puerto Rico",
      place: "Place",
      dataDate: "Data date",
      dataDateValue: (name: string, day: string) => `${name}: updated by FEMA on ${day}`,
      retrieved: "Retrieved",
      retrievedValue: (day: string) => `Copy retrieved from the OpenFEMA API on ${day}`,
      notice: "FEMA notice",
    },
    fields: {
      femaPaObligated:
        "federalShareObligated: federal share obligated for approved projects (sum across all projects)",
      femaPaProjects: "Number of project records (disaster number + project worksheet number)",
      femaIhpApproved:
        "totalApprovedIhpAmount: amount approved under the Individuals and Households Program, owners plus renters. Approved does not mean paid; a valid registration (validRegistrations) does not mean approved.",
      femaHmaObligated:
        "federalShareObligated: federal share obligated (without management costs); projects with no amount add nothing",
    } as Record<string, string>,
    places: {
      publicAssistance:
        "The applicant's municipio, according to FEMA (this dataset's county field is where the applicant is located), not necessarily where the work is. If FEMA says “Statewide,” the money is for all of Puerto Rico: it is not assigned to San Juan or split among municipios, even when the record carries San Juan's county code. The site infers nothing from addresses.",
      housing:
        "The municipio of the registered households, according to FEMA's aggregated rows. “Statewide” stays as all of Puerto Rico.",
      mitigation:
        "The project's main municipio, according to FEMA. If FEMA names several municipios, it stays uncertain; if it says “Statewide,” “PUERTO RICO” or “ISLANDWIDE,” it is all of Puerto Rico and is not assigned to any municipio.",
    },
  },
});
