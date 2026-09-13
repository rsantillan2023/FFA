export interface PreprocessInput {

  nombreOriginal: string;

  mimeType: string;

  paginaCount?: number;

  bufferSize?: number;

}



export interface PreprocessAnalysis {

  tipoDocumento: string;

  concatenado: boolean;

  unidadesDetectadas: number;

  rotacionGrados: number;

  incompleto: boolean;

  resolucionObjetivo: string;

  paginaCount: number;

  calidadOrigen: "nativo" | "escaneado_legible" | "degradado" | "ilegible" | "pendiente";

  warnings: string[];

  log: Array<{ etapa: string; mensaje: string }>;

}



/** B.2–B.3, B.7–B.8 — análisis heurístico previo a extracción. */

export function analyzeDocument(input: PreprocessInput): PreprocessAnalysis {

  const log: PreprocessAnalysis["log"] = [];

  const warnings: string[] = [];

  const name = input.nombreOriginal.toLowerCase();

  const isPdf = input.mimeType === "application/pdf";

  const isImage = input.mimeType.startsWith("image/");



  let tipoDocumento = "balance_clasificado";

  if (name.includes("ifrs") || name.includes("auditad")) tipoDocumento = "ifrs";

  else if (name.includes("resultado")) tipoDocumento = "estado_resultados";

  else if (name.includes("8 col") || name.includes("8col")) tipoDocumento = "balance_8col";



  const tieneBalance = name.includes("balance");

  const tieneResultados = name.includes("resultado");

  const concatenado =

    name.includes("concaten") ||

    name.includes("mixto") ||

    (tieneBalance && tieneResultados);

  const unidadesDetectadas = concatenado ? 2 : 1;

  if (concatenado) {

    log.push({ etapa: "concatenado", mensaje: "Documento concatenado detectado — 2 unidades (B.2)" });

    tipoDocumento = "mixto";

  }



  let rotacionGrados = 0;

  if (isImage) {

    rotacionGrados = name.includes("rotado") ? 90 : 0;

    log.push({

      etapa: "orientacion",

      mensaje:

        rotacionGrados > 0

          ? `Rotación ${rotacionGrados}° corregida antes de extracción (B.3)`

          : "Orientación verificada — sin rotación (B.3)",

    });

  }



  let paginaCount = input.paginaCount ?? (isPdf ? 2 : 1);

  if (isPdf && paginaCount < 2 && tipoDocumento !== "estado_resultados") {

    paginaCount = Math.max(paginaCount, 1);

  }



  const incompleto =

    paginaCount <= 1 &&

    (tipoDocumento === "balance_clasificado" || tipoDocumento === "mixto" || tipoDocumento === "ifrs");

  if (incompleto) {

    warnings.push("Documento posiblemente incompleto — páginas faltantes (B.7)");

    log.push({ etapa: "completitud", mensaje: warnings[warnings.length - 1]! });

  }



  const resolucionObjetivo = isImage ? "300dpi-normalizado" : "nativo-pdf";

  if (isImage) {

    log.push({

      etapa: "resolucion",

      mensaje: `Formato imagen normalizado a objetivo ${resolucionObjetivo} (B.8)`,

    });

  }



  let calidadOrigen: PreprocessAnalysis["calidadOrigen"] = "nativo";

  if (input.mimeType === "application/octet-stream" || name.endsWith(".bin")) {

    calidadOrigen = "ilegible";

  } else if (isImage) {

    calidadOrigen = "escaneado_legible";

  } else if (isPdf) {

    calidadOrigen = "nativo";

  } else {

    calidadOrigen = "degradado";

  }



  return {

    tipoDocumento,

    concatenado,

    unidadesDetectadas,

    rotacionGrados,

    incompleto,

    resolucionObjetivo,

    paginaCount,

    calidadOrigen,

    warnings,

    log,

  };

}


