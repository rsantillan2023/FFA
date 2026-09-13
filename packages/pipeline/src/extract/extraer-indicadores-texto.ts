import type {
  ExtractResult,
  IndicadorFinancieroExtracted,
  IndicadorOperativoExtracted,
  PaginaClasificada,
  PeriodoExtracted,
} from "../types.js";
import { parseMontoLocale } from "./parse-monto-locale.js";

interface TextoPagina {
  pagina: number;
  texto: string;
  seccion?: PaginaClasificada["seccion"];
}

function parseValor(raw: string, ctx: { moneda?: string; escala?: string; escalaFactor?: number }): number {
  return parseMontoLocale(raw.trim(), ctx).montoNormalizado;
}

function collectTextos(result: ExtractResult): TextoPagina[] {
  const byPage = new Map<number, TextoPagina>();

  for (const { pagina, texto } of result.transcripcionPaginas ?? []) {
    if (texto?.trim()) byPage.set(pagina, { pagina, texto: texto.trim() });
  }

  for (const pg of result.paginasClasificadas ?? []) {
    if (!pg.textoEscaneado?.trim()) continue;
    const existing = byPage.get(pg.pagina);
    if (!existing || pg.textoEscaneado.length > existing.texto.length) {
      byPage.set(pg.pagina, { pagina: pg.pagina, texto: pg.textoEscaneado.trim(), seccion: pg.seccion });
    }
  }

  return [...byPage.values()].sort((a, b) => a.pagina - b.pagina);
}

