import type { ExtractResult, NormalizeLogEntry, NormalizeResult, NormalizedLine } from "../types.js";
import { evaluarEscala, esEjercicioDesactualizado, normalizarPeriodo } from "./normalize-metadata.js";
import { parseMontoChileno } from "../utils/monto-chileno.js";
import { normalizarDenominacion } from "../utils/text.js";

const ESCALA_MULTIPLIER: Record<string, number> = {
  unidades: 1,
  miles: 1_000,
  millones: 1_000_000,
  indeterminada: 1,
};

/** Resuelve multiplicador: M$ / miles aplica ×1000 una sola vez; evita doble escala si ya vienen en pesos. */
function resolverMultiplicadorEscala(
  metadata: ExtractResult["metadata"],
  montos: number[],
  escalaDeclarada: NonNullable<ExtractResult["metadata"]["escala"]>
): number {
  const fromFactor =
    metadata.escalaFactor != null && metadata.escalaFactor > 0 ? metadata.escalaFactor : undefined;
  const fromEscala = ESCALA_MULTIPLIER[escalaDeclarada] ?? 1;
  let multiplier = fromFactor ?? fromEscala;

  const maxAbs = Math.max(0, ...montos.map((m) => Math.abs(Number(m) || 0)));
  const escalaMiles = escalaDeclarada === "miles" || metadata.escalaFactor === 1_000;
  // Cifras M$ típicas: 10^9–10^11; si ya están en pesos completos (>5×10^11), no multiplicar otra vez
  if (escalaMiles && maxAbs > 500_000_000_000) {
    multiplier = 1;
  }

  return multiplier;
}

export function normalizeExtractResult(
  input: ExtractResult,
  opts?: { normalizeLog?: NormalizeLogEntry[]; añoVigente?: number }
): NormalizeResult {
  const log = opts?.normalizeLog ?? [];
  const montos = input.lineas.map((l) => l.montoOriginal);
  const escala = evaluarEscala(input.metadata, montos, log);
  const multiplier = resolverMultiplicadorEscala(input.metadata, montos, escala);
  const periodo = normalizarPeriodo(input.metadata.periodo);

  if (esEjercicioDesactualizado(periodo?.ejercicio, opts?.añoVigente)) {
    log.push({
      at: new Date(),
      etapa: "periodo",
      mensaje: `Ejercicio ${periodo?.ejercicio} desactualizado (D.14)`,
    });
  }

  if (input.metadata.moneda?.toUpperCase() === "CLP") {
    log.push({
      at: new Date(),
      etapa: "moneda",
      mensaje: "Convención numérica CLP aplicada (C.15)",
    });
  }

  const lineas: NormalizedLine[] = input.lineas.map((linea) => {
    const montoBase =
      typeof linea.montoOriginal === "number"
        ? linea.montoOriginal
        : parseMontoChileno(String(linea.montoOriginal));
    const montoNormalizado = montoBase * multiplier;
    return {
      ...linea,
      denominacionNormalizada: normalizarDenominacion(linea.denominacionOriginal),
      montoNormalizado,
      signoAplicado: montoNormalizado >= 0 ? "positivo" : "negativo",
    };
  });

  log.push({
    at: new Date(),
    etapa: "montos",
    mensaje: `${lineas.length} líneas normalizadas, multiplier=${multiplier}`,
  });

  return {
    metadata: {
      ...input.metadata,
      escala,
      periodo,
    },
    lineas,
  };
}