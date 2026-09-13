import {
  ConfiguracionSistemaModel,
  FichaCanonicaModel,
  IndicadorCalculadoModel,
  IndicadorDefinicionVersionModel,
  RubroInstitucionalModel,
  type FichaCanonicaDocument,
} from "@ffa/db";
import { computeIndicators, type IndicadorDefinicion } from "@ffa/pipeline";
import { CONFIG_SISTEMA_ID, EstadoFinanciero } from "@ffa/shared";
import { Types } from "mongoose";

function sumBalanceByFilter(
  ficha: FichaCanonicaDocument,
  rubroMap: Map<string, { estadoFinanciero: string; corriente?: boolean | null; convencionSigno: string }>,
  filter: (r: { estadoFinanciero: string; corriente?: boolean | null }) => boolean
): number {
  let total = 0;
  for (const d of ficha.balance?.detalle ?? []) {
    const rubro = rubroMap.get(d.codigo);
    if (!rubro || !filter(rubro as { estadoFinanciero: string; corriente?: boolean | null })) continue;
    const m = d.monto;
    total += rubro.convencionSigno === "invertido" ? -Math.abs(m) : m;
  }
  return total;
}

export async function enriquecerFichaTotales(fichaId: string): Promise<void> {
  const ficha = await FichaCanonicaModel.findById(fichaId);
  if (!ficha) return;

  const rubros = await RubroInstitucionalModel.find({
    planCuentasVersionId: ficha.planCuentasVersionId,
  });
  const rubroMap = new Map(rubros.map((r) => [r.codigo, r]));

  if (!ficha.balance) {
    ficha.set("balance", { detalle: [] });
  }
  ficha.balance!.activoCorriente = sumBalanceByFilter(
    ficha,
    rubroMap,
    (r) => r.estadoFinanciero === EstadoFinanciero.ACTIVO && r.corriente === true
  );
  ficha.balance!.activoNoCorriente = sumBalanceByFilter(
    ficha,
    rubroMap,
    (r) => r.estadoFinanciero === EstadoFinanciero.ACTIVO && r.corriente !== true
  );
  ficha.balance!.pasivoCorriente = sumBalanceByFilter(
    ficha,
    rubroMap,
    (r) => r.estadoFinanciero === EstadoFinanciero.PASIVO && r.corriente === true
  );
  ficha.balance!.pasivoNoCorriente = sumBalanceByFilter(
    ficha,
    rubroMap,
    (r) => r.estadoFinanciero === EstadoFinanciero.PASIVO && r.corriente !== true
  );
  ficha.balance!.patrimonio = sumBalanceByFilter(
    ficha,
    rubroMap,
    (r) => r.estadoFinanciero === EstadoFinanciero.PATRIMONIO
  );

  let utilidad = 0;
  for (const d of ficha.estadoResultados?.detalle ?? []) {
    const rubro = rubroMap.get(d.codigo);
    const m = d.monto;
    utilidad += rubro?.convencionSigno === "invertido" ? -Math.abs(m) : m;
  }
  if (!ficha.estadoResultados) {
    ficha.set("estadoResultados", { detalle: [] });
  }
  ficha.estadoResultados!.utilidad = utilidad;

  await ficha.save();
}

export async function calcularIndicadoresFicha(fichaId: string): Promise<number> {
  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  if (!config?.indicadoresVigenteId) {
    throw new Error("No hay versión de indicadores vigente — ejecute seed");
  }

  const [ficha, defVersion, rubros] = await Promise.all([
    FichaCanonicaModel.findById(fichaId),
    IndicadorDefinicionVersionModel.findById(config.indicadoresVigenteId),
    FichaCanonicaModel.findById(fichaId).then(async (f) =>
      f
        ? RubroInstitucionalModel.find({ planCuentasVersionId: f.planCuentasVersionId, activo: true })
        : []
    ),
  ]);

  if (!ficha || !defVersion) throw new Error("Ficha o definiciones no encontradas");

  const definiciones: IndicadorDefinicion[] = (defVersion.indicadores ?? []).map((i) => ({
    codigo: i.codigo,
    nombre: i.nombre,
    categoria: i.categoria,
    formula: i.formula,
    rubrosRequeridos: i.rubrosRequeridos ?? [],
    obligatorio: i.obligatorio ?? false,
  }));

  const resultados = computeIndicators(
    {
      detalleBalance: (ficha.balance?.detalle ?? []).map((d) => ({
        codigo: d.codigo,
        monto: d.monto,
        lineasIds: (d.lineasIds ?? []).map((id) => id.toString()),
      })),
      detalleResultados: (ficha.estadoResultados?.detalle ?? []).map((d) => ({
        codigo: d.codigo,
        monto: d.monto,
        lineasIds: (d.lineasIds ?? []).map((id) => id.toString()),
      })),
      rubros: rubros.map((r) => ({
        id: r._id.toString(),
        codigo: r.codigo,
        nombre: r.nombre,
        estadoFinanciero: r.estadoFinanciero,
        convencionSigno: r.convencionSigno,
        corriente: r.corriente ?? undefined,
      })),
    },
    definiciones
  );

  await IndicadorCalculadoModel.deleteMany({ fichaId });

  if (resultados.length > 0) {
    await IndicadorCalculadoModel.insertMany(
      resultados.map((r) => ({
        fichaId: new Types.ObjectId(fichaId),
        indicadorCodigo: r.codigo,
        definicionVersionId: defVersion._id,
        valor: r.valor ?? undefined,
        calculable: r.calculable,
        error: r.error,
        lineasParticipantes: r.lineasParticipantes.map((id) => new Types.ObjectId(id)),
        calculadoAt: new Date(),
      }))
    );
  }

  return resultados.filter((r) => r.calculable).length;
}
