import {
  analizarBalance,
  calcularTotalesCuadraturaRevision,
  colapsarDuplicadosEscala,
  diagnosticarCuadraturaIa,
  filtrarRubrosAsignables,
  planificarReconciliacion,
  runWithIaContext,
  type RubroRef,
} from "@ffa/pipeline";
import { ContribuyenteModel } from "../models/contribuyente.js";
import {
  LineaEstado,
  type BalanceAnalisisDto,
  type ReconciliarBalanceResultDto,
} from "@ffa/shared";
import { Types } from "mongoose";
import { CasoModel } from "../models/caso.js";
import { LineaContableModel, type LineaContableDocument } from "../models/linea-contable.js";
import {
  RubroInstitucionalModel,
  type RubroInstitucionalDocument,
} from "../models/rubro-institucional.js";

const RUBROS_GENERICOS: Array<{
  codigo: string;
  nombre: string;
  estadoFinanciero: string;
  convencionSigno?: "normal" | "invertido";
  orden: number;
}> = [
  {
    codigo: "1.9",
    nombre: "Otros activos (imputación genérica)",
    estadoFinanciero: "activo",
    orden: 16,
  },
  {
    codigo: "3.9",
    nombre: "Otros patrimonio / ajuste cuadratura",
    estadoFinanciero: "patrimonio",
    orden: 47,
  },
];

export async function ensureRubrosGenericosCuadratura(planId: Types.ObjectId): Promise<void> {
  for (const g of RUBROS_GENERICOS) {
    const exists = await RubroInstitucionalModel.findOne({
      planCuentasVersionId: planId,
      codigo: g.codigo,
    });
    if (exists) continue;
    await RubroInstitucionalModel.create({
      planCuentasVersionId: planId,
      codigo: g.codigo,
      nombre: g.nombre,
      estadoFinanciero: g.estadoFinanciero,
      convencionSigno: g.convencionSigno ?? "normal",
      activo: true,
      orden: g.orden,
    });
  }
}

function toRubroRefs(docs: RubroInstitucionalDocument[]): RubroRef[] {
  return docs.map((r) => ({
    id: r._id.toString(),
    codigo: r.codigo,
    nombre: r.nombre,
    estadoFinanciero: r.estadoFinanciero,
    convencionSigno: r.convencionSigno,
    padreId: r.padreId?.toString(),
  }));
}

function mapAnalisis(a: ReturnType<typeof analizarBalance>): BalanceAnalisisDto {
  return {
    testigos: a.testigos.map((t) => ({
      paginaNumero: t.paginaNumero,
      totalActivo: t.totalActivo,
      totalPasivoPatrimonio: t.totalPasivoPatrimonio,
      cuadra: t.cuadra,
    })),
    testigoRecomendado: a.testigoRecomendado
      ? {
          paginaNumero: a.testigoRecomendado.paginaNumero,
          totalActivo: a.testigoRecomendado.totalActivo,
          totalPasivoPatrimonio: a.testigoRecomendado.totalPasivoPatrimonio,
          cuadra: a.testigoRecomendado.cuadra,
        }
      : null,
    paginasBalanceObjetivo: a.paginasBalanceObjetivo,
    totales: a.totales,
    conteos: a.conteos,
    paresEscala: a.paresEscala,
    patrimonioMalEnPasivo: a.patrimonioMalEnPasivo,
    activoIncompleto: a.activoIncompleto,
    ratioActivoVsTestigo: a.ratioActivoVsTestigo,
  };
}

