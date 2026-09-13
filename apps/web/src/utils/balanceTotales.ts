import type { LineaContableDto, RubroOptionDto } from "@ffa/shared";
import { EstadoFinanciero } from "@ffa/shared";

export interface TotalesBalance {
  activo: number;
  pasivo: number;
  patrimonio: number;
  cuadraturaOk: boolean;
  tolerancia: number;
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
};

const ESTADO_NUMERO: Record<string, number> = {
  [EstadoFinanciero.ACTIVO]: 1,
  [EstadoFinanciero.PASIVO]: 2,
  [EstadoFinanciero.PATRIMONIO]: 3,
};

function montoLinea(l: LineaContableDto): number {
  return l.montoNormalizado ?? l.montoOriginal;
}

function rubroDeLinea(
  l: LineaContableDto,
  rubrosById: Map<string, RubroOptionDto>,
  rubrosByCodigo: Map<string, RubroOptionDto>
): RubroOptionDto | undefined {
  if (l.rubroInstitucionalId) return rubrosById.get(l.rubroInstitucionalId);
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
  const rubrosById = new Map(rubros.map((r) => [r.id, r]));
  const rubrosByCodigo = new Map(rubros.map((r) => [r.codigo, r]));

  const sumByEstado = (estado: EstadoFinanciero): number =>
    lineasEfectivas.reduce((acc, linea) => {
      const rubro = rubroDeLinea(linea, rubrosById, rubrosByCodigo);
      if (!rubro || rubro.estadoFinanciero !== estado) return acc;
      return acc + montoFirmado(linea, rubro);
    }, 0);

  const activo = sumByEstado(EstadoFinanciero.ACTIVO);
  const pasivo = sumByEstado(EstadoFinanciero.PASIVO);
  const patrimonio = sumByEstado(EstadoFinanciero.PATRIMONIO);
  const tolerancia = Math.max(activo, pasivo + patrimonio) * 0.001;
  const cuadraturaOk = Math.abs(activo - (pasivo + patrimonio)) <= tolerancia;

  return { activo, pasivo, patrimonio, cuadraturaOk, tolerancia };
}

export function agruparLineasPorEstado(
  lineasOrdenadas: LineaContableDto[],
  rubros: RubroOptionDto[],
  overrides?: Record<string, LineaDraftOverride>
): GrupoEstadoLineas[] {
  const lineasEfectivas = aplicarOverridesALineas(lineasOrdenadas, overrides);
  const rubrosById = new Map(rubros.map((r) => [r.id, r]));
  const rubrosByCodigo = new Map(rubros.map((r) => [r.codigo, r]));
  const grupos: GrupoEstadoLineas[] = [];
  const sinClasificar: LineaContableDto[] = [];

  for (const linea of lineasEfectivas) {
    const rubro = rubroDeLinea(linea, rubrosById, rubrosByCodigo);
    const estado = rubro?.estadoFinanciero;
    if (!estado || !(estado in ESTADO_NUMERO)) {
      sinClasificar.push(linea);
      continue;
    }
    const last = grupos[grupos.length - 1];
    if (last?.estado === estado) {
      last.lineas.push(linea);
    } else {
      grupos.push({
        estado,
        label: ESTADO_LABELS[estado] ?? estado,
        numero: ESTADO_NUMERO[estado],
        lineas: [linea],
        total: 0,
      });
    }
  }

  for (const g of grupos) {
    g.total = g.lineas.reduce((acc, l) => {
      const rubro = rubroDeLinea(l, rubrosById, rubrosByCodigo);
      return acc + montoFirmado(l, rubro);
    }, 0);
  }

  if (sinClasificar.length) {
    grupos.push({
      estado: "sin_clasificar",
      label: "Sin rubro / otros",
      numero: 0,
      lineas: sinClasificar,
      total: sinClasificar.reduce((acc, l) => acc + montoLinea(l), 0),
    });
  }

  return grupos;
}

export { formatMonto as formatMontoBalance } from "./formatMonto";
