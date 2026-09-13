import { isDemoExtractIdentity, isDemoRazonSocial, isDemoRut } from "@ffa/shared";
import type { ExtractResult } from "../types.js";
import { enrichLineProvenance } from "./dedupe-extract.js";
import { metadataScoreEnriched } from "./metadata-enrich.js";

function metadataScore(meta: ExtractResult["metadata"]): number {
  let score = metadataScoreEnriched(meta);
  if (meta.razonSocial?.trim() && isDemoRazonSocial(meta.razonSocial)) score -= 5;
  if (meta.rut?.trim() && isDemoRut(meta.rut)) score -= 2;
  return score;
}

function pickBestMetadata(pages: ExtractResult[]): ExtractResult["metadata"] {
  let best = pages[0]?.metadata ?? {};
  let bestScore = metadataScore(best);
  for (const page of pages) {
    const score = metadataScore(page.metadata);
    if (score > bestScore) {
      best = page.metadata;
      bestScore = score;
    }
  }
  if (isDemoExtractIdentity(best)) {
    const clean = pages.find((p) => !isDemoExtractIdentity(p.metadata))?.metadata;
    if (clean) return clean;
  }
  return best;
}

function mergeTipoDocumento(pages: ExtractResult[]): string {
  const tipos = new Set(
    pages
      .map((p) => p.tipoDocumento)
      .filter((t) => t && t !== "desconocido")
  );

  if (tipos.size === 0) return pages[0]?.tipoDocumento ?? "desconocido";
  if (tipos.size === 1) return [...tipos][0]!;

  const hasBalance = [...tipos].some((t) => t.includes("balance"));
  const hasResultados = [...tipos].some((t) => t.includes("resultado"));
  const hasFlujo = [...tipos].some((t) => t.includes("flujo"));

  if ((hasBalance && hasResultados) || hasFlujo || tipos.size >= 2) {
    return "mixto";
  }
  return "mixto";
}

function collectTiposPorPagina(pages: ExtractResult[]): ExtractResult["tiposPorPagina"] {
  const out: NonNullable<ExtractResult["tiposPorPagina"]> = [];
  for (const page of pages) {
    const pagina = page.lineas[0]?.paginaNumero;
    if (!pagina) continue;
    const seccionPagina = page.seccionPagina ?? page.lineas.find((l) => l.seccionPagina)?.seccionPagina;
    out.push({
      pagina,
      tipoDocumento: page.tipoDocumento,
      seccionPagina,
    });
  }
  return out.length ? out : undefined;
}

/** Combina extracciones por página en un único resultado con deduplicación canónica. */
export function mergeExtractPages(
  pages: ExtractResult[],
  opts?: { paginasClasificadas?: ExtractResult["paginasClasificadas"] }
): ExtractResult {
  if (pages.length === 0) {
    throw new Error("Sin páginas para combinar");
  }

  const first = pages[0];
  const rawLineas = pages.flatMap((p) => {
    const pageSeccion = p.seccionPagina ?? p.lineas.find((l) => l.seccionPagina)?.seccionPagina;

    return p.lineas.map((l) =>
      enrichLineProvenance({
        ...l,
        seccionPagina: l.seccionPagina ?? pageSeccion,
      })
    );
  });

  const indicadoresFinancieros = pages.flatMap((p) => p.indicadoresFinancieros ?? []);
  const indicadoresOperativos = pages.flatMap((p) => p.indicadoresOperativos ?? []);

  const notas = pages.flatMap((p) => p.notas ?? []);
  const totales = pages.flatMap((p) => p.totales ?? []);
  const encabezados = [...new Set(pages.flatMap((p) => p.encabezados ?? []))];

  const transcripcionPaginas = pages.flatMap((p, idx) => {
    if (p.transcripcionPaginas?.length) return p.transcripcionPaginas;
    if (p.textoPagina?.trim()) {
      const pagina = p.lineas[0]?.paginaNumero ?? idx + 1;
      return [{ pagina, texto: p.textoPagina.trim() }];
    }
    return [];
  });

  return {
    tipoDocumento: mergeTipoDocumento(pages),
    metadata: pickBestMetadata(pages),
    notas: notas.length ? notas : undefined,
    totales: totales.length ? totales : undefined,
    encabezados: encabezados.length ? encabezados : undefined,
    transcripcionPaginas: transcripcionPaginas.length ? transcripcionPaginas : undefined,
    paginasClasificadas: opts?.paginasClasificadas ?? first.paginasClasificadas,
    tiposPorPagina: collectTiposPorPagina(pages),
    indicadoresFinancieros: indicadoresFinancieros.length ? indicadoresFinancieros : undefined,
    indicadoresOperativos: indicadoresOperativos.length ? indicadoresOperativos : undefined,
    lineas: rawLineas,
  };
}
