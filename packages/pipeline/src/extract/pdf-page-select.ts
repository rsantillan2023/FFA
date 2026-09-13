import type { PaginaClasificada, SeccionPagina } from "../types.js";
import { esPaginaCanonicaObligatoria, type PageTextScan } from "./pdf-text-scan.js";

/** Secciones contables canónicas — SIEMPRE se procesan, sin límite de presupuesto. */
export const SECCIONES_CANONICAS_OBLIGATORIAS: SeccionPagina[] = [
  "balance",
  "resultados",
  "flujo_efectivo",
];

const SECCIONES_SECUNDARIAS: SeccionPagina[] = ["notas", "segmentos"];

const SECCIONES_BAJA_PRIORIDAD: SeccionPagina[] = ["resumen_ejecutivo", "operativo", "otro"];

function esSeccionObligatoria(seccion: SeccionPagina): boolean {
  return SECCIONES_CANONICAS_OBLIGATORIAS.includes(seccion);
}

function hardMaxPages(): number {
  const n = Number(process.env.EXTRACT_HARD_MAX_PAGES ?? 16);
  return Number.isFinite(n) && n > 0 ? n : 16;
}

/** Evita PDFs enormes con muchas páginas obligatorias falsas — prioriza canónicas y página 1. */
function capPagesForExtraction(pageNums: number[], scans: PageTextScan[]): number[] {
  const max = hardMaxPages();
  if (pageNums.length <= max) return pageNums;

  const scanByPage = new Map(scans.map((s) => [s.pageNum, s]));
  const priority = (pageNum: number): number => {
    const scan = scanByPage.get(pageNum);
    if (!scan) return 0;
    if (esPaginaCanonicaObligatoria(scan)) return 100 + scan.score;
    if (pageNum === 1) return 90;
    if (SECCIONES_SECUNDARIAS.includes(scan.seccion)) return 40 + scan.score;
    return scan.score;
  };

  return [...pageNums]
    .sort((a, b) => priority(b) - priority(a) || a - b)
    .slice(0, max)
    .sort((a, b) => a - b);
}

function esCandidataCanonica(scan: PageTextScan): boolean {
  return esPaginaCanonicaObligatoria(scan);
}

/**
 * Selecciona páginas para extracción.
 *
 * REGLA: balance / resultados / flujo_efectivo detectados NUNCA quedan fuera por maxPages.
 * El presupuesto solo limita páginas opcionales (resumen, operativo, narrativa).
 */
export function selectPagesForExtraction(
  scans: PageTextScan[],
  maxPages: number
): { pageNums: number[]; clasificadas: PaginaClasificada[] } {
  if (scans.length === 0) {
    return { pageNums: [], clasificadas: [] };
  }

  const selected = new Set<number>();

  // Fase 1 — OBLIGATORIO: todos los estados financieros canónicos detectados (sin tope)
  const obligatorias = scans
    .filter(esCandidataCanonica)
    .sort((a, b) => a.pageNum - b.pageNum);

  for (const pg of obligatorias) {
    selected.add(pg.pageNum);
  }

  // Fase 2 — Metadatos: página 1 si no está ya incluida
  if (scans.some((s) => s.pageNum === 1) && !selected.has(1)) {
    selected.add(1);
  }

  // Fase 3 — Notas / segmentos (hasta completar maxPages solo si hay cupo extra)
  const secundarias = scans
    .filter((s) => SECCIONES_SECUNDARIAS.includes(s.seccion) && s.score >= 3 && !selected.has(s.pageNum))
    .sort((a, b) => a.pageNum - b.pageNum);

  for (const pg of secundarias) {
    if (selected.size >= maxPages + obligatorias.length) break;
    selected.add(pg.pageNum);
  }

  // Fase 4 — Relleno opcional por score (NUNCA desplaza a las obligatorias)
  const hayObligatorias = obligatorias.length > 0;
  const remaining = [...scans]
    .filter((s) => !selected.has(s.pageNum))
    .sort((a, b) => b.score - a.score || a.pageNum - b.pageNum);

  for (const pg of remaining) {
    // Con estados canónicos detectados, no gastar cupo en resumen/operativo
    if (hayObligatorias && SECCIONES_BAJA_PRIORIDAD.includes(pg.seccion)) {
      continue;
    }
    // No incluir balance/resultados/flujo débiles (KPIs sueltos sin título formal)
    if (esSeccionObligatoria(pg.seccion) && !esPaginaCanonicaObligatoria(pg)) {
      continue;
    }
    // Cupo blando: maxPages + obligatorias permite algo de contexto extra
    const softLimit = Math.max(maxPages, selected.size);
    if (selected.size >= softLimit && !esSeccionObligatoria(pg.seccion)) break;
    selected.add(pg.pageNum);
  }

  let pageNums = [...selected].sort((a, b) => a - b);
  pageNums = capPagesForExtraction(pageNums, scans);

  const clasificadas: PaginaClasificada[] = scans.map((s) => ({
    pagina: s.pageNum,
    seccion: s.seccion,
    score: s.score,
    incluida: pageNums.includes(s.pageNum),
    textoEscaneado: s.text.trim() || undefined,
  }));

  return { pageNums, clasificadas };
}