function lineaInput(doc: LineaContableDocument) {
  return {
    id: doc._id.toString(),
    denominacionOriginal: doc.denominacionOriginal,
    denominacionNormalizada: doc.denominacionNormalizada ?? undefined,
    montoOriginal: doc.montoOriginal,
    montoNormalizado: doc.montoNormalizado ?? undefined,
    paginaNumero: doc.paginaNumero,
    rubroInstitucionalId: doc.rubroInstitucionalId?.toString(),
    rubroCodigo: doc.rubroCodigo ?? undefined,
    estado: doc.estado,
    confianzaClasificacion: doc.confianzaClasificacion ?? undefined,
    confianzaExtraccion: doc.confianzaExtraccion ?? undefined,
    origenClasificacion: doc.origenClasificacion ?? undefined,
    excluirDeCuadratura: doc.excluirDeCuadratura ?? false,
    motivoExclusionCuadratura: doc.motivoExclusionCuadratura ?? undefined,
  };
}

function rubrosParaAnalisis(rubrosDocs: RubroInstitucionalDocument[]) {
  const refs = toRubroRefs(rubrosDocs);
  const asignables = filtrarRubrosAsignables(refs);
  const idsAsignables = new Set(asignables.map((r) => r.id));
  return refs
    .filter((r) => idsAsignables.has(r.id) || RUBROS_GENERICOS.some((g) => g.codigo === r.codigo))
    .map((r) => ({
      id: r.id,
      codigo: r.codigo,
      estadoFinanciero: r.estadoFinanciero,
      asignable: idsAsignables.has(r.id),
    }));
}

function rubrosParaCuadraturaRevision(rubrosDocs: RubroInstitucionalDocument[]) {
  const refs = toRubroRefs(rubrosDocs);
  const asignables = filtrarRubrosAsignables(refs);
  const idsAsignables = new Set(asignables.map((r) => r.id));
  return refs
    .filter((r) => idsAsignables.has(r.id) || RUBROS_GENERICOS.some((g) => g.codigo === r.codigo))
    .map((r) => ({
      id: r.id,
      codigo: r.codigo,
      estadoFinanciero: r.estadoFinanciero,
      asignable: idsAsignables.has(r.id),
      convencionSigno: r.convencionSigno,
    }));
}

export interface CuadraturaCasoResumen {
  cuadraturaOk: boolean;
  diferenciaCuadraturaPct: number;
  activo: number;
  pasivo: number;
  patrimonio: number;
  diferencia: number;
}

