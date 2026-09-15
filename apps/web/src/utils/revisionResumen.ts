import type { LineaContableDto, RubroOptionDto } from "@ffa/shared";
import { EstadoFinanciero } from "@ffa/shared";
import { calcularTotalesBalance, type LineaDraftOverride } from "./balanceTotales";
import { esLineaFilaTotalBalance, lineaParticipaCuadratura } from "./lineaCuadratura";

export type OrigenLineasResumen = {
  total: number;
  ia: number;
  manual: number;
  extraccion: number;
  sinRubro: number;
  pendientes: number;
};

export type LineaImpactoCuadratura = {
  linea: LineaContableDto;
  impacto: number;
  estadoFinanciero: string;
};

export {
  esLineaFilaTotalBalance,
  esLineaProbableFlujoEfectivo,
  esLineaProbableRuidoExtraccion,
  esLineaProbableRuidoOcrBalance,
  esLineaProbableRuidoRevision,
} from "./lineaCuadratura";

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
  const monto = l.montoNormalizado ?? l.montoOriginal;
  if (rubro?.convencionSigno === "invertido") return -Math.abs(monto);
  return monto;
}

export function calcularOrigenLineas(lineas: LineaContableDto[]): OrigenLineasResumen {
  let ia = 0;
  let manual = 0;
  let extraccion = 0;
  let sinRubro = 0;
  let pendientes = 0;

  for (const l of lineas) {
    if (l.requiereRevision && l.estado !== "aprobada") pendientes++;
    if (!l.rubroInstitucionalId && !l.rubroCodigo) {
      if (!l.excluirDeCuadratura && !esLineaFilaTotalBalance(l)) sinRubro++;
      continue;
    }
    const origen = l.origenClasificacion ?? "";
    if (
      origen === "ia_clasificacion" ||
      origen === "ia_revision" ||
      origen === "ia_pre_revision" ||
      l.clasificacionIaAt
    )
      ia++;
    else if (origen === "manual") manual++;
    else extraccion++;
  }

  return { total: lineas.length, ia, manual, extraccion, sinRubro, pendientes };
}

/** Líneas cuyo monto firmado más desbalancea la ecuación 1 = 2 + 3. */
export function calcularLineasImpactoCuadratura(
  lineas: LineaContableDto[],
  rubros: RubroOptionDto[],
  overrides?: Record<string, LineaDraftOverride>,
  limit = 3
): LineaImpactoCuadratura[] {
  const totales = calcularTotalesBalance(lineas, rubros, overrides);
  if (totales.cuadraturaOk) return [];
  const umbralTotal = Math.max(totales.activo, totales.pasivo + totales.patrimonio) * 0.85;

  const rubrosById = new Map(rubros.map((r) => [r.id, r]));
  const rubrosByCodigo = new Map(rubros.map((r) => [r.codigo, r]));
  const impactos: LineaImpactoCuadratura[] = [];

  for (const linea of lineas) {
    const rubro = rubroDeLinea(linea, rubrosById, rubrosByCodigo);
    if (!lineaParticipaCuadratura(linea, rubro)) continue;
    if (!rubro?.estadoFinanciero) continue;
    const monto = montoFirmado(linea, rubro);
    let signed = 0;
    if (rubro.estadoFinanciero === EstadoFinanciero.ACTIVO) signed = monto;
    else if (
      rubro.estadoFinanciero === EstadoFinanciero.PASIVO ||
      rubro.estadoFinanciero === EstadoFinanciero.PATRIMONIO
    ) {
      signed = -monto;
    } else {
      continue;
    }
    const impacto = Math.abs(signed);
    if (umbralTotal > 0 && impacto >= umbralTotal) continue;
    impactos.push({
      linea,
      impacto,
      estadoFinanciero: rubro.estadoFinanciero,
    });
  }

  return impactos.sort((a, b) => b.impacto - a.impacto).slice(0, limit);
}
