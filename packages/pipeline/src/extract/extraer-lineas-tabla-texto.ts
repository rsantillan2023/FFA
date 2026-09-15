import type {
  CoberturaTablaPagina,
  ExtractedLine,
  ExtractResult,
  PaginaClasificada,
  SeccionPagina,
} from "../types.js";
import type { EstadoFinanciero } from "@ffa/shared";
import { normalizarDenominacion } from "../utils/text.js";
import { inferPeriodoFromColumna } from "./infer-periodo.js";
import { parseMontoLocale } from "./parse-monto-locale.js";

const MONTO_TOKEN =
  String.raw`\(\s*[\d.,]+\s*\)|[\d]{1,3}(?:\.[\d]{3})+(?:,[\d]+)?`;

const FILA_TABLA_RE = new RegExp(
  String.raw`([A-Za-zÁÉÍÓÚÑáéíóúñ(][A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s,().\-–/'%]{3,120}?)\s+((?:${MONTO_TOKEN})(?:\s+(?:${MONTO_TOKEN}|[-\d.,]+(?:%|n\/a)?))*)`,
  "gi"
);

/** Encabezados de sección — no son filas contables. */
const SECCION_HEADER =
  /^(activos|pasivos|patrimonio|capital|flujo de efectivo|activos no corrientes|activos corrientes|pasivos corrientes|pasivos no corrientes|impuesto a las ganancias)$/i;

export interface FilaTablaDetectada {
  denominacion: string;
  valoresTexto: string[];
  pagina: number;
  seccion: SeccionPagina;
  textoPagina?: string;
}

export interface BuildLineasTextoCtx {
  moneda?: string;
  escala?: string;
  escalaFactor?: number;
  locale?: "es-AR";
  ejercicio?: number;
}

function parseCtx(result: ExtractResult): BuildLineasTextoCtx {
  return {
    moneda: result.metadata.moneda,
    escala: result.metadata.escala,
    escalaFactor: result.metadata.escalaFactor,
    locale: (result.metadata as { localeNumerico?: string }).localeNumerico as "es-AR" | undefined,
    ejercicio: result.metadata.periodo?.ejercicio,
  };
}

function limpiarDenominacionTabla(denom: string): string {
  return denom
    .replace(/^negocios (no )?bancarios\s+/i, "")
    .replace(/^miles de pesos chilenos\s+(estado de resultados\s+\d+\s+)?/i, "")
    .replace(/^estado de resultados\s+\d+\s+/i, "")
    .trim();
}

/** Infiere activo/pasivo/patrimonio según denominación y contexto de la página. */
export function inferEstadoFinancieroDesdePagina(
  denominacion: string,
  seccion: SeccionPagina,
  textoPagina?: string
): EstadoFinanciero | "flujo" | "resultados" {
  const d = normalizarDenominacion(denominacion);
  if (seccion === "resultados") return "resultados";
  if (seccion === "flujo_efectivo") return "flujo";

  if (
    /pasivo|prestamo|deuda|provision|impuesto por pagar|cuenta por pagar|deposito|obligacion|arrendamiento/.test(
      d
    )
  ) {
    return "pasivo";
  }
  if (/patrimonio|capital emitido|reserva|ganancia acumulada|participaciones no control|primas de emisi/.test(d)) {
    return "patrimonio";
  }

  const t = (textoPagina ?? "").toLowerCase();
  if (seccion === "balance") {
    if (/pasivos y patrimonio|patrimonio neto y pasivos|patrimonio y pasivos/.test(t)) {
      if (/patrimonio|capital emitido|reserva|ganancia acumulada|participaciones|primas de emisi/.test(d)) {
        return "patrimonio";
      }
      return "pasivo";
    }
    if (/\bactivos\b/.test(t) && !/pasivos y patrimonio/.test(t)) {
      return "activo";
    }
  }

  return "activo";
}

