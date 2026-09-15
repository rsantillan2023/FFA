import type { LineaContableDto, RubroOptionDto } from "@ffa/shared";
import {
  EstadoFinanciero,
  calcularDiferenciaCuadraturaPct,
  evaluarCuadraturaBalance,
  formatDiferenciaCuadraturaPct,
} from "@ffa/shared";

export { calcularDiferenciaCuadraturaPct, formatDiferenciaCuadraturaPct };
import {
  lineaParticipaCuadratura,
  motivoExclusionCuadratura,
  type MotivoExclusionCuadratura,
} from "./lineaCuadratura";

export interface TotalesBalance {
  activo: number;
  pasivo: number;
  patrimonio: number;
  /** Suma de líneas con rubro «resultados» (estado de resultados; no entra en 1 = 2 + 3). */
  resultados: number;
  resultadosLineas: number;
  /** Monto de líneas sin rubro en el plan (no suman en cuadratura). */
  sinRubro: number;
  sinRubroLineas: number;
  /** Líneas de detalle que entraron en la suma 1 = 2 + 3. */
  lineasCuadratura: number;
  /** Líneas con rubro balance pero excluidas (totales, agrupadores, flujo, etc.). */
  lineasExcluidasCuadratura: number;
  cuadraturaOk: boolean;
  tolerancia: number;
  /** Activo − (pasivo + patrimonio); signo indica el lado que sobra. */
  diferencia: number;
  /** Magnitud relativa de la diferencia respecto al mayor total (0–100). */
  diferenciaPct: number;
}

/** Cambios locales en revisión aún no guardados en el servidor. */
export type LineaDraftOverride = {
  rubroInstitucionalId?: string;
  montoNormalizado?: number;
};

function aplicarOverridesALineas(
  lineas: LineaContableDto[],
  overrides?: Record<string, LineaDraftOverride>
): LineaContableDto[] {
  if (!overrides || !Object.keys(overrides).length) return lineas;
  return lineas.map((linea) => {
    const override = overrides[linea.id];
    if (!override) return linea;
    const rubroCambiado = override.rubroInstitucionalId !== undefined;
    return {
      ...linea,
      rubroInstitucionalId: override.rubroInstitucionalId ?? linea.rubroInstitucionalId,
      montoNormalizado: override.montoNormalizado ?? linea.montoNormalizado ?? linea.montoOriginal,
      rubroCodigo: rubroCambiado ? undefined : linea.rubroCodigo,
      rubroNombre: rubroCambiado ? undefined : linea.rubroNombre,
    };
  });
}

export interface GrupoEstadoLineas {
  estado: string;
  label: string;
  numero: number;
  lineas: LineaContableDto[];
  total: number;
}

const ESTADO_LABELS: Record<string, string> = {
  [EstadoFinanciero.ACTIVO]: "Activo",
  [EstadoFinanciero.PASIVO]: "Pasivo",
  [EstadoFinanciero.PATRIMONIO]: "Patrimonio",
  [EstadoFinanciero.RESULTADOS]: "Resultados",
};

/** Secciones visibles en revisión por plan (1–3 entran en cuadratura del balance). */
const ESTADO_NUMERO: Record<string, number> = {
  [EstadoFinanciero.ACTIVO]: 1,
  [EstadoFinanciero.PASIVO]: 2,
  [EstadoFinanciero.PATRIMONIO]: 3,
  [EstadoFinanciero.RESULTADOS]: 4,
};

function pushLineaEnGrupo(grupos: GrupoEstadoLineas[], linea: LineaContableDto, estado: string): void {
  const last = grupos[grupos.length - 1];
  if (last?.estado === estado) {
    last.lineas.push(linea);
    return;
  }
  grupos.push({
    estado,
    label: ESTADO_LABELS[estado] ?? estado,
    numero: ESTADO_NUMERO[estado] ?? 0,
    lineas: [linea],
    total: 0,
  });
}

function montoLinea(l: LineaContableDto): number {
  return l.montoNormalizado ?? l.montoOriginal;
}

function rubrosMaps(rubros: RubroOptionDto[]) {
  return {
    byId: new Map(rubros.map((r) => [r.id, r])),
    byCodigo: new Map(rubros.map((r) => [r.codigo, r])),
  };
}

/** Resuelve rubro por id institucional o, si falta en el plan cargado, por código. */
export function rubroDeLinea(
  l: LineaContableDto,
  rubros: RubroOptionDto[]
): RubroOptionDto | undefined {
  const { byId, byCodigo } = rubrosMaps(rubros);
  if (l.rubroInstitucionalId) {
    const porId = byId.get(l.rubroInstitucionalId);
    if (porId) return porId;
  }
  if (l.rubroCodigo) return byCodigo.get(l.rubroCodigo);
  return undefined;
}

function rubroDeLineaMaps(
  l: LineaContableDto,
  rubrosById: Map<string, RubroOptionDto>,
  rubrosByCodigo: Map<string, RubroOptionDto>
): RubroOptionDto | undefined {
  if (l.rubroInstitucionalId) {
    const porId = rubrosById.get(l.rubroInstitucionalId);
    if (porId) return porId;
  }
  if (l.rubroCodigo) return rubrosByCodigo.get(l.rubroCodigo);
  return undefined;
}

function montoFirmado(l: LineaContableDto, rubro?: RubroOptionDto): number {
  const monto = montoLinea(l);
  if (rubro?.convencionSigno === "invertido") return -Math.abs(monto);
  return monto;
}

