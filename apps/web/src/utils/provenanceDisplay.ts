import type { ProvenanceCasoDto } from "@ffa/shared";

const SELECCION_LABEL: Record<string, string> = {
  claude_map: "mapa Claude",
  pdf_corto_completo: "todas las páginas (PDF corto)",
  heuristica: "selección heurística (regex)",
  todas: "todas las páginas",
};

export function buildProvenanceBanner(provenance: ProvenanceCasoDto): {
  mensaje: string;
  tipo: "info" | "warning";
} | null {
  if (!provenance.usaFallbackHeuristico && !provenance.bannerMensaje) return null;

  if (provenance.bannerMensaje) {
    return {
      mensaje: provenance.bannerMensaje,
      tipo: provenance.bannerTipo ?? "warning",
    };
  }

  const partes: string[] = [];
  const ext = provenance.extraccion;
  if (ext) {
    if (ext.seleccionPaginas === "heuristica" && ext.paginasOmitidasVision > 0) {
      partes.push(
        `Extracción: ${ext.paginasEnviadasVision}/${ext.paginasPdfTotal} páginas a Vision (${SELECCION_LABEL[ext.seleccionPaginas]})`
      );
    }
    if (ext.complementoHeuristico) {
      partes.push("complemento regex post-extract activo");
    }
    if (ext.lineasOmitidasEstimadas > 0) {
      partes.push(`~${ext.lineasOmitidasEstimadas} fila(s) del PDF no extraídas`);
    }
  }

  const cls = provenance.clasificacion;
  if (cls && cls.semanticaFallback > 0) {
    partes.push(
      `${cls.semanticaFallback} línea(s) clasificadas por heurística (fallback; IA no disponible o falló)`
    );
  }

  if (partes.length === 0) return null;

  return {
    mensaje: `Procesamiento con fallback heurístico: ${partes.join(" · ")}. Revisá totales y rubros con atención.`,
    tipo: "warning",
  };
}
