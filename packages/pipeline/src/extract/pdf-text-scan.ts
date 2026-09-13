import { loadPdfDocument } from "./pdf-loader.js";
import type { SeccionPagina } from "../types.js";

export interface PageTextScan {
  pageNum: number;
  text: string;
  seccion: SeccionPagina;
  score: number;
  /** true si hay título explícito de estado financiero estructurado. */
  tituloCanonico?: boolean;
}

/** Títulos formales — señal fuerte de estado canónico. */
const TITULOS_CANONICOS: { seccion: SeccionPagina; patterns: RegExp[]; bonus: number }[] = [
  {
    seccion: "balance",
    bonus: 45,
    patterns: [
      /estado de situaci[oó]n financiera/i,
      /estado de situacion financiera/i,
      /balance general consolidado/i,
      /balance general/i,
    ],
  },
  {
    seccion: "resultados",
    bonus: 45,
    patterns: [
      /estado de resultados/i,
      /estado del resultado/i,
      /resultado integral consolidado/i,
      /estado de resultados consolidado/i,
    ],
  },
  {
    seccion: "flujo_efectivo",
    bonus: 45,
    patterns: [
      /estado de flujo[s]? de efectivo/i,
      /estado de flujos de efectivo/i,
    ],
  },
];

/** Señales de resumen/portada — prevalecen sobre KPIs sueltos. */
const RESUMEN_SIGNALS = [
  /resumen ejecutivo/i,
  /highlights/i,
  /indicadores destacados/i,
  /presentaci[oó]n de resultados/i,
  /informe de gesti[oó]n/i,
  /mensaje del directorio/i,
  /carta del presidente/i,
  /comentarios del management/i,
  /resultados del (trimestre|ejercicio|per[ií]odo)/i,
];

/** KPIs/indicadores sueltos — NO clasifican como estado canónico por sí solos. */
const KPI_DEBILES = [
  /ganancia neta/i,
  /p[eé]rdida neta/i,
  /utilidad neta/i,
  /ganancia bruta/i,
  /\bebitda\b/i,
  /deuda neta/i,
  /margen ebitda/i,
  /ingresos ordinarios/i,
];

/** Líneas estructurales de balance (requieren combinación). */
const BALANCE_ESTRUCTURAL = [
  /total del activo/i,
  /total del pasivo/i,
  /activo corriente/i,
  /pasivo corriente/i,
  /patrimonio neto/i,
  /propiedades,? planta y equipo/i,
];

/** Líneas estructurales de resultados (requieren combinación). */
const RESULTADOS_ESTRUCTURAL = [
  /ingresos por ventas/i,
  /costo de ventas/i,
  /costo de los ingresos/i,
  /resultado operativo/i,
  /resultado antes de impuestos/i,
  /ganancia bruta/i,
];

/** Líneas estructurales de flujo (requieren combinación). */
const FLUJO_ESTRUCTURAL = [
  /actividades operativas/i,
  /actividades de inversi[oó]n/i,
  /actividades de financiaci[oó]n/i,
  /variaci[oó]n del efectivo/i,
  /efectivo al (inicio|cierre|final|comienzo)/i,
  /aumento neto de efectivo/i,
];

const OPERATIVO_SIGNALS = [
  /volumen/i,
  /toneladas/i,
  /\bcemento\b/i,
  /unidades vendidas/i,
  /variaci[oó]n porcentual/i,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    if (p.test(text)) n += 1;
  }
  return n;
}

