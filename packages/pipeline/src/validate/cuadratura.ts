import {
  CUADRATURA_TOLERANCIA_FRACCION,
  EstadoFinanciero,
  evaluarCuadraturaBalance,
  ValidacionSeveridad,
  ValidacionTipo,
} from "@ffa/shared";
import type { ClassifiedLine, RubroRef, ValidateContext, ValidateResult, ValidationItem } from "../types.js";
import { lineasAlcanceBalance } from "./alcance-balance.js";
import { computeCuadraturaBalance } from "./balance-cuadratura.js";
import { buildExtendedValidations } from "./rules-extended.js";

function sumByEstadoGlobal(
  lineas: ClassifiedLine[],
  rubrosById: Map<string, RubroRef>,
  estado: EstadoFinanciero
): number {
  return lineas.reduce((acc, linea) => {
    if (!linea.rubroInstitucionalId) return acc;
    const rubro = rubrosById.get(linea.rubroInstitucionalId);
    if (!rubro || rubro.estadoFinanciero !== estado) return acc;
    const monto = linea.montoNormalizado ?? linea.montoOriginal;
    const signed = rubro.convencionSigno === "invertido" ? -Math.abs(monto) : monto;
    return acc + signed;
  }, 0);
}

export function validateCase(
  lineas: ClassifiedLine[],
  rubros: RubroRef[],
  umbralConfianza: number,
  ctx: ValidateContext = {}
): ValidateResult {
  const rubrosById = new Map(rubros.map((r) => [r.id, r]));
  const validaciones: ValidationItem[] = [];

  const balance = computeCuadraturaBalance(lineas, rubros);
  const { activo, pasivo, patrimonio } = balance;
  const evalCuad = evaluarCuadraturaBalance(activo, pasivo, patrimonio);
  const { cuadraturaOk, tolerancia, cuadraturaCritica, diferenciaPct } = evalCuad;

  const modoLabel =
    balance.modo === "balance_objetivo"
      ? `balance objetivo (págs. ${balance.paginasBalanceObjetivo.join(", ")}, ${balance.lineasUsadas} líneas)`
      : balance.modo === "global_filtrado"
        ? "global excluyendo líneas marcadas"
        : "global documento";

  validaciones.push({
    tipo: ValidacionTipo.CUADRATURA,
    severidad: cuadraturaOk
      ? ValidacionSeveridad.INFO
      : cuadraturaCritica
        ? ValidacionSeveridad.CRITICAL
        : ValidacionSeveridad.WARNING,
    passed: cuadraturaOk,
    mensaje: cuadraturaOk
      ? `Cuadratura OK (${modoLabel}): Activo ${activo.toLocaleString("es-CL")} = Pasivo ${pasivo.toLocaleString("es-CL")} + Patrimonio ${patrimonio.toLocaleString("es-CL")}`
      : cuadraturaCritica
        ? `Cuadratura fallida (${modoLabel}, ${diferenciaPct.toFixed(2)}%): Activo ${activo.toLocaleString("es-CL")} ≠ Pasivo ${pasivo.toLocaleString("es-CL")} + Patrimonio ${patrimonio.toLocaleString("es-CL")}`
        : `Cuadratura con diferencia menor (${modoLabel}, ${diferenciaPct.toFixed(2)}% — tolerancia ${(CUADRATURA_TOLERANCIA_FRACCION * 100).toFixed(2)}%): revisar líneas de detalle`,
    metadata: {
      activo,
      pasivo,
      patrimonio,
      tolerancia,
      diferenciaPct,
      cuadraturaCritica,
      modo: balance.modo,
      paginasBalanceObjetivo: balance.paginasBalanceObjetivo,
      lineasUsadas: balance.lineasUsadas,
    },
  });

  if (balance.modo === "balance_objetivo") {
    const gActivo = sumByEstadoGlobal(lineas, rubrosById, EstadoFinanciero.ACTIVO);
    const gPasivo = sumByEstadoGlobal(lineas, rubrosById, EstadoFinanciero.PASIVO);
    const gPatrimonio = sumByEstadoGlobal(lineas, rubrosById, EstadoFinanciero.PATRIMONIO);
    const gTol = Math.max(gActivo, gPasivo + gPatrimonio) * CUADRATURA_TOLERANCIA_FRACCION;
    const globalCuadra = Math.abs(gActivo - (gPasivo + gPatrimonio)) <= gTol;
    if (!globalCuadra) {
      validaciones.push({
        tipo: ValidacionTipo.CUADRATURA,
        severidad: ValidacionSeveridad.INFO,
        passed: true,
        mensaje: `Cuadratura global documento difiere (esperado en PDFs mixtos): Activo ${gActivo.toLocaleString("es-CL")} vs P+PN ${(gPasivo + gPatrimonio).toLocaleString("es-CL")}`,
        metadata: {
          activo: gActivo,
          pasivo: gPasivo,
          patrimonio: gPatrimonio,
          origen: "sistema",
        },
      });
    }
  }

  const alcance = lineasAlcanceBalance(lineas, balance.paginasBalanceObjetivo);
  const alcanceLabel = balance.paginasBalanceObjetivo.length
    ? `balance objetivo (págs. ${balance.paginasBalanceObjetivo.join(", ")})`
    : "documento";

  const sinClasificar = alcance.filter((l) => !l.rubroInstitucionalId).length;
  if (sinClasificar > 0) {
    validaciones.push({
      tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: `${sinClasificar} línea(s) sin clasificar en ${alcanceLabel}`,
      metadata: { sinClasificar },
    });
  }

  const bajoUmbralAccion = alcance.filter(
    (l) =>
      l.confianzaClasificacion < umbralConfianza &&
      (l.requiereRevision || !l.rubroInstitucionalId)
  );
  const bajoUmbral = bajoUmbralAccion.length;
  if (bajoUmbral > 0) {
    validaciones.push({
      tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: `${bajoUmbral} línea(s) pendientes con confianza baja (${umbralConfianza}%) en ${alcanceLabel}`,
      metadata: { bajoUmbral, umbralConfianza },
    });
  }

  const bajoUmbralInformativo = alcance.filter(
    (l) =>
      l.confianzaClasificacion < umbralConfianza &&
      !l.requiereRevision &&
      l.rubroInstitucionalId
  ).length;
  if (bajoUmbralInformativo > 0) {
    validaciones.push({
      tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
      severidad: ValidacionSeveridad.INFO,
      passed: true,
      mensaje: `${bajoUmbralInformativo} línea(s) con confianza histórica baja ya resueltas en ${alcanceLabel}`,
      metadata: { bajoUmbralInformativo, umbralConfianza },
    });
  }

  const retirosEnActivo = lineas.filter((l) => {
    if (!l.rubroInstitucionalId) return false;
    const rubro = rubrosById.get(l.rubroInstitucionalId);
    const denom = l.denominacionNormalizada ?? "";
    return (
      denom.includes("retiro") &&
      rubro?.estadoFinanciero === EstadoFinanciero.ACTIVO
    );
  });
  if (retirosEnActivo.length > 0) {
    validaciones.push({
      tipo: ValidacionTipo.ACTIVO_SOBREVALORADO,
      severidad: ValidacionSeveridad.CRITICAL,
      passed: false,
      mensaje: "Retiros de socios clasificados en activo",
      metadata: { count: retirosEnActivo.length, origen: "documento_origen" },
    });
  }

  validaciones.push(
    ...buildExtendedValidations(lineas, rubrosById, {
      ...ctx,
      paginasBalanceObjetivo:
        balance.paginasBalanceObjetivo.length > 0
          ? balance.paginasBalanceObjetivo
          : ctx.paginasBalanceObjetivo,
    }, umbralConfianza)
  );

  const hasCritical = validaciones.some(
    (v) => !v.passed && v.severidad === ValidacionSeveridad.CRITICAL
  );
  const hasWarning = validaciones.some(
    (v) => !v.passed && v.severidad === ValidacionSeveridad.WARNING
  );

  let semaforo: "verde" | "amarillo" | "rojo" = "verde";
  if (hasCritical || cuadraturaCritica) semaforo = "rojo";
  else if (hasWarning || !cuadraturaOk || bajoUmbral > 0) semaforo = "amarillo";

  return { validaciones, semaforo, cuadraturaOk };
}
