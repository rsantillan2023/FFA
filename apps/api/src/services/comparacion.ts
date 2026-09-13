import {
  CasoModel,
  ContribuyenteModel,
  CriterioAprobadoModel,
  FichaCanonicaModel,
  IndicadorCalculadoModel,
  RubroInstitucionalModel,
  type CasoDocument,
  type FichaCanonicaDocument,
} from "@ffa/db";
import type {
  ComparacionCarteraDto,
  ComparacionEjerciciosDto,
  ComparacionCarteraItemDto,
  DeterioroDetectadoDto,
  HistorialFichaDto,
  MetricaComparadaDto,
} from "@ffa/shared";
import { CasoEstado } from "@ffa/shared";

function pctVar(actual: number | null, anterior: number | null): number | null {
  if (actual == null || anterior == null || anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

function metrica(
  concepto: string,
  actual: number | null | undefined,
  anterior: number | null | undefined,
  codigo?: string
): MetricaComparadaDto {
  const a = actual ?? null;
  const b = anterior ?? null;
  const variacionAbs = a != null && b != null ? a - b : null;
  return {
    concepto,
    codigo,
    actual: a,
    anterior: b,
    variacionAbs,
    variacionPct: pctVar(a, b),
  };
}

function detectarDeterioros(
  balance: MetricaComparadaDto[],
  indicadores: MetricaComparadaDto[],
  semaforoActual?: string | null,
  semaforoAnterior?: string | null
): DeterioroDetectadoDto[] {
  const out: DeterioroDetectadoDto[] = [];

  const liq = indicadores.find((i) => i.codigo === "LIQ_CORRIENTE");
  if (liq?.actual != null && liq.anterior != null && liq.actual < liq.anterior) {
    const drop = liq.variacionPct ?? 0;
    out.push({
      tipo: "liquidez",
      severidad: drop < -20 || liq.actual < 1 ? "grave" : "moderado",
      mensaje: `Liquidez corriente cayó de ${liq.anterior.toFixed(2)} a ${liq.actual.toFixed(2)}`,
      metrica: "LIQ_CORRIENTE",
    });
  }

  const end = indicadores.find((i) => i.codigo === "END_TOTAL");
  if (end?.actual != null && end.anterior != null && end.actual > end.anterior) {
    const rise = end.variacionPct ?? 0;
    out.push({
      tipo: "endeudamiento",
      severidad: rise > 15 ? "grave" : "moderado",
      mensaje: `Endeudamiento total subió de ${end.anterior.toFixed(2)} a ${end.actual.toFixed(2)}`,
      metrica: "END_TOTAL",
    });
  }

  const util = balance.find((b) => b.concepto === "Utilidad ejercicio");
  if (util?.actual != null && util.anterior != null && util.actual < 0 && util.anterior >= 0) {
    out.push({
      tipo: "resultados",
      severidad: "grave",
      mensaje: "Utilidad pasó de positiva a negativa",
      metrica: "utilidad",
    });
  }

  const pat = balance.find((b) => b.concepto === "Patrimonio");
  if (pat?.variacionPct != null && pat.variacionPct < -10) {
    out.push({
      tipo: "patrimonio",
      severidad: pat.variacionPct < -25 ? "grave" : "moderado",
      mensaje: `Patrimonio disminuyó ${Math.abs(pat.variacionPct).toFixed(1)}%`,
      metrica: "patrimonio",
    });
  }

  if (semaforoAnterior === "verde" && (semaforoActual === "amarillo" || semaforoActual === "rojo")) {
    out.push({
      tipo: "semaforo",
      severidad: semaforoActual === "rojo" ? "grave" : "moderado",
      mensaje: `Semáforo empeoró de ${semaforoAnterior} a ${semaforoActual}`,
      metrica: "semaforo",
    });
  }

  return out;
}

async function loadFichaContext(fichaId: string): Promise<{
  ficha: FichaCanonicaDocument;
  caso: CasoDocument;
  indicadores: Map<string, number | null>;
}> {
  const ficha = await FichaCanonicaModel.findById(fichaId);
  if (!ficha || ficha.estado !== "aprobada") {
    throw new Error("Ficha no encontrada o no aprobada");
  }
  const caso = await CasoModel.findById(ficha.casoId);
  if (!caso) throw new Error("Caso no encontrado");

  const indDocs = await IndicadorCalculadoModel.find({ fichaId: ficha._id });
  const indicadores = new Map<string, number | null>();
  for (const i of indDocs) {
    indicadores.set(i.indicadorCodigo, i.calculable ? (i.valor ?? null) : null);
  }

  return { ficha, caso, indicadores };
}

function buildBalanceMetrics(
  actual: FichaCanonicaDocument,
  anterior: FichaCanonicaDocument | null
): MetricaComparadaDto[] {
  const pairs: [string, number | null | undefined, number | null | undefined][] = [
    ["Activo corriente", actual.balance?.activoCorriente, anterior?.balance?.activoCorriente],
    ["Activo no corriente", actual.balance?.activoNoCorriente, anterior?.balance?.activoNoCorriente],
    ["Pasivo corriente", actual.balance?.pasivoCorriente, anterior?.balance?.pasivoCorriente],
    ["Pasivo no corriente", actual.balance?.pasivoNoCorriente, anterior?.balance?.pasivoNoCorriente],
    ["Patrimonio", actual.balance?.patrimonio, anterior?.balance?.patrimonio],
    ["Utilidad ejercicio", actual.estadoResultados?.utilidad, anterior?.estadoResultados?.utilidad],
  ];
  return pairs.map(([concepto, a, b]) => metrica(concepto, a, b));
}

function buildIndicadorMetrics(
  actual: Map<string, number | null>,
  anterior: Map<string, number | null>
): MetricaComparadaDto[] {
  const codes = new Set([...actual.keys(), ...anterior.keys()]);
  return [...codes].map((codigo) =>
    metrica(codigo, actual.get(codigo), anterior.get(codigo), codigo)
  );
}

export async function historialContribuyente(
  contribuyenteId: string
): Promise<HistorialFichaDto[]> {
  const casos = await CasoModel.find({
    contribuyenteId,
    estado: { $in: [CasoEstado.APROBADO, CasoEstado.INFORME_GENERADO] },
  }).sort({ "periodo.ejercicio": -1, updatedAt: -1 });

  const fichas = await FichaCanonicaModel.find({
    casoId: { $in: casos.map((c) => c._id) },
    estado: "aprobada",
  });
  const fichaMap = new Map(fichas.map((f) => [f.casoId.toString(), f]));

  return casos
    .filter((c) => fichaMap.has(c._id.toString()))
    .map((c) => {
      const f = fichaMap.get(c._id.toString())!;
      return {
        casoId: c._id.toString(),
        fichaId: f._id.toString(),
        numero: c.numero,
        ejercicio: c.periodo?.ejercicio ?? undefined,
        estado: c.estado,
        semaforo: c.semaforo ?? undefined,
        aprobadaAt: f.aprobadaAt?.toISOString(),
        fichaVersion: f.version,
      };
    });
}

export async function compararEjercicios(
  contribuyenteId: string,
  fichaActualId: string,
  fichaAnteriorId?: string
): Promise<ComparacionEjerciciosDto> {
  const contrib = await ContribuyenteModel.findById(contribuyenteId);
  const ctxActual = await loadFichaContext(fichaActualId);

  if (ctxActual.ficha.contribuyenteId?.toString() !== contribuyenteId) {
    throw new Error("La ficha no pertenece al contribuyente");
  }

  let anteriorId = fichaAnteriorId;
  if (!anteriorId) {
    const historial = await historialContribuyente(contribuyenteId);
    const idx = historial.findIndex((h) => h.fichaId === fichaActualId);
    if (idx >= 0 && idx + 1 < historial.length) {
      anteriorId = historial[idx + 1]!.fichaId;
    }
  }

  let ctxAnterior: Awaited<ReturnType<typeof loadFichaContext>> | null = null;
  if (anteriorId) {
    ctxAnterior = await loadFichaContext(anteriorId);
  }

  const balance = buildBalanceMetrics(
    ctxActual.ficha,
    ctxAnterior?.ficha ?? null
  );
  const indicadores = buildIndicadorMetrics(
    ctxActual.indicadores,
    ctxAnterior?.indicadores ?? new Map()
  );
  const deterioros = detectarDeterioros(
    balance,
    indicadores,
    ctxActual.caso.semaforo,
    ctxAnterior?.caso.semaforo
  );

  return {
    contribuyenteId,
    contribuyenteNombre: contrib?.razonSocial,
    fichaActualId,
    fichaAnteriorId: anteriorId,
    ejercicioActual: ctxActual.caso.periodo?.ejercicio ?? undefined,
    ejercicioAnterior: ctxAnterior?.caso.periodo?.ejercicio ?? undefined,
    balance,
    indicadores,
    deterioros,
  };
}

export async function compararCartera(fichaIds: string[]): Promise<ComparacionCarteraDto> {
  if (fichaIds.length < 2) throw new Error("Se requieren al menos 2 fichas");
  if (fichaIds.length > 12) throw new Error("Máximo 12 fichas por comparación");

  const fichas = await FichaCanonicaModel.find({
    _id: { $in: fichaIds },
    estado: "aprobada",
  });
  if (fichas.length !== fichaIds.length) {
    throw new Error("Una o más fichas no existen o no están aprobadas");
  }

  const planId = fichas[0]!.planCuentasVersionId.toString();
  if (!fichas.every((f) => f.planCuentasVersionId.toString() === planId)) {
    throw new Error("Todas las fichas deben usar el mismo plan de cuentas");
  }

  const casos = await CasoModel.find({ _id: { $in: fichas.map((f) => f.casoId) } });
  const casoMap = new Map(casos.map((c) => [c._id.toString(), c]));
  const contribIds = casos.map((c) => c.contribuyenteId).filter(Boolean);
  const contribs = await ContribuyenteModel.find({ _id: { $in: contribIds } });
  const contribMap = new Map(contribs.map((c) => [c._id.toString(), c.razonSocial]));

  const indDocs = await IndicadorCalculadoModel.find({
    fichaId: { $in: fichas.map((f) => f._id) },
  });
  const indByFicha = new Map<string, Record<string, number | null>>();
  for (const f of fichas) {
    indByFicha.set(f._id.toString(), {});
  }
  for (const i of indDocs) {
    const m = indByFicha.get(i.fichaId.toString())!;
    m[i.indicadorCodigo] = i.calculable ? (i.valor ?? null) : null;
  }

  const items: ComparacionCarteraItemDto[] = fichas.map((f) => {
    const caso = casoMap.get(f.casoId.toString());
    const cid = caso?.contribuyenteId?.toString();
    return {
      fichaId: f._id.toString(),
      casoId: f.casoId.toString(),
      contribuyenteId: cid,
      contribuyenteNombre: cid ? contribMap.get(cid) : undefined,
      ejercicio: caso?.periodo?.ejercicio ?? undefined,
      activoCorriente: f.balance?.activoCorriente ?? undefined,
      pasivoCorriente: f.balance?.pasivoCorriente ?? undefined,
      patrimonio: f.balance?.patrimonio ?? undefined,
      utilidad: f.estadoResultados?.utilidad ?? undefined,
      indicadores: indByFicha.get(f._id.toString()) ?? {},
    };
  });

  return { planCuentasVersionId: planId, items };
}

export async function criteriosHistoricosContribuyente(contribuyenteId: string) {
  const criterios = await CriterioAprobadoModel.find({ contribuyenteId }).sort({
    aprobadoAt: -1,
  });
  const rubroIds = criterios.map((c) => c.rubroInstitucionalId);
  const rubros = await RubroInstitucionalModel.find({ _id: { $in: rubroIds } });
  const rubroMap = new Map(rubros.map((r) => [r._id.toString(), r.codigo]));

  return criterios.map((c) => ({
    id: c._id.toString(),
    denominacionOrigen: c.denominacionOrigen,
    rubroInstitucionalId: c.rubroInstitucionalId.toString(),
    rubroCodigo: rubroMap.get(c.rubroInstitucionalId.toString()),
    aprobadoAt: c.aprobadoAt.toISOString(),
    casoOrigenId: c.casoOrigenId?.toString(),
    activo: c.activo,
  }));
}