function scorePageText(rawText: string): { seccion: SeccionPagina; score: number; tituloCanonico: boolean } {
  const text = rawText;

  const resumenHits = countMatches(text, RESUMEN_SIGNALS);
  const operativoHits = countMatches(text, OPERATIVO_SIGNALS);
  const kpiHits = countMatches(text, KPI_DEBILES);

  const numericTokens = (rawText.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{4,}/g) ?? []).length;
  const densidadTabular = numericTokens >= 12 ? 8 : numericTokens >= 8 ? 4 : 0;

  const sectionScores = new Map<SeccionPagina, number>();
  let tituloCanonico = false;
  let seccionPorTitulo: SeccionPagina | null = null;

  // 1) Títulos formales — máxima prioridad
  for (const titulo of TITULOS_CANONICOS) {
    if (countMatches(text, titulo.patterns) > 0) {
      tituloCanonico = true;
      seccionPorTitulo = titulo.seccion;
      sectionScores.set(titulo.seccion, (sectionScores.get(titulo.seccion) ?? 0) + titulo.bonus + densidadTabular);
    }
  }

  // 2) Estructura compuesta (sin título explícito)
  const balanceStruct = countMatches(text, BALANCE_ESTRUCTURAL);
  if (balanceStruct >= 2) {
    sectionScores.set("balance", (sectionScores.get("balance") ?? 0) + balanceStruct * 8 + densidadTabular);
  }

  const resultadosStruct = countMatches(text, RESULTADOS_ESTRUCTURAL);
  if (resultadosStruct >= 2) {
    sectionScores.set("resultados", (sectionScores.get("resultados") ?? 0) + resultadosStruct * 8 + densidadTabular);
  }

  const flujoStruct = countMatches(text, FLUJO_ESTRUCTURAL);
  if (flujoStruct >= 2) {
    sectionScores.set(
      "flujo_efectivo",
      (sectionScores.get("flujo_efectivo") ?? 0) + flujoStruct * 8 + densidadTabular
    );
  } else if (flujoStruct === 1 && /flujo de efectivo/i.test(text)) {
    sectionScores.set("flujo_efectivo", (sectionScores.get("flujo_efectivo") ?? 0) + 12);
  }

  // 3) Notas / segmentos
  if (/notas a los estados financieros/i.test(text)) {
    sectionScores.set("notas", (sectionScores.get("notas") ?? 0) + 15);
  }
  if (/informaci[oó]n por segmento/i.test(text)) {
    sectionScores.set("segmentos", (sectionScores.get("segmentos") ?? 0) + 12);
  }

  // 4) Resumen ejecutivo — KPIs sueltos sin título canónico
  if (!tituloCanonico && (resumenHits > 0 || (kpiHits >= 2 && balanceStruct < 2 && resultadosStruct < 2))) {
    const resumenScore = resumenHits * 10 + kpiHits * 3 + (operativoHits > 0 ? 2 : 0);
    sectionScores.set("resumen_ejecutivo", resumenScore);
  }

  // 5) Operativo
  if (operativoHits > 0) {
    sectionScores.set("operativo", operativoHits * 5);
  }

  // Elegir mejor sección canónica primero
  let bestSeccion: SeccionPagina = "otro";
  let bestScore = 0;

  if (seccionPorTitulo) {
    bestSeccion = seccionPorTitulo;
    bestScore = sectionScores.get(seccionPorTitulo) ?? 0;
  } else {
    for (const structured of ["balance", "resultados", "flujo_efectivo"] as SeccionPagina[]) {
      const s = sectionScores.get(structured) ?? 0;
      if (s > bestScore) {
        bestScore = s;
        bestSeccion = structured;
      }
    }
  }

  // Sin estructura canónica fuerte → resumen/operativo/otro
  if (bestScore < 16) {
    const resumenScore = sectionScores.get("resumen_ejecutivo") ?? 0;
    const operativoScore = sectionScores.get("operativo") ?? 0;
    const notasScore = sectionScores.get("notas") ?? 0;
    const segmentosScore = sectionScores.get("segmentos") ?? 0;

    if (resumenScore >= operativoScore && resumenScore > 0) {
      return { seccion: "resumen_ejecutivo", score: resumenScore, tituloCanonico: false };
    }
    if (operativoScore > 0) {
      return { seccion: "operativo", score: operativoScore, tituloCanonico: false };
    }
    if (notasScore > 0) return { seccion: "notas", score: notasScore, tituloCanonico: false };
    if (segmentosScore > 0) return { seccion: "segmentos", score: segmentosScore, tituloCanonico: false };

    // KPI aislado sin estructura → resumen, NO resultados canónico
    if (kpiHits > 0 && !tituloCanonico) {
      return { seccion: "resumen_ejecutivo", score: kpiHits * 4, tituloCanonico: false };
    }

    if (densidadTabular > 0) return { seccion: "otro", score: densidadTabular, tituloCanonico: false };
    return { seccion: "otro", score: 0, tituloCanonico: false };
  }

  // Penalizar resumen si hay título canónico claro en la misma página
  if (tituloCanonico && resumenHits > 0 && bestScore >= 40) {
    return { seccion: bestSeccion, score: bestScore, tituloCanonico: true };
  }

  // Página con estructura pero también mucho resumen y sin título → preferir resumen si score canónico bajo
  if (!tituloCanonico && resumenHits >= 2 && bestScore < 30) {
    return {
      seccion: "resumen_ejecutivo",
      score: resumenHits * 8,
      tituloCanonico: false,
    };
  }

  return { seccion: bestSeccion, score: bestScore, tituloCanonico };
}

/** Extrae texto plano de cada página del PDF (sin renderizar imagen). */
export async function scanPdfPagesText(pdfBuffer: Buffer): Promise<PageTextScan[]> {
  try {
    const pdf = await loadPdfDocument(pdfBuffer);
    const out: PageTextScan[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? String(item.str) : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const scored = scorePageText(text);
      out.push({ pageNum: i, text, ...scored });
    }

    return out;
  } catch {
    return [];
  }
}

export async function getPdfNumPages(pdfBuffer: Buffer): Promise<number> {
  try {
    const pdf = await loadPdfDocument(pdfBuffer);
    return pdf.numPages;
  } catch {
    return 0;
  }
}

/** Umbral para considerar una página como estado canónico obligatorio. */
export function esPaginaCanonicaObligatoria(scan: PageTextScan): boolean {
  if (!["balance", "resultados", "flujo_efectivo"].includes(scan.seccion)) return false;
  // Título formal del estado → siempre obligatorio
  if (scan.tituloCanonico) return true;
  // Estructura fuerte sin título explícito → solo si score alto (evita KPIs/resúmenes p1-6)
  return scan.score >= 28;
}
