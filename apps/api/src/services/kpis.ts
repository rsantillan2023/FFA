import {
  AuditoriaEventoModel,
  CasoModel,
  CriterioAprobadoModel,
  FichaCanonicaModel,
  InformeComiteModel,
  LineaContableModel,
  ValidacionResultadoModel,
} from "@ffa/db";
import { CasoEstado, LineaEstado, type KpisDto } from "@ffa/shared";
import type { FilterQuery } from "mongoose";

export interface KpisQuery {
  desde?: Date;
  hasta?: Date;
}

function casoDateFilter(q: KpisQuery): FilterQuery<{ createdAt: Date }> {
  const f: FilterQuery<{ createdAt: Date }> = {};
  if (q.desde || q.hasta) {
    f.createdAt = {};
    if (q.desde) (f.createdAt as Record<string, Date>).$gte = q.desde;
    if (q.hasta) (f.createdAt as Record<string, Date>).$lte = q.hasta;
  }
  return f;
}

export async function computeKpis(query: KpisQuery = {}): Promise<KpisDto> {
  const dateFilter = casoDateFilter(query);

  const [
    totalCasos,
    enRevision,
    aprobados,
    informesGenerados,
    errores,
    pendienteCalidad,
    fichasAprobadas,
    informesFinales,
    lineasTotal,
    lineasRevision,
    casosAprobadosDocs,
    porEstado,
    porCanal,
    lineasConTrazabilidad,
    lineasEnAprobados,
    cuadraturaOkCasosAgg,
    validacionesFallidas,
    inconsistenciasConfirmadas,
    eventosErrorPipeline,
    casosSinIntervencion,
    contribuyentesMultiCaso,
    criteriosAprobadosTotal,
    casosPorMes,
  ] = await Promise.all([
    CasoModel.countDocuments(dateFilter),
    CasoModel.countDocuments({ ...dateFilter, estado: CasoEstado.EN_REVISION }),
    CasoModel.countDocuments({ ...dateFilter, estado: CasoEstado.APROBADO }),
    CasoModel.countDocuments({ ...dateFilter, estado: CasoEstado.INFORME_GENERADO }),
    CasoModel.countDocuments({ ...dateFilter, estado: CasoEstado.ERROR }),
    CasoModel.countDocuments({ ...dateFilter, estado: CasoEstado.PENDIENTE_CALIDAD }),
    FichaCanonicaModel.countDocuments({ estado: "aprobada" }),
    InformeComiteModel.countDocuments({ estado: "final" }),
    LineaContableModel.countDocuments(),
    LineaContableModel.countDocuments({ requiereRevision: true }),
    CasoModel.find({
      ...dateFilter,
      estado: { $in: [CasoEstado.APROBADO, CasoEstado.INFORME_GENERADO] },
    }).select("createdAt updatedAt _id"),
    CasoModel.aggregate<{ _id: string; count: number }>([
      ...(Object.keys(dateFilter).length ? [{ $match: dateFilter }] : []),
      { $group: { _id: "$estado", count: { $sum: 1 } } },
    ]),
    CasoModel.aggregate<{ _id: string; count: number }>([
      ...(Object.keys(dateFilter).length ? [{ $match: dateFilter }] : []),
      { $group: { _id: "$canal", count: { $sum: 1 } } },
    ]),
    LineaContableModel.countDocuments({
      documentoId: { $exists: true },
      paginaNumero: { $gte: 1 },
    }),
    LineaContableModel.countDocuments({
      estado: { $in: [LineaEstado.APROBADA, LineaEstado.CLASIFICADA] },
    }),
    ValidacionResultadoModel.aggregate<{ count: number }>([
      { $match: { tipo: "cuadratura", passed: true } },
      {
        $lookup: {
          from: CasoModel.collection.name,
          localField: "casoId",
          foreignField: "_id",
          as: "caso",
        },
      },
      { $unwind: "$caso" },
      {
        $match: {
          "caso.estado": { $in: [CasoEstado.APROBADO, CasoEstado.INFORME_GENERADO] },
          ...(dateFilter.createdAt
            ? { "caso.createdAt": dateFilter.createdAt as Record<string, Date> }
            : {}),
        },
      },
      { $group: { _id: "$casoId" } },
      { $count: "count" },
    ]).then((rows) => rows[0]?.count ?? 0),
    ValidacionResultadoModel.countDocuments({ passed: false }),
    ValidacionResultadoModel.countDocuments({ confirmadaPorAnalista: true }),
    AuditoriaEventoModel.countDocuments({
      accion: {
        $in: [
          "extraccion_derivada_revision",
          "extraccion_intento",
          "preprocess_completado",
        ],
      },
      "payload.ok": false,
    }),
    AuditoriaEventoModel.distinct("casoId", {
      accion: { $in: ["linea_corregida", "linea_aprobada_manual", "patch_linea"] },
      actorTipo: "usuario",
    }),
    CasoModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { contribuyenteId: { $exists: true } } },
      { $group: { _id: "$contribuyenteId", count: { $sum: 1 } } },
      { $match: { count: { $gte: 2 } } },
    ]),
    CriterioAprobadoModel.countDocuments({ activo: true }),
    CasoModel.aggregate<{ _id: { year: number; month: number }; ids: string[]; count: number }>([
      {
        $match: {
          ...dateFilter,
          estado: { $in: [CasoEstado.APROBADO, CasoEstado.INFORME_GENERADO] },
        },
      },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          ids: { $push: { $toString: "$_id" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
  ]);

  const tasaAutomatica =
    lineasTotal > 0 ? Math.round(((lineasTotal - lineasRevision) / lineasTotal) * 100) : 0;

  const tiemposMin = casosAprobadosDocs
    .map((c) => (c.updatedAt.getTime() - c.createdAt.getTime()) / 60_000)
    .filter((m) => m > 0);
  const tiempoPromedioMinutos =
    tiemposMin.length > 0
      ? Math.round(tiemposMin.reduce((a, b) => a + b, 0) / tiemposMin.length)
      : null;

  const metaMinutos = 25;
  const baselineHoras = 3.5;
  const reduccionVsBaselinePct =
    tiempoPromedioMinutos != null
      ? Math.round((1 - tiempoPromedioMinutos / 60 / baselineHoras) * 100)
      : null;

  const aprobadosCount = casosAprobadosDocs.length;
  const casosConCuadraturaOk = cuadraturaOkCasosAgg;
  const pctCuadraturaVerificada =
    aprobadosCount > 0
      ? Math.min(100, Math.round((casosConCuadraturaOk / aprobadosCount) * 100))
      : 0;

  const pctTrazabilidadCompleta =
    lineasEnAprobados > 0
      ? Math.round((lineasConTrazabilidad / lineasEnAprobados) * 100)
      : lineasTotal > 0
        ? Math.round((lineasConTrazabilidad / lineasTotal) * 100)
        : 0;

  const casosAprobadosIds = new Set(casosAprobadosDocs.map((c) => c._id.toString()));
  const sinIntervencion = [...casosAprobadosIds].filter(
    (id) => !casosSinIntervencion.some((cid) => cid?.toString() === id)
  ).length;
  const pctCasosSinIntervencion =
    aprobadosCount > 0 ? Math.round((sinIntervencion / aprobadosCount) * 100) : 0;

  const coberturaProcesamientoPct =
    totalCasos > 0
      ? Math.round(((totalCasos - pendienteCalidad) / totalCasos) * 100)
      : 100;

  let reduccionAprendizajePromedioPct: number | null = null;
  if (contribuyentesMultiCaso.length > 0) {
    const reducciones: number[] = [];
    for (const g of contribuyentesMultiCaso.slice(0, 20)) {
      const casos = await CasoModel.find({ contribuyenteId: g._id })
        .sort({ createdAt: 1 })
        .limit(2);
      if (casos.length < 2) continue;
      const [c1, c2] = casos;
      const [r1, r2] = await Promise.all([
        LineaContableModel.countDocuments({ casoId: c1!._id, requiereRevision: true }),
        LineaContableModel.countDocuments({ casoId: c2!._id, requiereRevision: true }),
      ]);
      if (r1 > 0) reducciones.push(((r1 - r2) / r1) * 100);
    }
    if (reducciones.length) {
      reduccionAprendizajePromedioPct = Math.round(
        reducciones.reduce((a, b) => a + b, 0) / reducciones.length
      );
    }
  }

  const intervencionPorCaso = new Set(
    casosSinIntervencion.map((id) => id?.toString()).filter(Boolean)
  );

  const resolucionAutomaticaMensual: Array<{
    periodo: string;
    casosAprobados: number;
    pctSinIntervencion: number;
  }> = [];
  for (const bucket of casosPorMes) {
    const sinInterv = bucket.ids.filter((id) => !intervencionPorCaso.has(id)).length;
    resolucionAutomaticaMensual.push({
      periodo: `${bucket._id.year}-${String(bucket._id.month).padStart(2, "0")}`,
      casosAprobados: bucket.count,
      pctSinIntervencion:
        bucket.count > 0 ? Math.round((sinInterv / bucket.count) * 100) : 0,
    });
  }

  let tendenciaResolucionAutomaticaPct: number | null = null;
  if (resolucionAutomaticaMensual.length >= 2) {
    const first = resolucionAutomaticaMensual[0]!.pctSinIntervencion;
    const last = resolucionAutomaticaMensual[resolucionAutomaticaMensual.length - 1]!
      .pctSinIntervencion;
    tendenciaResolucionAutomaticaPct = last - first;
  }

  const erroresPorEtapa = await AuditoriaEventoModel.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        accion: {
          $in: [
            "extraccion_intento",
            "extraccion_derivada_revision",
            "validacion_completada",
            "preprocess_completado",
          ],
        },
        "payload.ok": false,
      },
    },
    { $group: { _id: "$entidad", count: { $sum: 1 } } },
  ]);

  return {
    resumen: {
      totalCasos,
      enRevision,
      aprobados,
      informesGenerados,
      errores,
      fichasAprobadas,
      informesFinales,
      pendienteCalidad,
    },
    operacion: {
      lineasProcesadas: lineasTotal,
      lineasPendientesRevision: lineasRevision,
      tasaResolucionAutomaticaPct: tasaAutomatica,
      coberturaProcesamientoPct,
    },
    tiempos: {
      promedioMinutosAprobacion: tiempoPromedioMinutos,
      metaMinutos,
      reduccionVsBaselineHorasPct: reduccionVsBaselinePct,
      baselineReferenciaHoras: baselineHoras,
    },
    calidad: {
      pctCuadraturaVerificada,
      casosConCuadraturaOk,
      casosCuadraturaTotal: aprobadosCount,
      pctTrazabilidadCompleta,
      pctCasosSinIntervencionHumana: pctCasosSinIntervencion,
      inconsistenciasConfirmadas,
      validacionesFallidas,
    },
    aprendizaje: {
      contribuyentesConHistorial: contribuyentesMultiCaso.length,
      reduccionLineasRevisionPromedioPct: reduccionAprendizajePromedioPct,
      criteriosAprobadosTotal,
      tendenciaResolucionAutomaticaPct,
    },
    resolucionAutomaticaMensual,
    casosPorEstado: Object.fromEntries(porEstado.map((p) => [p._id, p.count])),
    casosPorCanal: Object.fromEntries(porCanal.map((p) => [p._id, p.count])),
    erroresPorEtapa: Object.fromEntries(erroresPorEtapa.map((p) => [p._id, p.count])),
    pipelineErrores: eventosErrorPipeline,
    periodo: {
      desde: query.desde?.toISOString() ?? null,
      hasta: query.hasta?.toISOString() ?? null,
    },
    generadoAt: new Date().toISOString(),
  };
}
