import { EstadoFinanciero, ValidacionSeveridad, ValidacionTipo } from "@ffa/shared";
import type { ClassifiedLine, RubroRef, ValidateContext, ValidateResult, ValidationItem } from "../types.js";
import { buildExtendedValidations } from "./rules-extended.js";
function sumByEstado(
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

  const activo = sumByEstado(lineas, rubrosById, EstadoFinanciero.ACTIVO);
  const pasivo = sumByEstado(lineas, rubrosById, EstadoFinanciero.PASIVO);
  const patrimonio = sumByEstado(lineas, rubrosById, EstadoFinanciero.PATRIMONIO);
  const tolerancia = Math.max(activo, pasivo + patrimonio) * 0.001;
  const cuadraturaOk = Math.abs(activo - (pasivo + patrimonio)) <= tolerancia;

  validaciones.push({
    tipo: ValidacionTipo.CUADRATURA,
    severidad: cuadraturaOk ? ValidacionSeveridad.INFO : ValidacionSeveridad.CRITICAL,
    passed: cuadraturaOk,
    mensaje: cuadraturaOk
      ? `Cuadratura OK: Activo ${activo.toLocaleString("es-CL")} = Pasivo ${pasivo.toLocaleString("es-CL")} + Patrimonio ${patrimonio.toLocaleString("es-CL")}`
      : `Cuadratura fallida: Activo ${activo.toLocaleString("es-CL")} ≠ Pasivo ${pasivo.toLocaleString("es-CL")} + Patrimonio ${patrimonio.toLocaleString("es-CL")}`,
    metadata: { activo, pasivo, patrimonio, tolerancia },
  });

  const sinClasificar = lineas.filter((l) => !l.rubroInstitucionalId).length;
  if (sinClasificar > 0) {
    validaciones.push({
      tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: `${sinClasificar} línea(s) sin clasificar`,
      metadata: { sinClasificar },
    });
  }

  const bajoUmbral = lineas.filter((l) => l.confianzaClasificacion < umbralConfianza).length;
  if (bajoUmbral > 0) {
    validaciones.push({
      tipo: ValidacionTipo.CLASIFICACION_ORIGEN,
      severidad: ValidacionSeveridad.WARNING,
      passed: false,
      mensaje: `${bajoUmbral} línea(s) bajo umbral de confianza (${umbralConfianza}%)`,
      metadata: { bajoUmbral, umbralConfianza },
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
    ...buildExtendedValidations(lineas, rubrosById, ctx, umbralConfianza)
  );

  const hasCritical = validaciones.some(
    (v) => !v.passed && v.severidad === ValidacionSeveridad.CRITICAL
  );
  const hasWarning = validaciones.some(
    (v) => !v.passed && v.severidad === ValidacionSeveridad.WARNING
  );

  let semaforo: "verde" | "amarillo" | "rojo" = "verde";
  if (hasCritical || !cuadraturaOk) semaforo = "rojo";
  else if (hasWarning || bajoUmbral > 0) semaforo = "amarillo";

  return { validaciones, semaforo, cuadraturaOk };
}
