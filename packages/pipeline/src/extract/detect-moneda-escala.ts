import type { ExtractedMetadata, ExtractTranscripcionPagina, MonedaEscalaExtracted } from "../types.js";
import { normalizarDenominacion } from "../utils/text.js";

const MONEDA_PATTERNS: { moneda: string; patterns: RegExp[] }[] = [
  { moneda: "ARS", patterns: [/pesos argentinos/i, /\bars\b/i, /millones de pesos/i, /miles de pesos/i, /\bpesos\b/i] },
  { moneda: "CLP", patterns: [/pesos chilenos/i, /\bclp\b/i, /millones de pesos chilenos/i] },
  { moneda: "USD", patterns: [/d[oó]lares/i, /\busd\b/i, /u\.?s\.?d\.?/i, /millones de usd/i, /miles de usd/i] },
  { moneda: "UF", patterns: [/\buf\b/i, /unidades de fomento/i] },
];

const ESCALA_PATTERNS: { factor: number; label: string; patterns: RegExp[] }[] = [
  {
    factor: 1_000,
    label: "miles",
    patterns: [
      /\bmus\$\b/i,
      /\bm\$\s*[-–]?\s*miles/i,
      /miles de pesos chilenos/i,
      /miles de d[oó]lares/i,
      /miles de pesos/i,
      /miles de/i,
      /expresad[oa]s en miles/i,
      /cifras en miles/i,
      /thousands of us/i,
    ],
  },
  { factor: 1_000_000, label: "millones", patterns: [/millones de/i, /expresad[oa]s en millones/i, /cifras en millones/i] },
  { factor: 1, label: "unidades", patterns: [/sin escala/i, /unidades de/i] },
];

function scanTextForMonedaEscala(text: string): MonedaEscalaExtracted | null {
  const normalized = normalizarDenominacion(text);
  let moneda: string | undefined;
  for (const entry of MONEDA_PATTERNS) {
    if (entry.patterns.some((p) => p.test(text) || p.test(normalized))) {
      moneda = entry.moneda;
      break;
    }
  }

  let escalaFactor = 1;
  let descripcionEscala: string | undefined;
  for (const entry of ESCALA_PATTERNS) {
    if (entry.patterns.some((p) => p.test(text) || p.test(normalized))) {
      escalaFactor = entry.factor;
      descripcionEscala = entry.label;
      break;
    }
  }

  if (!moneda && escalaFactor === 1 && !descripcionEscala) return null;
  return {
    moneda: moneda ?? "INDETERMINADA",
    escalaFactor,
    descripcionEscala,
    unidad: "moneda",
  };
}

function legacyEscalaToFactor(escala?: ExtractedMetadata["escala"]): number | undefined {
  if (escala === "millones") return 1_000_000;
  if (escala === "miles") return 1_000;
  if (escala === "unidades") return 1;
  return undefined;
}

/** Enriquece metadata con detección activa de moneda/escala desde transcripciones y metadatos LLM. */
export function enriquecerMonedaEscala(
  metadata: ExtractedMetadata,
  transcripcionPaginas?: ExtractTranscripcionPagina[]
): ExtractedMetadata {
  const textos = (transcripcionPaginas ?? []).map((t) => t.texto).join("\n");
  const detected = scanTextForMonedaEscala(textos);

  const moneda =
    metadata.moneda && metadata.moneda !== "indeterminada" && metadata.moneda !== "INDETERMINADA"
      ? metadata.moneda.toUpperCase()
      : detected?.moneda;

  const llmFactor = metadata.escalaFactor ?? legacyEscalaToFactor(metadata.escala);
  const textFactor = detected?.escalaFactor;
  // Texto del PDF (MUS$, miles de…) prevalece sobre escala inferida solo por LLM
  const escalaFactor =
    textFactor != null && textFactor !== 1 && llmFactor != null && textFactor !== llmFactor
      ? textFactor
      : (llmFactor ?? textFactor ?? 1);
  const descripcionEscala =
    escalaFactor === textFactor && detected?.descripcionEscala
      ? detected.descripcionEscala
      : (metadata.descripcionEscala ??
        detected?.descripcionEscala ??
        (metadata.escala && metadata.escala !== "indeterminada" ? metadata.escala : undefined));

  let escala = metadata.escala;
  if (escalaFactor === 1_000_000) escala = "millones";
  else if (escalaFactor === 1_000) escala = "miles";
  else if (escalaFactor === 1) escala = "unidades";

  return {
    ...metadata,
    moneda: moneda && moneda !== "INDETERMINADA" ? moneda : metadata.moneda,
    escala,
    escalaFactor,
    descripcionEscala,
  };
}