export function calcularTotalesBalance(
  lineas: LineaContableDto[],
  rubros: RubroOptionDto[],
  overrides?: Record<string, LineaDraftOverride>
): TotalesBalance {
  const lineasEfectivas = aplicarOverridesALineas(lineas, overrides);
  const { byId: rubrosById, byCodigo: rubrosByCodigo } = rubrosMaps(rubros);

  let lineasCuadratura = 0;
  let lineasExcluidasCuadratura = 0;
  let resultadosLineas = 0;
  let sinRubro = 0;
  let sinRubroLineas = 0;

  const sumByEstado = (estado: EstadoFinanciero): number =>
    lineasEfectivas.reduce((acc, linea) => {
      const rubro = rubroDeLineaMaps(linea, rubrosById, rubrosByCodigo);
      if (!rubro || rubro.estadoFinanciero !== estado) return acc;
      if (!lineaParticipaCuadratura(linea, rubro)) return acc;
      return acc + montoFirmado(linea, rubro);
    }, 0);

  for (const linea of lineasEfectivas) {
    const rubro = rubroDeLineaMaps(linea, rubrosById, rubrosByCodigo);
    const motivo = motivoExclusionCuadratura(linea, rubro);
    if (motivo === "sin_rubro") {
      sinRubro += montoLinea(linea);
      sinRubroLineas++;
      continue;
    }
    if (motivo === "resultados") {
      resultadosLineas++;
      continue;
    }
    if (motivo) {
      lineasExcluidasCuadratura++;
      continue;
    }
    if (
      rubro &&
      (rubro.estadoFinanciero === EstadoFinanciero.ACTIVO ||
        rubro.estadoFinanciero === EstadoFinanciero.PASIVO ||
        rubro.estadoFinanciero === EstadoFinanciero.PATRIMONIO)
    ) {
      lineasCuadratura++;
    }
  }

  const activo = sumByEstado(EstadoFinanciero.ACTIVO);
  const pasivo = sumByEstado(EstadoFinanciero.PASIVO);
  const patrimonio = sumByEstado(EstadoFinanciero.PATRIMONIO);
  const resultados = lineasEfectivas.reduce((acc, linea) => {
    const rubro = rubroDeLineaMaps(linea, rubrosById, rubrosByCodigo);
    if (!rubro || rubro.estadoFinanciero !== EstadoFinanciero.RESULTADOS) return acc;
    if (motivoExclusionCuadratura(linea, rubro) === "total") return acc;
    return acc + montoFirmado(linea, rubro);
  }, 0);

  const evalCuad = evaluarCuadraturaBalance(activo, pasivo, patrimonio);
  const diferencia = evalCuad.diferencia;
  const tolerancia = evalCuad.tolerancia;
  const cuadraturaOk = evalCuad.cuadraturaOk;
  const diferenciaPct = calcularDiferenciaCuadraturaPct(activo, pasivo, patrimonio);

  return {
    activo,
    pasivo,
    patrimonio,
    resultados,
    resultadosLineas,
    sinRubro,
    sinRubroLineas,
    lineasCuadratura,
    lineasExcluidasCuadratura,
    cuadraturaOk,
    tolerancia,
    diferencia,
    diferenciaPct,
  };
}

export function agruparLineasPorEstado(
  lineasOrdenadas: LineaContableDto[],
  rubros: RubroOptionDto[],
  overrides?: Record<string, LineaDraftOverride>
): GrupoEstadoLineas[] {
  const lineasEfectivas = aplicarOverridesALineas(lineasOrdenadas, overrides);
  const { byId: rubrosById, byCodigo: rubrosByCodigo } = rubrosMaps(rubros);
  const grupos: GrupoEstadoLineas[] = [];
  const sinRubro: LineaContableDto[] = [];
  const subtotales: LineaContableDto[] = [];

  for (const linea of lineasEfectivas) {
    const rubro = rubroDeLineaMaps(linea, rubrosById, rubrosByCodigo);
    if (!rubro) {
      const motivo: MotivoExclusionCuadratura | null = motivoExclusionCuadratura(linea, rubro);
      if (motivo && motivo !== "sin_rubro") subtotales.push(linea);
      else sinRubro.push(linea);
      continue;
    }
    const estado = rubro.estadoFinanciero;
    if (!estado) {
      pushLineaEnGrupo(grupos, linea, "sin_seccion");
      continue;
    }
    pushLineaEnGrupo(grupos, linea, estado);
  }

  for (const g of grupos) {
    if (g.estado === "sin_seccion") {
      g.label = "Rubro sin sección";
    }
    g.total = g.lineas.reduce((acc, l) => {
      const rubro = rubroDeLineaMaps(l, rubrosById, rubrosByCodigo);
      return acc + (rubro ? montoFirmado(l, rubro) : montoLinea(l));
    }, 0);
  }

  if (subtotales.length) {
    grupos.push({
      estado: "subtotales",
      label: "Subtotales (no imputables)",
      numero: 0,
      lineas: subtotales,
      total: subtotales.reduce((acc, l) => acc + montoLinea(l), 0),
    });
  }

  if (sinRubro.length) {
    grupos.push({
      estado: "sin_rubro",
      label: "Sin rubro",
      numero: 0,
      lineas: sinRubro,
      total: sinRubro.reduce((acc, l) => acc + montoLinea(l), 0),
    });
  }

  return grupos;
}

export { formatMonto as formatMontoBalance } from "./formatMonto";
