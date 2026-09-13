import type { ExtractedMetadata, ExtractTranscripcionPagina } from "../types.js";
import { normalizarDenominacion } from "../utils/text.js";

const GENERIC_RAZON = /desconocid|unknown|^empresa$|sin nombre|n\/a|no identificad/i;

const CUIT_PATTERN = /\b\d{2}-\d{8}-\d\b/;
const RUT_PATTERN = /\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/;

function isGenericRazonSocial(name?: string): boolean {
  if (!name?.trim()) return true;
  return GENERIC_RAZON.test(normalizarDenominacion(name));
}

/** Mejora metadata: evita "Desconocida", detecta CUIT/RUT desde transcripciones. */
export function enriquecerMetadataIdentidad(
  metadata: ExtractedMetadata,
  transcripcionPaginas?: ExtractTranscripcionPagina[]
): ExtractedMetadata {
  const textos = (transcripcionPaginas ?? []).map((t) => t.texto).join("\n");

  let razonSocial = metadata.razonSocial;
  if (isGenericRazonSocial(razonSocial)) {
    // Buscar "Loma Negra" u otras razones sociales en texto escaneado
    const patterns = [
      /Loma Negra(?:\s+[A-Z][a-záéíóú]+)*/i,
      /(?:raz[oó]n social|company)[:\s]+([A-ZÁÉÍÓÚÑ][^\n,]{3,80})/i,
    ];
    for (const p of patterns) {
      const m = p.exec(textos);
      if (m) {
        const candidate = (m[1] ?? m[0]).trim();
        if (!isGenericRazonSocial(candidate)) {
          razonSocial = candidate;
          break;
        }
      }
    }
  }

  let identificadorFiscal = metadata.rut;
  let paisFiscal: string | undefined;

  if (!identificadorFiscal?.trim()) {
    const cuit = CUIT_PATTERN.exec(textos)?.[0];
    const rut = RUT_PATTERN.exec(textos)?.[0];
    if (cuit) {
      identificadorFiscal = cuit;
      paisFiscal = "AR";
    } else if (rut) {
      identificadorFiscal = rut;
      paisFiscal = "CL";
    }
  } else if (CUIT_PATTERN.test(identificadorFiscal)) {
    paisFiscal = "AR";
  } else if (RUT_PATTERN.test(identificadorFiscal)) {
    paisFiscal = "CL";
  }

  return {
    ...metadata,
    razonSocial: isGenericRazonSocial(razonSocial) ? metadata.razonSocial : razonSocial,
    rut: paisFiscal === "CL" ? identificadorFiscal : metadata.rut,
    ...(identificadorFiscal
      ? {
          identificadorFiscal,
          paisFiscal,
        }
      : {}),
  };
}

export function metadataScoreEnriched(meta: ExtractedMetadata): number {
  let score = 0;
  if (meta.razonSocial?.trim() && !isGenericRazonSocial(meta.razonSocial)) score += 5;
  if (meta.identificadorFiscal?.trim() || meta.rut?.trim()) score += 2;
  if (meta.moneda?.trim() && meta.moneda !== "indeterminada") score += 1;
  if (meta.escala && meta.escala !== "indeterminada") score += 1;
  if (meta.periodo?.ejercicio) score += 1;
  return score;
}
