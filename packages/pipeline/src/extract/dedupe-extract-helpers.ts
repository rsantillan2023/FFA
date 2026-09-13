import type { ExtractedLine, FuentePrioridad, SeccionPagina } from "../types.js";
import { normalizarDenominacion } from "../utils/text.js";

const OPERATIVO_DENOM_PATTERNS = [
  /\bcemento\b/i,
  /\btoneladas?\b/i,
  /\bvolumen\b/i,
  /\bunidades vendidas\b/i,
  /\b%+\s*$/i,
  /variaci[oó]n\s*%/i,
  /\bproducci[oó]n\b/i,
  /\bventas en volumen\b/i,
];

function inferSeccionFromDenominacion(denom: string): SeccionPagina {
  const d = normalizarDenominacion(denom);
  if (/flujo|efectivo generado|actividades operativas/.test(d)) return "flujo_efectivo";
  if (/activo|pasivo|patrimonio|inventario|cuentas por cobrar|cuentas por pagar/.test(d)) {
    return "balance";
  }
  if (/ingreso|costo|gasto|utilidad|ganancia|perdida|resultado/.test(d)) return "resultados";
  if (OPERATIVO_DENOM_PATTERNS.some((p) => p.test(denom))) return "operativo";
  return "otro";
}

function isOperativoLine(linea: ExtractedLine): boolean {
  if (linea.fuentePrioridad === "operativo") return true;
  if (linea.seccionPagina === "operativo") return true;
  return OPERATIVO_DENOM_PATTERNS.some((p) => p.test(linea.denominacionOriginal));
}

export function enrichLineProvenance(linea: ExtractedLine): ExtractedLine {
  if (linea.fuentePrioridad && linea.seccionPagina) return linea;

  const seccion = linea.seccionPagina ?? inferSeccionFromDenominacion(linea.denominacionOriginal);
  let fuentePrioridad: FuentePrioridad = linea.fuentePrioridad ?? "complementario";

  if (!linea.fuentePrioridad) {
    if (["balance", "resultados", "flujo_efectivo"].includes(seccion)) {
      fuentePrioridad = "canonico";
    } else if (seccion === "resumen_ejecutivo") {
      fuentePrioridad = "resumen";
    } else if (seccion === "operativo" || isOperativoLine({ ...linea, seccionPagina: seccion })) {
      fuentePrioridad = "operativo";
    }
  }

  return { ...linea, seccionPagina: seccion, fuentePrioridad };
}
