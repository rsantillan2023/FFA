/** Detección de líneas de flujo de efectivo, segmentos y tablas analíticas (no balance). */

import type { LineaRuidoLike } from "./detect-ruido-extraccion.js";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Título de tabla que marca toda la página como no-balance. */
export function esLineaTituloTablaNoBalance(linea: LineaRuidoLike): boolean {
  const d = norm(linea.denominacionOriginal);
  if (!d) return false;
  if (/estado de flujo de efectivo/.test(d)) return true;
  if (/flujo de efectivo por actividades/.test(d)) return true;
  if (/informaci[oó]n por segmentos/.test(d)) return true;
  if (/^ingresos por ventas netos\s/.test(d) && /100[,.]?0?\s*%/.test(d)) return true;
  return false;
}

/** Filas típicas de tabla de segmentos (Cemento, Hormigón, % OCR). */
export function esLineaProbableTablaSegmentos(linea: LineaRuidoLike): boolean {
  const raw = linea.denominacionOriginal.trim();
  const d = norm(raw);
  if (!d) return false;

  if (/^ingresos por ventas netos/.test(d)) return true;
  if (/^costo de ventas\s/.test(d) && /\d+[,.]?\d*\s*%\s*\d/.test(raw)) return true;
  if (/^gastos de comercializaci[oó]n/.test(d) && /100[,.]?0?\s*%/.test(raw)) return true;
  if (/^depreciaciones y amortizaciones\s/.test(d) && /100[,.]?0?\s*%/.test(raw)) return true;
  if (/^ebitda ajustado/.test(d)) return true;
  if (/^partidas reconciliatorias/.test(d)) return true;

  if (/^cemento,\s*alba[nñ]iler[ií]a\s+y\s+cal/.test(d)) return true;
  if (/^hormig[oó]n\b/.test(d) && (/\d+[,.]?\d*\s*%/.test(raw) || d === "hormigon")) return true;
  if (/^ferroviario\b/.test(d) && (/\d+[,.]?\d*\s*%/.test(raw) || d === "ferroviario")) return true;
  if (/^agregados\b/.test(d) && (/\d+[,.]?\d*\s*%/.test(raw) || d === "agregados")) return true;
  if (/^eliminaciones$/.test(d)) return true;
  if (/^otros$/.test(d) && /\d+[,.]?\d*\s*%/.test(raw)) return true;

  if (/\d+[,.]?\d*\s*%\s+\d+[,.]?\d*\s*%/.test(raw)) return true;
  if (/\d+\s+\d+[,.]?\d*\s*%\s+\d+/.test(raw)) return true;

  return false;
}

/** Movimientos de flujo de caja / financiación (pág. flujo de efectivo). */
export function esLineaProbableFlujoCaja(linea: LineaRuidoLike): boolean {
  const d = norm(linea.denominacionOriginal);
  if (!d) return false;

  if (/\bflujo neto de efectivo\b/.test(d)) return true;
  if (/\bflujo de efectivo por actividades\b/.test(d)) return true;
  if (/^nuevos pr[eé]stamos$/.test(d)) return true;
  if (/^pagos de pr[eé]stamos$/.test(d)) return true;
  if (/^intereses pagados$/.test(d)) return true;
  if (/^intereses perdidos$/.test(d)) return true;
  if (/^pago de dividendos$/.test(d)) return true;
  if (/^deudas por arrendamiento$/.test(d)) return true;
  if (/^emisi[oó]n de obligaciones/.test(d)) return true;
  if (/^compra de acciones propias/.test(d)) return true;
  if (/^variaci[oó]n neta del efectivo/.test(d)) return true;
  if (/^efectivo y equivalentes al (inicio|cierre)/.test(d)) return true;
  if (/^ingresos por vencimientos de inversiones$/.test(d)) return true;
  if (/^adquisici[oó]n de (intangibles|inversiones|propiedades)/.test(d)) return true;
  if (/^ingresos por venta de propiedades/.test(d)) return true;
  if (/^aportes al f\.?f\.?f/.test(d)) return true;
  if (/^impuesto a las ganancias pagado$/.test(d)) return true;
  if (/^cambios en activos y pasivos operacionales$/.test(d)) return true;
  if (/^ajustes para arribar al flujo/.test(d)) return true;

  return false;
}

