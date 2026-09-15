/** Snapshot de preproceso reutilizable en foja cero sin re-renderizar el PDF. */
export interface PreprocessCacheSnapshot {
  hashSha256: string;
  guardadoEn: string;
  mimeType: string;
  calidadOrigen: string;
  tipoDocumento: string;
  paginaCount: number;
  preprocessFlags: {
    concatenado: boolean;
    incompleto: boolean;
    rotacionGrados: number;
    unidadesDetectadas: number;
  };
  derivados?: {
    miniaturaKey?: string;
    paginasNormalizadas?: string[];
  };
}

export interface PreprocessCacheDocLike {
  hashSha256: string;
  mimeType: string;
  calidadOrigen?: string | null;
  preprocessCache?: {
    hashSha256?: string | null;
    calidadOrigen?: string | null;
    derivados?: {
      miniaturaKey?: string | null;
      paginasNormalizadas?: string[] | null;
    } | null;
  } | null;
}

export function buildPreprocessCacheSnapshot(input: {
  hashSha256: string;
  mimeType: string;
  calidadOrigen: string;
  tipoDocumento: string;
  paginaCount: number;
  preprocessFlags: PreprocessCacheSnapshot["preprocessFlags"];
  derivados?: PreprocessCacheSnapshot["derivados"];
}): PreprocessCacheSnapshot {
  return {
    hashSha256: input.hashSha256,
    guardadoEn: new Date().toISOString(),
    mimeType: input.mimeType,
    calidadOrigen: input.calidadOrigen,
    tipoDocumento: input.tipoDocumento,
    paginaCount: input.paginaCount,
    preprocessFlags: input.preprocessFlags,
    derivados: input.derivados,
  };
}

/** Cache válida si coincide el hash del archivo y hay derivados (PDF) o miniatura (imagen). */
export function preprocessCacheEsValida(doc: PreprocessCacheDocLike): boolean {
  const cache = doc.preprocessCache;
  if (!cache?.hashSha256 || cache.hashSha256 !== doc.hashSha256) return false;
  if (cache.calidadOrigen === "ilegible" || cache.calidadOrigen === "pendiente") return false;

  const paginas = cache.derivados?.paginasNormalizadas?.length ?? 0;
  const miniatura = cache.derivados?.miniaturaKey;
  if (doc.mimeType === "application/pdf") return paginas > 0;
  if (doc.mimeType.startsWith("image/")) return Boolean(miniatura || paginas > 0);
  return paginas > 0 || Boolean(miniatura);
}