function inferEjercicio(texto: string, fallback?: number): number {
  if (fallback && Number.isFinite(fallback)) return fallback;

  const ejercicioExplicito = /ejercicio\s+(20\d{2})|terminado el 31 de [Dd]iciembre de[^0-9]{0,30}(20\d{2})/i.exec(
    texto
  );
  if (ejercicioExplicito) {
    const y = Number(ejercicioExplicito[1] ?? ejercicioExplicito[2]);
    if (Number.isFinite(y)) return y;
  }

  const years = [...texto.matchAll(/\b(202[0-9])\b/g)].map((m) => Number(m[1]));
  if (years.length) {
    const freq = new Map<number, number>();
    for (const y of years) freq.set(y, (freq.get(y) ?? 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }

  return new Date().getFullYear();
}

function periodoDesdeContexto(texto: string, index: number, ejercicio: number): PeriodoExtracted {
  const before = texto.slice(Math.max(0, index - 500), index);
  const qNear = [...before.matchAll(/4T(\d{2})/gi)].pop()?.[1];
  if (/4T\d{2}|tres meses|trimestre|cuarto trimestre/i.test(before)) {
    const q = qNear ?? /4T(\d{2})/i.exec(texto.slice(0, index + 100))?.[1];
    const ej = q ? 2000 + Number(q) : ejercicio;
    return {
      tipo: "TRIMESTRAL",
      ejercicio: ej,
      etiqueta: q ? `4T${q}` : "trimestral",
    };
  }
  if (/ejercicio\s+20|doce meses|12 meses/i.test(before)) {
    return { tipo: "ANUAL", ejercicio, etiqueta: String(ejercicio) };
  }
  return { tipo: "ANUAL", ejercicio, etiqueta: String(ejercicio) };
}

function dedupeIndicadores<T extends { denominacion: string; paginaNumero: number; periodo?: PeriodoExtracted; valor: number }>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.denominacion}|${item.periodo?.tipo ?? ""}|${item.periodo?.etiqueta ?? ""}|${item.valor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function extraerFinancierosDeTexto(
  textos: TextoPagina[],
  ctx: { moneda?: string; escala?: string; escalaFactor?: number; ejercicioDefault?: number }
): IndicadorFinancieroExtracted[] {
  const out: IndicadorFinancieroExtracted[] = [];

  for (const { pagina, texto, seccion } of textos) {
    // KPIs financieros: solo resumen ejecutivo (p1 típicamente)
    if (pagina !== 1 && seccion !== "resumen_ejecutivo") continue;
    const seccionPagina = seccion ?? (pagina === 1 ? "resumen_ejecutivo" : "otro");
    const ejercicio = inferEjercicio(texto, ctx.ejercicioDefault);

    const ebitdaRe =
      /ebitda\s+ajustado\s+consolidado[^P]{0,120}Ps\.?\s*([\d.,]+)\s*millones/gi;
    let m: RegExpExecArray | null;
    while ((m = ebitdaRe.exec(texto)) !== null) {
      out.push({
        nombre: "EBITDA Ajustado Consolidado",
        denominacion: "EBITDA Ajustado Consolidado",
        origen: "extraido",
        valor: parseValor(m[1]!, ctx),
        unidad: "moneda",
        moneda: ctx.moneda,
        escalaFactor: ctx.escalaFactor,
        periodo: periodoDesdeContexto(texto, m.index, ejercicio),
        paginaNumero: pagina,
        seccionPagina,
        fuentePrioridad: "resumen",
        confianzaExtraccion: 0.85,
      });
    }

    const margenRe =
      /margen\s+de\s+ebitda\s+ajustado\s+consolidado\s+se\s+situ[oó]\s+en\s+([\d,]+)\s*%/gi;
    while ((m = margenRe.exec(texto)) !== null) {
      out.push({
        denominacion: "Margen EBITDA Ajustado Consolidado",
        valor: parseValor(m[1]!, ctx),
        unidad: "porcentaje",
        periodo: periodoDesdeContexto(texto, m.index, ejercicio),
        paginaNumero: pagina,
        seccionPagina,
        fuentePrioridad: "resumen",
        confianzaExtraccion: 0.85,
      });
    }

    const deudaRe = /deuda\s+neta\s+se\s+ubic[oó]\s+en\s+Ps\.?\s*([\d.,]+)\s*millones/gi;
    if ((m = deudaRe.exec(texto)) !== null) {
      out.push({
        denominacion: "Deuda Neta",
        valor: parseValor(m[1]!, ctx),
        unidad: "moneda",
        moneda: ctx.moneda,
        escalaFactor: ctx.escalaFactor,
        periodo: periodoDesdeContexto(texto, m.index, ejercicio),
        paginaNumero: pagina,
        seccionPagina,
        fuentePrioridad: "resumen",
        confianzaExtraccion: 0.88,
      });
    }

    const ratioRe =
      /ratio\s+deuda\s+neta\s*\/?\s*ebitda\s+ajustado[^0-9]{0,60}([\d,]+)\s*x/gi;
    if ((m = ratioRe.exec(texto)) !== null) {
      out.push({
        denominacion: "Deuda Neta / EBITDA Ajustado",
        valor: parseValor(m[1]!, ctx),
        unidad: "ratio",
        periodo: periodoDesdeContexto(texto, m.index, ejercicio),
        paginaNumero: pagina,
        seccionPagina,
        fuentePrioridad: "resumen",
        confianzaExtraccion: 0.82,
      });
    }
  }

  return dedupeIndicadores(out);
}

/**
 * Tabla operativa típica: trim Q1/Q2, %var, anual Y1/Y2, %var.
 * El volumen anual del ejercicio vigente es el 4.º valor numérico tras la unidad (MM Tn / MM m3).
 */
function extraerVolumenAnualFila(texto: string, labelPattern: RegExp): number | undefined {
  const m = labelPattern.exec(texto);
  if (!m?.[0]) return undefined;
  const nums = [...m[0].matchAll(/(\d[\d,]*)/g)].map((x) => x[1]!);
  const unitIdx = m[0].search(/\bMM\s+(?:Tn|m3)\b/i);
  if (unitIdx < 0) return undefined;
  const afterUnit = m[0].slice(unitIdx).replace(/^MM\s+(?:Tn|m3)\s+/i, "");
  const rowNums = [...afterUnit.matchAll(/(\d[\d,]*)/g)].map((x) => x[1]!);
  // índice 3 = columna anual ejercicio vigente (tras 2 trimestres + % var trimestral)
  const raw = rowNums[3] ?? nums[nums.length - 3];
  if (!raw) return undefined;
  return parseValor(raw, {});
}

function extraerOperativosDeTexto(textos: TextoPagina[]): IndicadorOperativoExtracted[] {
  const out: IndicadorOperativoExtracted[] = [];
  const filas: { pattern: RegExp; label: string }[] = [
    { pattern: /Cemento[\s\S]{0,160}MM Tn[\s\S]{0,80}/i, label: "Cemento (cemento, albañilería y cal)" },
    { pattern: /Hormig[oó]n\s+MM m3[\s\S]{0,80}/i, label: "Hormigón" },
    { pattern: /Ferroviario\s+MM Tn[\s\S]{0,80}/i, label: "Ferroviario" },
    { pattern: /Agregados\s+MM Tn[\s\S]{0,80}/i, label: "Agregados" },
  ];

  for (const { pagina, texto, seccion } of textos) {
    if (seccion !== "operativo" && !/vol[uú]menes de ventas|MM Tn|MM m3/i.test(texto)) continue;
    if (!/MM Tn|MM m3|vol[uú]men/i.test(texto)) continue;

    for (const { pattern, label } of filas) {
      const valor = extraerVolumenAnualFila(texto, pattern);
      if (valor == null) continue;
      out.push({
        denominacion: label,
        valor,
        unidad: "volumen",
        paginaNumero: pagina,
        seccionPagina: "operativo",
        confianzaExtraccion: 0.78,
      });
    }
  }

  return dedupeIndicadores(out);
}

/** Extrae indicadores desde transcripciones LLM y texto escaneado del PDF. */
export function extraerIndicadoresDesdeTranscripcion(result: ExtractResult): {
  financieros: IndicadorFinancieroExtracted[];
  operativos: IndicadorOperativoExtracted[];
} {
  const ctx = {
    moneda: result.metadata.moneda,
    escala: result.metadata.escala,
    escalaFactor: result.metadata.escalaFactor,
    ejercicioDefault: result.metadata.periodo?.ejercicio,
  };

  const textos = collectTextos(result);
  return {
    financieros: extraerFinancierosDeTexto(textos, ctx),
    operativos: extraerOperativosDeTexto(textos),
  };
}