/** Detecta filas con montos en texto de tabla financiera (independiente del LLM). */
export function detectarFilasTablaEnTexto(
  texto: string,
  pagina: number,
  seccion: SeccionPagina
): FilaTablaDetectada[] {
  if (!texto?.trim()) return [];

  const t = texto.replace(/\s+/g, " ").trim();
  const filas: FilaTablaDetectada[] = [];
  const seen = new Set<string>();

  for (const m of t.matchAll(FILA_TABLA_RE)) {
    let denom = limpiarDenominacionTabla(m[1]?.trim().replace(/\s+/g, " ") ?? "");
    if (denom.length < 4 || denom.length > 90 || SECCION_HEADER.test(denom)) continue;
    if (/^tabla\s+\d+/i.test(denom)) continue;
    if (/^tres meses|^doce meses|^al 31 de|^e diciembre de/i.test(denom)) continue;
    if (/\d{4}\s+\d{4}\s+%\s*var/i.test(denom)) continue;
    if (/^n\/a\s/i.test(denom)) continue;
    // Filas fusionadas por OCR — recortar al concepto contable final
    if (/ingresos por ventas netas/i.test(denom)) denom = "Ingresos por ventas netas";
    if (/^impuesto a las ganancias corriente/i.test(denom)) denom = "Impuesto a las ganancias Corriente";
    if (/^ganancia \(p[eé]rdida\) neta del per[ií]odo/i.test(denom)) denom = "Ganancia (pérdida) neta del período";
    if (/^ganancia \(p[eé]rdida\) neta$/i.test(denom) || /^n\/a ganancia/i.test(denom)) denom = "Ganancia (pérdida) neta";

    const valoresRaw = m[2]?.trim() ?? "";
    const valoresTexto = [...valoresRaw.matchAll(/(\(\s*[\d.,]+\s*\)|[\d]{1,3}(?:\.[\d]{3})+(?:,[\d]+)?)/g)].map(
      (x) => x[1]!
    );
    if (!valoresTexto.length) continue;

    const key = normalizarDenominacion(denom);
    if (seen.has(key)) continue;
    seen.add(key);

    filas.push({ denominacion: denom, valoresTexto, pagina, seccion, textoPagina: t });
  }

  return filas;
}

function columnaParaIndice(indice: number, numValores: number): string {
  // Tabla comparativa típica: Q2025, Q2024, [var%], Anual2025, Anual2024
  if (numValores >= 4) {
    if (indice === 0) return "2025";
    if (indice === 1) return "2024";
    if (indice === 3) return "2025";
    if (indice === 4) return "2024";
  }
  if (numValores >= 2) {
    return indice === 0 ? "2025" : "2024";
  }
  return "2025";
}

/** Primera columna monetaria = periodo principal de la tabla (trimestre o ejercicio vigente). */
function indiceCanonico(_numValores: number, _seccion: SeccionPagina): number {
  return 0;
}

function filaATlineas(fila: FilaTablaDetectada, ctx: BuildLineasTextoCtx): ExtractedLine[] {
  const out: ExtractedLine[] = [];
  const indices = [indiceCanonico(fila.valoresTexto.length, fila.seccion)];

  for (const idx of indices) {
    const raw = fila.valoresTexto[idx];
    if (!raw) continue;
    const parsed = parseMontoLocale(raw, {
      moneda: ctx.moneda,
      escala: ctx.escala,
      escalaFactor: ctx.escalaFactor,
      localePreferido: ctx.locale,
    });
    const columnaOrigen = columnaParaIndice(idx, fila.valoresTexto.length);
    const periodo = inferPeriodoFromColumna(columnaOrigen);

    out.push({
      denominacionOriginal: fila.denominacion,
      montoOriginalTexto: parsed.montoOriginalTexto,
      montoOriginal: parsed.montoNormalizado,
      montoNormalizado: parsed.montoNormalizado,
      localeDetectado: parsed.localeDetectado,
      separadorMiles: parsed.separadorMiles,
      separadorDecimal: parsed.separadorDecimal,
      columnaOrigen,
      periodo,
      paginaNumero: fila.pagina,
      seccionPagina: fila.seccion,
      fuentePrioridad: "canonico",
      estadoFinancieroLinea: inferEstadoFinancieroDesdePagina(
        fila.denominacion,
        fila.seccion,
        fila.textoPagina
      ),
      confianzaExtraccion: 0.82,
      metodoExtraccion: "heuristica",
    });
  }

  return out;
}

