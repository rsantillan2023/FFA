/** Tolerancia absoluta = fracción × max(|activo|, |pasivo + patrimonio|). 0,15 % cubre redondeo OCR/PDF. */
export const CUADRATURA_TOLERANCIA_FRACCION = 0.0015;

/** Desbalance relativo (%) a partir del cual la cuadratura es crítica (semáforo validación rojo). */
export const CUADRATURA_SEMAFORO_ROJO_PCT = 0.25;

export interface EvalCuadraturaBalance {
  diferencia: number;
  diferenciaPct: number;
  tolerancia: number;
  cuadraturaOk: boolean;
  /** Desbalance material: por encima de CUADRATURA_SEMAFORO_ROJO_PCT. */
  cuadraturaCritica: boolean;
}

/** Evalúa Activo = Pasivo + Patrimonio con tolerancia operativa y banda de severidad. */
export function evaluarCuadraturaBalance(
  activo: number,
  pasivo: number,
  patrimonio: number
): EvalCuadraturaBalance {
  const pasivoPatrimonio = pasivo + patrimonio;
  const diferencia = activo - pasivoPatrimonio;
  const diferenciaAbs = Math.abs(diferencia);
  const base = Math.max(Math.abs(activo), Math.abs(pasivoPatrimonio));
  const diferenciaPct = base <= 0 ? 0 : (diferenciaAbs / base) * 100;
  const tolerancia = base * CUADRATURA_TOLERANCIA_FRACCION;
  const cuadraturaOk = diferenciaAbs <= tolerancia;
  const cuadraturaCritica = !cuadraturaOk && diferenciaPct >= CUADRATURA_SEMAFORO_ROJO_PCT;
  return { diferencia, diferenciaPct, tolerancia, cuadraturaOk, cuadraturaCritica };
}

/** Porcentaje de desbalance: |activo − (pasivo + patrimonio)| / max(|activo|, |pasivo + patrimonio|). */
export function calcularDiferenciaCuadraturaPct(
  activo: number,
  pasivo: number,
  patrimonio: number
): number {
  return evaluarCuadraturaBalance(activo, pasivo, patrimonio).diferenciaPct;
}

export function formatDiferenciaCuadraturaPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "0%";
  if (pct < 0.01) return "< 0,01%";
  return `${pct.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`;
}

export function diferenciaCuadraturaPctDesdeTotales(meta: {
  activo?: number | null;
  pasivo?: number | null;
  patrimonio?: number | null;
}): number | null {
  const { activo, pasivo, patrimonio } = meta;
  if (activo == null || pasivo == null || patrimonio == null) return null;
  if (!Number.isFinite(activo) || !Number.isFinite(pasivo) || !Number.isFinite(patrimonio)) {
    return null;
  }
  return calcularDiferenciaCuadraturaPct(activo, pasivo, patrimonio);
}