/** Cuadratura en vivo (misma lógica que /revision y diagnóstico de balance). */
export async function cuadraturaResumenPorCasos(
  casoIds: Array<{ toString(): string }>
): Promise<Map<string, CuadraturaCasoResumen>> {
  const porCaso = new Map<string, CuadraturaCasoResumen>();
  if (casoIds.length === 0) return porCaso;

  const ids = casoIds.map((id) => id.toString());
  const casos = await CasoModel.find({ _id: { $in: ids } }).select("planCuentasVersionId").lean();
  const planIds = [
    ...new Set(
      casos
        .map((c) => c.planCuentasVersionId?.toString())
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (planIds.length === 0) return porCaso;

  const [lineasDocs, rubrosDocs] = await Promise.all([
    LineaContableModel.find({ casoId: { $in: ids } }),
    RubroInstitucionalModel.find({ planCuentasVersionId: { $in: planIds }, activo: true }),
  ]);

  const lineasByCaso = new Map<string, LineaContableDocument[]>();
  for (const linea of lineasDocs) {
    const casoId = linea.casoId.toString();
    const bucket = lineasByCaso.get(casoId);
    if (bucket) bucket.push(linea);
    else lineasByCaso.set(casoId, [linea]);
  }

  const rubrosByPlan = new Map<string, RubroInstitucionalDocument[]>();
  for (const rubro of rubrosDocs) {
    const planId = rubro.planCuentasVersionId.toString();
    const bucket = rubrosByPlan.get(planId);
    if (bucket) bucket.push(rubro);
    else rubrosByPlan.set(planId, [rubro]);
  }

  const planByCaso = new Map(
    casos.map((c) => [c._id.toString(), c.planCuentasVersionId?.toString()])
  );

  for (const casoId of ids) {
    const planId = planByCaso.get(casoId);
    if (!planId) continue;
    const lineas = lineasByCaso.get(casoId);
    if (!lineas?.length) continue;

    const rubrosDocs = rubrosByPlan.get(planId) ?? [];
    const totales = calcularTotalesCuadraturaRevision(
      lineas.map(lineaInput),
      rubrosParaCuadraturaRevision(rubrosDocs)
    );
    const {
      activo,
      pasivo,
      patrimonio,
      cuadraturaOk,
      diferencia,
      diferenciaPct: diferenciaCuadraturaPct,
    } = totales;

    porCaso.set(casoId, {
      activo,
      pasivo,
      patrimonio,
      cuadraturaOk,
      diferencia,
      diferenciaCuadraturaPct,
    });
  }

  return porCaso;
}

export async function analizarBalanceCaso(
  casoId: string,
  paginasObjetivo?: number[],
  opts?: { diagnosticoIa?: boolean }
): Promise<BalanceAnalisisDto> {
  const caso = await CasoModel.findById(casoId);
  if (!caso?.planCuentasVersionId) throw new Error("Caso sin plan de cuentas");

  const [lineas, rubrosDocs, contrib] = await Promise.all([
    LineaContableModel.find({ casoId }),
    RubroInstitucionalModel.find({ planCuentasVersionId: caso.planCuentasVersionId, activo: true }),
    caso.contribuyenteId ? ContribuyenteModel.findById(caso.contribuyenteId) : null,
  ]);

  const rubros = rubrosParaAnalisis(rubrosDocs);
  const analisis = analizarBalance(lineas.map(lineaInput), rubros, paginasObjetivo);
  const dto = mapAnalisis(analisis);

  if (opts?.diagnosticoIa && !dto.totales.cuadraturaOk) {
    try {
      const diag = await runWithIaContext({ actorTipo: "sistema", casoId }, () =>
        diagnosticarCuadraturaIa({
          totales: dto.totales,
          testigoActivo: dto.testigoRecomendado?.totalActivo,
          testigoPasivoPatrimonio: dto.testigoRecomendado?.totalPasivoPatrimonio,
          paginasBalance: dto.paginasBalanceObjetivo,
          lineasResumen: lineas.slice(0, 60).map((l) => ({
            denominacion: l.denominacionOriginal,
            monto: l.montoNormalizado ?? l.montoOriginal,
            rubroCodigo: l.rubroCodigo ?? undefined,
            pagina: l.paginaNumero,
            excluida: Boolean(l.excluirDeCuadratura),
          })),
          contexto: {
            moneda: caso.moneda ?? undefined,
            escala: caso.escala ?? undefined,
            razonSocial: contrib?.razonSocial ?? undefined,
          },
        })
      );
      if (diag) {
        dto.diagnosticoIa = {
          resumen: diag.resumen,
          causasProbables: diag.causasProbables,
          accionesSugeridas: diag.accionesSugeridas,
        };
      }
    } catch {
      /* diagnóstico opcional */
    }
  }

  return dto;
}

export async function reconciliarBalanceCaso(
  casoId: string,
  opts?: { paginasObjetivo?: number[]; crearAjuste?: boolean }
): Promise<ReconciliarBalanceResultDto> {
  const caso = await CasoModel.findById(casoId);
  if (!caso?.planCuentasVersionId) throw new Error("Caso sin plan de cuentas");

  await ensureRubrosGenericosCuadratura(caso.planCuentasVersionId);

  const [lineas, rubrosDocs] = await Promise.all([
    LineaContableModel.find({ casoId }),
    RubroInstitucionalModel.find({ planCuentasVersionId: caso.planCuentasVersionId, activo: true }),
  ]);

  const refs = toRubroRefs(rubrosDocs);
  const asignables = filtrarRubrosAsignables(refs);
  const idsAsignables = new Set(asignables.map((r) => r.id));
  const rubros = refs.map((r) => ({
    id: r.id,
    codigo: r.codigo,
    estadoFinanciero: r.estadoFinanciero,
    asignable: idsAsignables.has(r.id),
  }));
  const rubroByCodigo = new Map(rubrosDocs.map((r) => [r.codigo, r]));

  let inputs = lineas.map(lineaInput);
  const paginas =
    opts?.paginasObjetivo ?? analizarBalance(inputs, rubros).paginasBalanceObjetivo;

  function dedupAcciones(acciones: ReturnType<typeof planificarReconciliacion>) {
    const seen = new Set<string>();
    return acciones.filter((a) => {
      const k = `${a.tipo}:${a.lineaId ?? ""}:${a.rubroCodigoDestino ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  let lineasEliminadas = 0;
  let lineasExcluidas = 0;
  let lineasIncluidas = 0;
  let lineasReclasificadas = 0;
  let accionesAplicadas = 0;

  const aplicarReclasificar = async (acc: ReturnType<typeof planificarReconciliacion>[0]) => {
    if (!acc.lineaId || !acc.rubroCodigoDestino) return;
    const rubro = rubroByCodigo.get(acc.rubroCodigoDestino);
    if (!rubro) return;
    await LineaContableModel.updateOne(
      { _id: acc.lineaId, casoId },
      {
        rubroInstitucionalId: rubro._id,
        rubroCodigo: rubro.codigo,
        clasificacionPropuesta: rubro._id,
        origenClasificacion: "manual",
        requiereRevision: false,
        estado: LineaEstado.CLASIFICADA,
        excluirDeCuadratura: false,
        $unset: { motivoExclusionCuadratura: 1 },
      }
    );
    lineasReclasificadas++;
  };

  async function recargarInputs() {
    const docs = await LineaContableModel.find({ casoId });
    inputs = docs.map(lineaInput);
    return docs;
  }

  const fase1 = dedupAcciones(planificarReconciliacion(inputs, rubros, paginas));
  for (const acc of fase1.filter((a) => a.tipo === "reclasificar_rubro")) {
    await aplicarReclasificar(acc);
    accionesAplicadas++;
  }
  for (const acc of fase1.filter((a) => a.tipo === "incluir_cuadratura")) {
    if (!acc.lineaId) continue;
    await LineaContableModel.updateOne(
      { _id: acc.lineaId, casoId },
      { excluirDeCuadratura: false, $unset: { motivoExclusionCuadratura: 1 } }
    );
    lineasIncluidas++;
    accionesAplicadas++;
  }

  await recargarInputs();

  const fase2 = dedupAcciones(planificarReconciliacion(inputs, rubros, paginas));
  for (const acc of fase2.filter((a) => a.tipo === "eliminar_escala")) {
    if (!acc.lineaId) continue;
    await LineaContableModel.updateOne(
      { _id: acc.lineaId, casoId },
      {
        excluirDeCuadratura: true,
        motivoExclusionCuadratura: "escala_duplicada",
        requiereRevision: true,
      }
    );
    lineasExcluidas++;
    accionesAplicadas++;
  }
  for (const acc of fase2.filter((a) => a.tipo === "excluir_cuadratura")) {
    if (!acc.lineaId) continue;
    const motivo = acc.descripcion.includes("otro estado")
      ? "otro_estado"
      : (acc.descripcion.match(/\(([^)]+)\)/)?.[1] ?? "manual");
    await LineaContableModel.updateOne(
      { _id: acc.lineaId, casoId },
      {
        excluirDeCuadratura: true,
        motivoExclusionCuadratura: motivo,
      }
    );
    lineasExcluidas++;
    accionesAplicadas++;
  }

  await recargarInputs();

  const enBalance = inputs.filter(
    (l) => l.paginaNumero && paginas.includes(l.paginaNumero) && !l.excluirDeCuadratura
  );
  const conservadas = new Set(colapsarDuplicadosEscala(enBalance).map((l) => l.id));
  for (const l of enBalance) {
    if (conservadas.has(l.id)) continue;
    await LineaContableModel.updateOne(
      { _id: l.id, casoId },
      {
        excluirDeCuadratura: true,
        motivoExclusionCuadratura: "duplicado_escala",
        requiereRevision: true,
      }
    );
    lineasExcluidas++;
    accionesAplicadas++;
  }
  await recargarInputs();

  let ajusteCreado = false;
  if (opts?.crearAjuste === true) {
    await LineaContableModel.deleteMany({
      casoId,
      denominacionOriginal: {
        $in: [
          "Ajuste de cuadratura (reconciliación automática)",
          "Ajuste imputación genérica activo (testigo PDF)",
          "Ajuste imputación genérica patrimonio (testigo PDF)",
        ],
      },
    });

    const rubrosPost = await RubroInstitucionalModel.find({
      planCuentasVersionId: caso.planCuentasVersionId,
      activo: true,
    });
    rubroByCodigo.clear();
    for (const r of rubrosPost) rubroByCodigo.set(r.codigo, r);

    const lineasPost = await LineaContableModel.find({ casoId });
    const analisisPost = analizarBalance(lineasPost.map(lineaInput), rubros, paginas);
    const tolerancia =
      Math.max(analisisPost.totales.activo, analisisPost.testigoRecomendado?.totalActivo ?? 0, 1) *
      0.002;
    const docRef = lineasPost[0];
    const paginaAjuste = paginas[0] ?? analisisPost.testigoRecomendado?.paginaNumero ?? 1;

    async function crearAjuste(
      rubroCodigo: string,
      monto: number,
      denominacion: string
    ): Promise<boolean> {
      const rubro = rubroByCodigo.get(rubroCodigo);
      if (!rubro || !docRef || Math.abs(monto) <= tolerancia) return false;
      await LineaContableModel.create({
        casoId,
        documentoId: docRef.documentoId,
        paginaNumero: paginaAjuste,
        denominacionOriginal: denominacion,
        montoOriginal: monto,
        montoNormalizado: monto,
        rubroInstitucionalId: rubro._id,
        rubroCodigo: rubro.codigo,
        clasificacionPropuesta: rubro._id,
        confianzaClasificacion: 100,
        requiereRevision: false,
        origenClasificacion: "manual",
        estado: LineaEstado.CLASIFICADA,
      });
      return true;
    }

    const diff = analisisPost.totales.diferencia;
    if (Math.abs(diff) > tolerancia) {
      ajusteCreado = await crearAjuste(
        "3.9",
        diff,
        "Ajuste de cuadratura (reconciliación automática)"
      );
    }

    if (analisisPost.testigoRecomendado) {
      const target = analisisPost.testigoRecomendado.totalActivo;
      const deltaTestigo = target - analisisPost.totales.activo;
      if (Math.abs(deltaTestigo) > tolerancia) {
        const a1 = await crearAjuste(
          "1.9",
          deltaTestigo,
          "Ajuste imputación genérica activo (testigo PDF)"
        );
        const a2 = await crearAjuste(
          "3.9",
          deltaTestigo,
          "Ajuste imputación genérica patrimonio (testigo PDF)"
        );
        ajusteCreado = ajusteCreado || a1 || a2;
      }
    }
  }

  const analisisFinal = await analizarBalanceCaso(casoId, paginas);

  return {
    analisis: analisisFinal,
    accionesAplicadas,
    lineasEliminadas,
    lineasExcluidas,
    lineasIncluidas,
    lineasReclasificadas,
    ajusteCreado,
    mensaje: analisisFinal.totales.cuadraturaOk
      ? "Balance cuadrado tras reconciliación."
      : `Reconciliación aplicada; diferencia residual ${analisisFinal.totales.diferencia.toLocaleString("es-AR")} ARS.`,
  };
}