function lineaKey(linea: ExtractedLine): string {
  const denom = normalizarDenominacion(linea.denominacionOriginal);
  const col = linea.columnaOrigen ?? linea.periodo?.ejercicio ?? "";
  return `${linea.paginaNumero}|${denom}|${col}|${linea.seccionPagina ?? ""}`;
}

/** Construye líneas desde texto escaneado (sin depender de Vision). */
export function buildLineasDesdeTextoEscaneado(
  paginas: PaginaClasificada[],
  ctx: BuildLineasTextoCtx
): ExtractedLine[] {
  const out: ExtractedLine[] = [];
  const seen = new Set<string>();

  for (const pg of paginas) {
    if (!pg.textoEscaneado?.trim()) continue;
    if (!["balance", "resultados", "flujo_efectivo"].includes(pg.seccion)) continue;

    const filas = detectarFilasTablaEnTexto(pg.textoEscaneado, pg.pagina, pg.seccion);
    for (const fila of filas) {
      fila.textoPagina = pg.textoEscaneado;
      for (const linea of filaATlineas(fila, ctx)) {
        const key = lineaKey(linea);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(linea);
      }
    }
  }

  return out;
}

/** Completa líneas faltantes desde texto escaneado del PDF. */
export function complementarLineasDesdeTextoEscaneado(result: ExtractResult): ExtractResult {
  const ctx = parseCtx(result);
  const existentes = new Set(result.lineas.map(lineaKey));
  const complementarias: ExtractedLine[] = [];

  for (const pg of result.paginasClasificadas ?? []) {
    if (!pg.textoEscaneado?.trim()) continue;
    if (!["balance", "resultados", "flujo_efectivo"].includes(pg.seccion)) continue;

    const filas = detectarFilasTablaEnTexto(pg.textoEscaneado, pg.pagina, pg.seccion);
    for (const fila of filas) {
      for (const linea of filaATlineas(fila, ctx)) {
        const key = lineaKey(linea);
        if (existentes.has(key)) continue;
        existentes.add(key);
        complementarias.push(linea);
      }
    }
  }

  if (!complementarias.length) return result;

  return {
    ...result,
    lineas: [...result.lineas, ...complementarias],
  };
}

/** Cobertura por tabla vs líneas extraídas (detección independiente). */
export function calcularCoberturaTablas(
  result: ExtractResult,
  lineasFinales: ExtractedLine[]
): CoberturaTablaPagina[] {
  const out: CoberturaTablaPagina[] = [];

  for (const pg of result.paginasClasificadas ?? []) {
    if (!pg.textoEscaneado?.trim()) continue;
    if (!["balance", "resultados", "flujo_efectivo"].includes(pg.seccion)) continue;
    if (!pg.incluida) continue;

    const detectadas = detectarFilasTablaEnTexto(pg.textoEscaneado, pg.pagina, pg.seccion);
    const detectadasSet = new Set(detectadas.map((f) => normalizarDenominacion(f.denominacion)));

    const extraidasEnPagina = lineasFinales.filter(
      (l) => l.paginaNumero === pg.pagina && l.seccionPagina === pg.seccion
    );
    const extraidasSet = new Set(extraidasEnPagina.map((l) => normalizarDenominacion(l.denominacionOriginal)));

    const omitidas = [...detectadasSet].filter((d) => !extraidasSet.has(d));
    const filasDetectadas = detectadasSet.size;
    const filasExtraidas = [...detectadasSet].filter((d) => extraidasSet.has(d)).length;
    const cobertura =
      filasDetectadas > 0 ? Math.round(1000 * (filasExtraidas / filasDetectadas)) / 10 : 100;

    out.push({
      pagina: pg.pagina,
      tipo: pg.seccion,
      filasDetectadas,
      filasExtraidas,
      filasOmitidas: omitidas.length,
      cobertura,
      filasDetectadasLista: [...detectadasSet],
      filasExtraidasLista: [...extraidasSet].filter((d) => detectadasSet.has(d)),
      filasOmitidasLista: omitidas,
    });
  }

  return out;
}
