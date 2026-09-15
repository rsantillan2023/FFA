import { EstadoFinanciero, ValidacionSeveridad, ValidacionTipo } from "@ffa/shared";
import type { ClassifiedLine, ValidateContext, ValidationItem } from "../types.js";
import { agruparLineasPorPagina, lineasAlcanceBalance } from "./alcance-balance.js";

function hasEstado(
  lineas: ClassifiedLine[],
  rubrosById: Map<string, { estadoFinanciero: string }>,
  estado: string
): boolean {
  return lineas.some((l) => {
    if (!l.rubroInstitucionalId) return false;
    return rubrosById.get(l.rubroInstitucionalId)?.estadoFinanciero === estado;
  });
}

/** Reglas H.2–H.7, H.12, H.16–H.20 complementarias. */
export function buildExtendedValidations(
  lineas: ClassifiedLine[],
  rubrosById: Map<string, { estadoFinanciero: string; nombre: string }>,
  ctx: ValidateContext,
  umbralConfianza: number
): ValidationItem[] {
  const out: ValidationItem[] = [];
  const origen = "documento_origen" as const;

  const tieneActivo = hasEstado(lineas, rubrosById, EstadoFinanciero.ACTIVO);
  const tienePasivo = hasEstado(lineas, rubrosById, EstadoFinanciero.PASIVO);
  const tieneResultados = hasEstado(lineas, rubrosById, EstadoFinanciero.RESULTADOS);

  if (ctx.tipoDocumento === "mixto" && (!tieneActivo || !tieneResultados)) {
    out.push({
      tipo: ValidacionTipo.COHERENCIA_ESTADOS,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: "Documento mixto sin balance y estado de resultados coherentes (H.2)",
      metadata: { origen, tieneActivo, tienePasivo, tieneResultados },
    });
  }

  const subtotales = lineas.filter((l) =>
    (l.denominacionNormalizada ?? "").match(/total|subtotal|suma/i)
  );
  if (subtotales.length > 0) {
    out.push({
      tipo: ValidacionTipo.INTEGRIDAD_AGRUPACION,
      severidad: ValidacionSeveridad.INFO,
      passed: true,
      mensaje: `${subtotales.length} subtotal(es) detectados — verificar componentes (H.3)`,
      metadata: { origen, count: subtotales.length },
    });
  }

  if (ctx.escala === "indeterminada") {
    out.push({
      tipo: ValidacionTipo.ESCALA_NO_DECLARADA,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: "Escala monetaria no declarada en documento (H.5 / D.6)",
      metadata: { origen: "sistema" },
    });
  }

  const typos = lineas.filter((l) => {
    const d = l.denominacionNormalizada ?? "";
    return d.includes("  ") || /[^a-záéíóúñ0-9\s.,()-]/i.test(d);
  });
  if (typos.length > 0) {
    out.push({
      tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
      severidad: ValidacionSeveridad.INFO,
      passed: false,
      mensaje: `${typos.length} denominación(es) con posible error de tipeo (H.6)`,
      metadata: { origen, count: typos.length },
    });
  }

  const añoVigente = ctx.añoVigente ?? new Date().getFullYear();
  if (ctx.periodoEjercicio && ctx.periodoEjercicio < añoVigente - 2) {
    out.push({
      tipo: ValidacionTipo.EJERCICIO_DESACTUALIZADO,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: `Ejercicio ${ctx.periodoEjercicio} desactualizado respecto a ${añoVigente} (H.7)`,
      metadata: { origen, ejercicio: ctx.periodoEjercicio },
    });
  }

  const ochoCol = lineas.filter((l) => l.columnaOrigen);
  if (ochoCol.length >= 4) {
    out.push({
      tipo: ValidacionTipo.DEBITO_CREDITO,
      severidad: ValidacionSeveridad.INFO,
      passed: true,
      mensaje: `Balance 8 columnas: ${ochoCol.length} líneas con columna origen (H.16)`,
      metadata: { origen, count: ochoCol.length },
    });
  }

  const alcance = lineasAlcanceBalance(lineas, ctx.paginasBalanceObjetivo);
  const alcanceLabel = ctx.paginasBalanceObjetivo?.length
    ? `balance objetivo (págs. ${ctx.paginasBalanceObjetivo.join(", ")})`
    : "documento completo";

  const activoLineas = alcance.filter((l) => {
    if (!l.rubroInstitucionalId) return false;
    return rubrosById.get(l.rubroInstitucionalId)?.estadoFinanciero === EstadoFinanciero.ACTIVO;
  });
  const bajaConfianzaActivo = activoLineas.filter(
    (l) =>
      l.confianzaClasificacion < umbralConfianza &&
      (l.requiereRevision || !l.rubroInstitucionalId)
  );
  const pctMal = activoLineas.length
    ? Math.round((bajaConfianzaActivo.length / activoLineas.length) * 100)
    : 0;
  if (pctMal >= 20) {
    out.push({
      tipo: ValidacionTipo.ACTIVO_SOBREVALORADO,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: `${pctMal}% del activo con clasificación bajo umbral en ${alcanceLabel} (H.19)`,
      metadata: { origen: "sistema", pctMal },
    });
  }

  const confianzaPromedio =
    lineas.length > 0
      ? Math.round(lineas.reduce((a, l) => a + l.confianzaClasificacion, 0) / lineas.length)
      : 0;
  out.push({
    tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
    severidad: ValidacionSeveridad.INFO,
    passed: true,
    mensaje: `Confianza promedio por línea: ${confianzaPromedio}% (H.20)`,
    metadata: { origen: "sistema", confianzaPromedio },
  });

  const distorsiones = alcance.filter((l) => {
    if (!l.rubroInstitucionalId) return false;
    const rubro = rubrosById.get(l.rubroInstitucionalId);
    const denom = (l.denominacionNormalizada ?? "").toLowerCase();
    const esPatrimonio =
      denom.includes("patrimonio") ||
      denom.includes("capital") ||
      denom.includes("utilidad") ||
      denom.includes("resultado");
    if (!esPatrimonio) return false;
    return (
      rubro?.estadoFinanciero === EstadoFinanciero.ACTIVO ||
      rubro?.estadoFinanciero === EstadoFinanciero.PASIVO
    );
  });
  if (distorsiones.length > 0) {
    out.push({
      tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: `${distorsiones.length} línea(s) de patrimonio/resultado mal ubicadas — distorsionan indicadores (H.4)`,
      metadata: { origen: "sistema", count: distorsiones.length },
    });
  }

  const pasivoPatrimonioCombo = alcance.filter((l) => {
    const d = (l.denominacionNormalizada ?? l.denominacionOriginal).toLowerCase();
    return (
      /pasivo.*patrimonio|patrimonio.*pasivo|total pasivo y patrimonio/.test(d) ||
      (d.includes("total pasivo") && !d.includes("no corriente") && alcance.some((x) => {
        const xd = (x.denominacionNormalizada ?? "").toLowerCase();
        return xd.includes("patrimonio") && x !== l;
      }))
    );
  });
  if (pasivoPatrimonioCombo.length > 0) {
    out.push({
      tipo: ValidacionTipo.INTEGRIDAD_AGRUPACION,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: `${pasivoPatrimonioCombo.length} total(es) mezclan pasivo y patrimonio (D.18)`,
      metadata: { origen: "documento_origen", count: pasivoPatrimonioCombo.length },
    });
  }

  function validarSubtotalesH17(lineasPagina: ClassifiedLine[], pagina?: number): void {
    for (let i = 0; i < lineasPagina.length; i++) {
      const l = lineasPagina[i]!;
      const denom = l.denominacionNormalizada ?? "";
      if (!/total|subtotal|suma/i.test(denom)) continue;

      let start = 0;
      for (let j = i - 1; j >= 0; j--) {
        const prev = lineasPagina[j]!.denominacionNormalizada ?? "";
        if (/total|subtotal|suma/i.test(prev)) {
          start = j + 1;
          break;
        }
      }
      const components = lineasPagina.slice(start, i).filter((x) => {
        const d = x.denominacionNormalizada ?? "";
        return !/total|subtotal|suma/i.test(d);
      });
      if (components.length < 2) continue;

      const sum = components.reduce((a, c) => a + (c.montoNormalizado ?? c.montoOriginal), 0);
      const total = l.montoNormalizado ?? l.montoOriginal;
      const tol = Math.max(Math.abs(total) * 0.02, 1);
      const ok = Math.abs(sum - total) <= tol;
      const pagLabel = pagina != null ? ` pág. ${pagina}` : "";

      out.push({
        tipo: ValidacionTipo.INTEGRIDAD_AGRUPACION,
        severidad: ok ? ValidacionSeveridad.INFO : ValidacionSeveridad.WARNING,
        passed: ok,
        mensaje: ok
          ? `Subtotal "${l.denominacionOriginal}"${pagLabel} cuadra con ${components.length} componentes (H.17)`
          : `Subtotal "${l.denominacionOriginal}"${pagLabel} no cuadra: suma ${sum.toLocaleString("es-CL")} ≠ ${total.toLocaleString("es-CL")} (H.17)`,
        metadata: { origen, sum, total, componentes: components.length, paginaNumero: pagina },
      });
    }
  }

  if (ctx.paginasBalanceObjetivo?.length) {
    const porPagina = agruparLineasPorPagina(alcance);
    for (const p of ctx.paginasBalanceObjetivo) {
      const enPagina = porPagina.get(p);
      if (enPagina?.length) validarSubtotalesH17(enPagina, p);
    }
  } else {
    validarSubtotalesH17(lineas);
  }

  return out;
}
