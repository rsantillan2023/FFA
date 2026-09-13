import type { PaginaClasificada, SeccionDetectada, SeccionPagina } from "../types.js";

const SECCION_LABELS: Partial<Record<SeccionPagina, string>> = {
  balance: "Estado de Situación Financiera",
  resultados: "Estado de Resultados / Resultado Integral",
  flujo_efectivo: "Estado de Flujo de Efectivo",
  notas: "Notas a los estados financieros",
  segmentos: "Información por segmentos",
  resumen_ejecutivo: "Resumen ejecutivo",
};

/** Agrupa páginas clasificadas en secciones detectadas (punto 9–10). */
export function buildSeccionesDetectadas(paginas?: PaginaClasificada[]): SeccionDetectada[] {
  if (!paginas?.length) return [];

  const secciones: SeccionDetectada[] = [];
  let current: SeccionDetectada | null = null;

  for (const pg of paginas) {
    if (!pg.incluida) continue;
    if (pg.seccion === "otro" || pg.seccion === "operativo") continue;

    if (!current || current.tipo !== pg.seccion) {
      if (current) secciones.push(current);
      current = {
        tipo: pg.seccion,
        paginaInicio: pg.pagina,
        paginaFin: pg.pagina,
        titulo: SECCION_LABELS[pg.seccion],
        confianza: Math.min(1, pg.score / 20),
      };
    } else {
      current.paginaFin = pg.pagina;
    }
  }
  if (current) secciones.push(current);

  return secciones;
}
