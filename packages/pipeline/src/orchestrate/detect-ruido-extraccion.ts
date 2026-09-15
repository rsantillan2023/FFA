/** Detección de líneas que no son partidas contables (ruido OCR / texto legal). */

import { esLineaNoBalanceDetalle } from "./detect-tablas-no-balance.js";

export interface LineaRuidoLike {
  denominacionOriginal: string;
  montoOriginal?: number;
  montoNormalizado?: number;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function montoAbs(linea: LineaRuidoLike): number {
  return Math.abs(linea.montoNormalizado ?? linea.montoOriginal ?? 0);
}

/** Firmas, matrículas, texto legal y fragmentos narrativos mal interpretados como línea. */
export function esLineaProbableRuidoExtraccion(linea: LineaRuidoLike): boolean {
  const raw = linea.denominacionOriginal.trim();
  const d = norm(raw);
  if (!d) return true;
  if (d.length > 220) return false;

  if (/\bmatr[ií]cula\b/.test(d)) return true;
  if (/\bcontador\s+p[uú]blico\b/.test(d)) return true;
  if (/\bc\.?\s*p\.?\s*n/.test(d)) return true;
  if (/\bcr\.?\s+[a-záéíóú]/i.test(raw)) return true;
  if (/\bfirmad[oa]\s+por\b/.test(d)) return true;
  if (/\binforme\s+de\s+auditor/i.test(d) && !/\b\d{1,3}(\.\d{3})+\b/.test(d.slice(-30))) {
    return true;
  }

  if (/\bmillones,\s*en\s+comparaci[oó]n\b/.test(d)) return true;
  if (/\ben\s+comparaci[oó]n\s+con\s+ps\.?\b/.test(d)) return true;
  if (/^millones\b/.test(d) && !/\b\d{1,3}(\.\d{3})+\b/.test(d)) return true;
  if (/\bnota\s+\d+\s+al\b/.test(d) && montoAbs(linea) === 0) return true;
  if (/\bver\s+nota\b/.test(d) && montoAbs(linea) === 0) return true;
  if (/\bseg[uú]n\s+se\s+menciona\b/.test(d)) return true;
  if (/\bcomo\s+se\s+(indica|describe|menciona)\b/.test(d)) return true;
  if (/\bestados?\s+financieros?\s+consolidados?\b/.test(d) && montoAbs(linea) === 0) return true;
  if (/\bexpresados?\s+en\s+(pesos|miles|millones)\b/.test(d) && montoAbs(linea) === 0) return true;
  if (/^(pesos|miles|millones|ars|usd)\b/.test(d) && d.length < 40) return true;

  if (/^por acci[oó]n\b/.test(d)) return true;
  if (/\btotalidad de la participaci[oó]n\b/.test(d)) return true;
  if (/\bmercado argentino de valores\b/.test(d)) return true;
  if (/\by la totalidad de la participaci[oó]n\b/.test(d)) return true;
  if (/\bde valores s\.?\s*a\.?\s*de\b/.test(d) && d.length < 120) return true;
  if (/\bincluyendo\s+la\s+totalidad\b/.test(d)) return true;
  if (/\bacciones\s+ordinarias\b/.test(d) && montoAbs(linea) > 0 && d.length < 100) return true;

  if (/^[,.;:()\-\s]+$/.test(d)) return true;
  if (d.length <= 3 && !/\d/.test(d)) return true;

  return false;
}

/** Normaliza denominaciones con encabezado de sección fusionado por OCR. */
export function normalizarDenominacionOcrBalance(denominacion: string): string {
  let d = denominacion.trim();
  if (/^patrimonio y pasivos\s+totales$/i.test(d)) return d;
  if (/^patrimonio y pasivos\s+/i.test(d) && /capital/i.test(d)) {
    d = d.replace(/^patrimonio y pasivos\s+/i, "");
  }
  if (/^pasivos\s+pasivos no corrientes\s+/i.test(d) && !/totales$/i.test(d)) {
    d = d.replace(/^pasivos\s+pasivos no corrientes\s+/i, "");
  }
  if (/^pasivos\s+pasivos corrientes\s+/i.test(d) && !/totales$/i.test(d)) {
    d = d.replace(/^pasivos\s+pasivos corrientes\s+/i, "");
  }
  if (/^activos corrientes\s+(inventarios)/i.test(d)) {
    d = d.replace(/^activos corrientes\s+(inventarios)/i, "$1");
  }
  return d.trim() || denominacion.trim();
}

/** OCR del balance: encabezados fusionados, columnas repetidas y narrativa de otras secciones. */
export function esLineaProbableRuidoOcrBalance(linea: LineaRuidoLike): boolean {
  const raw = linea.denominacionOriginal.trim();
  const d = norm(raw);
  if (!d) return false;
  const m = montoAbs(linea);

  if (/\b(\d{1,4})\s+\1\b/.test(raw)) return true;
  if (/\b\d{3}\s+\d{3}\b/.test(raw) && /activos|pasivos|totales/i.test(d) && m < 1e12) return true;

  if (m >= 1e9) {
    // Monto material: conservar (Capital, Préstamos con encabezado fusionado).
  } else {
    if (/^pasivos\s/i.test(d) && /pr[eé]stamos|corrientes|no corrientes/i.test(d)) return true;
    if (/^patrimonio y pasivos\s/i.test(d) && /capital/i.test(d)) return true;
    if (/^activos corrientes\s/i.test(d) && /inventarios/i.test(d)) return true;
  }

  if (/\baumentaron\s+\d/i.test(d)) return true;
  if (/\b4t\d{2}\b/i.test(d)) return true;
  if (/efectivo y equivalentes.*(inicio|cierre|ejercicio|per[ií]odo)/i.test(d)) return true;
  if (/^al cierre del per/i.test(d)) return true;
  if (/^promedio$/i.test(d)) return true;
  if (/plan de recompra de acciones/i.test(d)) return true;
  if (/^a\)\s/i.test(d)) return true;
  if (/^ganancia (bruta|atribuible)/i.test(d)) return true;
  if (/^propietarios de la controladora$/i.test(d)) return true;
  if (/^ganancia\s*\(\s*p[eé]rdida\s*\)\s*neta/i.test(d)) return true;
  if (/^diferido$/i.test(d)) return true;
  if (/^corriente$/i.test(d)) return true;
  if (/^alcanzando\s+ps\.?$/i.test(d)) return true;
  if (/\ben el 4t\d{2}\b/i.test(d)) return true;
  if (/resultado por exposici[oó]n al cambio del poder/i.test(d)) return true;
  if (/^pago de dividendos\s*-\s*-/i.test(d)) return true;

  return false;
}

/** Línea sin sentido contable: texto narrativo, sin monto significativo, o demasiado corta. */
export function esLineaSinSentidoContable(linea: LineaRuidoLike): boolean {
  if (esLineaProbableRuidoExtraccion(linea)) return true;
  if (esLineaProbableRuidoOcrBalance(linea)) return true;
  if (esLineaNoBalanceDetalle(linea)) return true;

  const d = norm(linea.denominacionOriginal);
  const m = montoAbs(linea);

  if (!d) return true;
  if (m === 0 && d.length > 60 && !/\b(caja|banco|deuda|capital|reserva|activo|pasivo)\b/.test(d)) {
    return true;
  }
  if (d.length < 5 && m === 0) return true;
  if (/^(y|o|de|la|el|en|con|por|a|al|del|los|las)\b/.test(d) && m === 0) return true;

  const palabras = d.split(/\s+/).filter(Boolean);
  if (palabras.length >= 6 && m === 0 && !/\d/.test(d)) return true;

  return false;
}