export function esLineaNoBalanceDetalle(linea: LineaRuidoLike): boolean {
  return (
    esLineaTituloTablaNoBalance(linea) ||
    esLineaProbableTablaSegmentos(linea) ||
    esLineaProbableFlujoCaja(linea)
  );
}

const PATRONES_BLOQUE_FLUJO_AJUSTES = [
  /remuneraciones y cargas sociales/i,
  /depreciaci/i,
  /cuentas comerciales por cobrar/i,
  /cuentas por pagar/i,
  /anticipos de clientes/i,
  /impuestos por pagar/i,
  /provisiones/i,
  /otras deudas/i,
  /diferencia de cambio/i,
  /desvalorizaci[oó]n del fondo fiduciario/i,
];

function esPaginaBloqueFlujoAjustes(
  pageLines: Array<{ denominacionOriginal: string }>
): boolean {
  const text = pageLines.map((l) => l.denominacionOriginal).join(" ");
  if (/activos totales|pasivos totales|patrimonio y pasivos totales/i.test(text)) {
    return false;
  }
  const hits = PATRONES_BLOQUE_FLUJO_AJUSTES.filter((p) => p.test(text)).length;
  return hits >= 4;
}

function esPaginaTablaSegmentosTardia(
  pagina: number,
  pageLines: Array<{ denominacionOriginal: string; rubroCodigo?: string }>
): boolean {
  if (pagina < 13) return false;
  const erRubros = pageLines.filter((l) => /^4\./.test(l.rubroCodigo ?? "")).length;
  const text = pageLines.map((l) => l.denominacionOriginal).join(" ");
  if (erRubros >= 2) return true;
  if (/costo de ventas|gastos de comercializaci|resultados financieros/i.test(text)) {
    return true;
  }
  if (pageLines.filter((l) => esLineaProbableTablaSegmentos(l)).length >= 2) return true;
  return false;
}

/** Detecta páginas cuyo contenido es flujo o segmentos (para purga por página). */
export function detectarPaginasNoBalance(
  lineas: Array<{ paginaNumero?: number; denominacionOriginal: string; rubroCodigo?: string }>
): { flujo: number[]; segmentos: number[] } {
  const flujo = new Set<number>();
  const segmentos = new Set<number>();
  const byPage = new Map<number, typeof lineas>();

  for (const l of lineas) {
    const p = l.paginaNumero;
    if (!p) continue;
    const g = byPage.get(p) ?? [];
    g.push(l);
    byPage.set(p, g);

    const like = { denominacionOriginal: l.denominacionOriginal };
    const d = norm(l.denominacionOriginal);

    if (/estado de flujo de efectivo|flujo de efectivo por actividades/i.test(d)) {
      flujo.add(p);
    }
    if (/informaci[oó]n por segmentos/i.test(d)) {
      segmentos.add(p);
    }
    if (/^ingresos por ventas netos/i.test(d) && /100[,.]?0?\s*%/i.test(l.denominacionOriginal)) {
      segmentos.add(p);
    }
    if (esLineaProbableTablaSegmentos(like)) {
      segmentos.add(p);
    }
    if (esLineaProbableFlujoCaja(like)) {
      flujo.add(p);
    }
  }

  for (const [pagina, pageLines] of byPage) {
    if (esPaginaBloqueFlujoAjustes(pageLines)) {
      flujo.add(pagina);
    }
    if (esPaginaTablaSegmentosTardia(pagina, pageLines)) {
      segmentos.add(pagina);
    }
  }

  return {
    flujo: [...flujo].sort((a, b) => a - b),
    segmentos: [...segmentos].sort((a, b) => a - b),
  };
}
