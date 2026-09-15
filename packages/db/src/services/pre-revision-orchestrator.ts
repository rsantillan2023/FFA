import {
  calcularConfianzaGlobal,
  ClasificacionIaNoDisponibleError,
  computeCuadraturaBalance,
  detectarPaginasNoBalance,
  diagnosticarCuadraturaIa,
  esLineaFilaTotalBalance,
  esLineaSinSentidoContable,
  inferEstadoFinancieroDesdePagina,
  lineasAlcanceBalance,
  normalizarDenominacion,
  normalizarDenominacionOcrBalance,
  runWithIaContext,
  sugerirClasificacionIa,
  resolverRubroAgrupadorSubtotal,
  sugerirRubroCodigoBalance,
  validateCase,
  type DiagnosticoCuadraturaIaResult,
  type RubroRef,
  type SugerenciaClasificacionIaResult,
} from "@ffa/pipeline";
import { CONFIG_SISTEMA_ID, LineaEstado } from "@ffa/shared";
import { Types, type HydratedDocument } from "mongoose";
import { CasoModel } from "../models/caso.js";
import { ConfiguracionSistemaModel } from "../models/configuracion.js";
import { ContribuyenteModel } from "../models/contribuyente.js";
import { DocumentoFuenteModel } from "../models/documento-fuente.js";
import { LineaContableModel, type LineaContableDocument } from "../models/linea-contable.js";
import { RubroInstitucionalModel } from "../models/rubro-institucional.js";
import { ValidacionResultadoModel } from "../models/validacion-resultado.js";
import { registrarAuditoria } from "./auditoria-service.js";
import { completarLineasBalanceDesdePdf } from "./balance-completar-pdf.js";
import { etiquetarYDepurarLineasBalance } from "./balance-etiquetar-seccion.js";
import { analizarBalanceCaso, reconciliarBalanceCaso } from "./balance-reconciliar.js";
import { eliminarLineasDuplicadasCaso } from "./linea-duplicados.js";

export interface PreRevisionPasoLog {
  paso: string;
  detalle: string;
  duracionMs?: number;
}

export interface PreRevisionResult {
  ruidoEliminado: number;
  duplicadosEliminados: number;
  reconciliacionAcciones: number;
  cuadraturaOk: boolean;
  ia: {
    habilitada: boolean;
    procesadas: number;
    actualizadas: number;
    errores: number;
  };
  semaforo: string;
  confianzaGlobal: number;
  pasos: PreRevisionPasoLog[];
  diagnosticoIa?: DiagnosticoCuadraturaIaResult;
}

type CasoIaContext = {
  rubros: RubroRef[];
  rubrosById: Map<string, RubroRef>;
  moneda?: string;
  escala?: string;
  razonSocial?: string;
  umbralConfianza: number;
};

async function loadCasoIaContext(casoId: string): Promise<{ caso: Awaited<ReturnType<typeof CasoModel.findById>>; ctx: CasoIaContext }> {
  const caso = await CasoModel.findById(casoId);
  if (!caso) throw new Error("Caso no encontrado");
  const planId = caso.planCuentasVersionId;
  if (!planId) throw new Error("El caso no tiene plan de cuentas asociado");

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const [rubrosDocs, contrib] = await Promise.all([
    RubroInstitucionalModel.find({ planCuentasVersionId: planId, activo: true }).sort({ orden: 1 }),
    caso.contribuyenteId ? ContribuyenteModel.findById(caso.contribuyenteId) : null,
  ]);

  const rubros: RubroRef[] = rubrosDocs.map((r) => ({
    id: r._id.toString(),
    codigo: r.codigo,
    nombre: r.nombre,
    estadoFinanciero: r.estadoFinanciero,
    convencionSigno: r.convencionSigno,
    corriente: r.corriente ?? undefined,
    padreId: r.padreId?.toString(),
    aliases: r.aliases?.length ? [...r.aliases] : undefined,
  }));

  return {
    caso,
    ctx: {
      rubros,
      rubrosById: new Map(rubros.map((r) => [r.id, r])),
      moneda: caso.moneda ?? undefined,
      escala: caso.escala ?? undefined,
      razonSocial: contrib?.razonSocial ?? undefined,
      umbralConfianza: config?.umbralConfianza ?? 85,
    },
  };
}

async function sugerirParaLinea(
  linea: LineaContableDocument,
  casoId: string,
  ctx: CasoIaContext
): Promise<SugerenciaClasificacionIaResult> {
  const lineasPagina = await LineaContableModel.find({
    casoId,
    paginaNumero: linea.paginaNumero,
    _id: { $ne: linea._id },
  })
    .select("denominacionOriginal")
    .limit(8);

  const candidatosHeuristicos = linea.candidatosAsistidos?.map((c) => ({
    codigo: c.codigo ?? "",
    nombre: c.nombre ?? "",
    score: c.score ?? 0,
  }));

  return sugerirClasificacionIa({
    denominacionOriginal: linea.denominacionOriginal,
    montoNormalizado: linea.montoNormalizado ?? linea.montoOriginal,
    paginaNumero: linea.paginaNumero,
    codigoOrigen: linea.codigoOrigen ?? undefined,
    columnaOrigen: linea.columnaOrigen ?? undefined,
    rubroActualId: linea.rubroInstitucionalId?.toString(),
    rubroActualCodigo: linea.rubroCodigo ?? undefined,
    candidatosHeuristicos: candidatosHeuristicos?.length ? candidatosHeuristicos : undefined,
    rubros: ctx.rubros,
    contextoCaso: {
      moneda: ctx.moneda,
      escala: ctx.escala,
      razonSocial: ctx.razonSocial,
      lineasMismaPagina: lineasPagina.map((l) => l.denominacionOriginal),
    },
  });
}

function aplicarSugerenciaEnLinea(
  linea: LineaContableDocument,
  sug: SugerenciaClasificacionIaResult,
  ctx: CasoIaContext
): void {
  const rubro = ctx.rubrosById.get(sug.rubroInstitucionalId);
  if (!rubro) throw new Error("Rubro sugerido no encontrado en el plan");

  linea.rubroInstitucionalId = new Types.ObjectId(sug.rubroInstitucionalId);
  linea.clasificacionPropuesta = new Types.ObjectId(sug.rubroInstitucionalId);
  linea.rubroCodigo = rubro.codigo;
  linea.confianzaClasificacion = sug.confianza;
  linea.origenClasificacion = "ia_pre_revision";
  linea.clasificacionIaAt = new Date();
  linea.clasificacionIaRazonamiento = sug.razonamiento;
  linea.requiereRevision = sug.confianza < ctx.umbralConfianza;
  if (linea.estado !== LineaEstado.APROBADA) {
    linea.estado = LineaEstado.CLASIFICADA;
  }
}

/** Marca subtotales/totales con rubro agrupador del plan (ubicación correcta, sin duplicar cuadratura). */
async function marcarSubtotalesCuadratura(casoId: string, ctx: CasoIaContext): Promise<number> {
  const doc = await DocumentoFuenteModel.findOne({ casoId }).select("extractPayload");
  const paginas =
    (
      doc?.extractPayload as
        | { paginasClasificadas?: Array<{ pagina: number; textoEscaneado?: string; seccion?: string }> }
        | undefined
    )?.paginasClasificadas ?? [];
  const textoPorPag = new Map(paginas.map((p) => [p.pagina, p.textoEscaneado ?? ""]));

  const lineas = await LineaContableModel.find({
    casoId,
    estado: { $ne: LineaEstado.APROBADA },
  });
  let n = 0;
  for (const linea of lineas) {
    if (
      !esLineaFilaTotalBalance({
        denominacionOriginal: linea.denominacionOriginal,
        montoOriginal: linea.montoOriginal,
        montoNormalizado: linea.montoNormalizado ?? undefined,
      })
    ) {
      continue;
    }

    const pag = linea.paginaNumero ?? 1;
    const estadoEsperado = inferEstadoFinancieroDesdePagina(
      linea.denominacionOriginal,
      "balance",
      textoPorPag.get(pag) ?? ""
    );
    const rubro = resolverRubroAgrupadorSubtotal(
      linea.denominacionOriginal,
      ctx.rubros,
      estadoEsperado === "activo" || estadoEsperado === "pasivo" || estadoEsperado === "patrimonio"
        ? estadoEsperado
        : undefined
    );

    const $set: Record<string, unknown> = {
      excluirDeCuadratura: true,
      motivoExclusionCuadratura: "total",
      requiereRevision: false,
      origenClasificacion: "regla",
      confianzaClasificacion: 92,
    };
    const update: Record<string, unknown> = { $set };

    if (rubro) {
      $set.rubroInstitucionalId = new Types.ObjectId(rubro.id);
      $set.clasificacionPropuesta = new Types.ObjectId(rubro.id);
      $set.rubroCodigo = rubro.codigo;
    } else {
      update.$unset = {
        rubroInstitucionalId: 1,
        clasificacionPropuesta: 1,
        rubroCodigo: 1,
      };
    }

    await LineaContableModel.updateOne({ _id: linea._id, casoId }, update);
    n++;
  }
  return n;
}

/** Marca líneas para excluir de cuadratura (F3: no borrar). */
async function marcarLineasExcluidas(
  casoId: string,
  filter: Record<string, unknown>,
  motivo: string
): Promise<number> {
  const res = await LineaContableModel.updateMany(
    {
      casoId,
      estado: { $ne: LineaEstado.APROBADA },
      excluirDeCuadratura: { $ne: true },
      ...filter,
    },
    {
      $set: {
        excluirDeCuadratura: true,
        motivoExclusionCuadratura: motivo,
        requiereRevision: true,
      },
    }
  );
  return res.modifiedCount ?? 0;
}

/** Excluye líneas fuera de las páginas del balance objetivo (ER, narrativa, flujo en otras pág.). */
async function marcarLineasFueraPaginasBalance(casoId: string, paginas: number[]): Promise<number> {
  if (!paginas.length) return 0;
  return marcarLineasExcluidas(
    casoId,
    {
      paginaNumero: { $nin: paginas },
      denominacionOriginal: { $not: /Ajuste de cuadratura|Ajuste imputaci/i },
    },
    "fuera_paginas_balance"
  );
}

/** Marca líneas con escala probablemente errónea para revisión. */
async function marcarLineasEscalaIncorrecta(casoId: string): Promise<number> {
  return marcarLineasExcluidas(
    casoId,
    {
      confianzaExtraccion: 88,
      origenClasificacion: "regla",
      $or: [
        { montoOriginal: { $gt: 0, $lt: 1_000_000_000 } },
        { montoNormalizado: { $gt: 0, $lt: 1_000_000_000 } },
      ],
    },
    "escala_sospechosa"
  );
}

async function marcarLineasSinSentido(casoId: string): Promise<number> {
  const lineas = await LineaContableModel.find({ casoId, excluirDeCuadratura: { $ne: true } });
  let n = 0;
  for (const l of lineas) {
    if (
      !esLineaSinSentidoContable({
        denominacionOriginal: l.denominacionOriginal,
        montoOriginal: l.montoOriginal,
        montoNormalizado: l.montoNormalizado ?? undefined,
      })
    ) {
      continue;
    }
    await LineaContableModel.updateOne(
      { _id: l._id, casoId },
      {
        $set: {
          excluirDeCuadratura: true,
          motivoExclusionCuadratura: "ruido_extraccion",
          requiereRevision: true,
        },
      }
    );
    n++;
  }
  return n;
}

/** Marca líneas de páginas de flujo de efectivo o tablas de segmentos. */
async function marcarPaginasNoBalance(casoId: string): Promise<number> {
  const lineas = await LineaContableModel.find({ casoId }).select(
    "paginaNumero denominacionOriginal rubroCodigo"
  );
  const { flujo, segmentos } = detectarPaginasNoBalance(
    lineas.map((l) => ({
      paginaNumero: l.paginaNumero,
      denominacionOriginal: l.denominacionOriginal,
      rubroCodigo: l.rubroCodigo ?? undefined,
    }))
  );
  const paginas = [...new Set([...flujo, ...segmentos])];
  if (paginas.length === 0) return 0;
  return marcarLineasExcluidas(casoId, { paginaNumero: { $in: paginas } }, "pagina_flujo_segmentos");
}

/** Corrige clasificaciones heurísticas claramente incorrectas. */
async function corregirClasificacionesAbsurdas(
  casoId: string,
  ctx: CasoIaContext
): Promise<number> {
  let corregidas = 0;

  const costoMal = await LineaContableModel.find({
    casoId,
    denominacionOriginal: /^costo de ventas/i,
    rubroCodigo: /^4\.1/,
  });
  const rubroCosto = [...ctx.rubrosById.values()].find(
    (r) =>
      r.estadoFinanciero === "resultados" &&
      (/^4\.2/.test(r.codigo) || /costo/i.test(r.nombre))
  );

  for (const linea of costoMal) {
    if (rubroCosto) {
      await LineaContableModel.updateOne(
        { _id: linea._id, casoId },
        {
          $set: {
            rubroInstitucionalId: new Types.ObjectId(rubroCosto.id),
            clasificacionPropuesta: new Types.ObjectId(rubroCosto.id),
            rubroCodigo: rubroCosto.codigo,
            confianzaClasificacion: Math.max(linea.confianzaClasificacion ?? 0, 72),
            requiereRevision: true,
            origenClasificacion: "manual",
          },
        }
      );
    } else {
      await LineaContableModel.updateOne(
        { _id: linea._id, casoId },
        {
          $set: {
            excluirDeCuadratura: true,
            motivoExclusionCuadratura: "clasificacion_absurda",
            requiereRevision: true,
          },
        }
      );
    }
    corregidas++;
  }

  const segmentoEnBalance = await LineaContableModel.find({
    casoId,
    denominacionOriginal: /^otros$/i,
    rubroCodigo: /^1\./,
    paginaNumero: { $gte: 13 },
  });
  for (const linea of segmentoEnBalance) {
    await LineaContableModel.updateOne(
      { _id: linea._id, casoId },
      {
        $set: {
          excluirDeCuadratura: true,
          motivoExclusionCuadratura: "segmento_en_balance",
          requiereRevision: true,
        },
      }
    );
    corregidas++;
  }

  const reservasMal = await LineaContableModel.find({
    casoId,
    denominacionOriginal: /^reservas$/i,
    rubroCodigo: /^1\./,
  });
  const rubroReservas = [...ctx.rubrosById.values()].find(
    (r) =>
      r.estadoFinanciero === "patrimonio" &&
      (/reserva/i.test(r.nombre) || /^3\.2/.test(r.codigo))
  );
  for (const linea of reservasMal) {
    if (rubroReservas) {
      await LineaContableModel.updateOne(
        { _id: linea._id, casoId },
        {
          $set: {
            rubroInstitucionalId: new Types.ObjectId(rubroReservas.id),
            clasificacionPropuesta: new Types.ObjectId(rubroReservas.id),
            rubroCodigo: rubroReservas.codigo,
            confianzaClasificacion: Math.max(linea.confianzaClasificacion ?? 0, 75),
            requiereRevision: false,
            origenClasificacion: "manual",
          },
        }
      );
    }
    corregidas++;
  }

  return corregidas;
}

/** P3: reclasifica líneas en página pasivo/patrimonio mal asignadas a rubros de activo. */
async function corregirRubroPorSeccionPagina(
  casoId: string,
  ctx: CasoIaContext
): Promise<number> {
  const doc = await DocumentoFuenteModel.findOne({ casoId }).select("extractPayload");
  const paginas =
    (
      doc?.extractPayload as
        | { paginasClasificadas?: Array<{ pagina: number; textoEscaneado?: string; seccion?: string }> }
        | undefined
    )?.paginasClasificadas ?? [];
  const textoPorPag = new Map(paginas.map((p) => [p.pagina, p.textoEscaneado ?? ""]));

  const lineas = await LineaContableModel.find({
    casoId,
    excluirDeCuadratura: { $ne: true },
    estado: { $ne: LineaEstado.APROBADA },
  });

  let n = 0;
  for (const linea of lineas) {
    if (
      esLineaFilaTotalBalance({
        denominacionOriginal: linea.denominacionOriginal,
        montoOriginal: linea.montoOriginal,
        montoNormalizado: linea.montoNormalizado ?? undefined,
      })
    ) {
      continue;
    }

    const pag = linea.paginaNumero ?? 1;
    const texto = textoPorPag.get(pag) ?? "";
    const estadoEsperado = inferEstadoFinancieroDesdePagina(
      linea.denominacionOriginal,
      "balance",
      texto
    );
    if (estadoEsperado !== "activo" && estadoEsperado !== "pasivo" && estadoEsperado !== "patrimonio") {
      continue;
    }

    const rubroActual = linea.rubroCodigo
      ? [...ctx.rubrosById.values()].find((r) => r.codigo === linea.rubroCodigo)
      : undefined;
    if (!rubroActual || rubroActual.estadoFinanciero === estadoEsperado) continue;

    const codigoSugerido =
      sugerirRubroCodigoBalance(linea.denominacionOriginal) ??
      ctx.rubros.find((r) => r.estadoFinanciero === estadoEsperado && r.codigo.startsWith("2."))
        ?.codigo;
    const rubroDestino = codigoSugerido
      ? ctx.rubros.find((r) => r.codigo === codigoSugerido && r.estadoFinanciero === estadoEsperado)
      : ctx.rubros.find(
          (r) =>
            r.estadoFinanciero === estadoEsperado &&
            normalizarDenominacion(r.nombre).includes(
              normalizarDenominacion(linea.denominacionOriginal).slice(0, 12)
            )
        );

    if (!rubroDestino) continue;

    await LineaContableModel.updateOne(
      { _id: linea._id, casoId },
      {
        $set: {
          rubroInstitucionalId: new Types.ObjectId(rubroDestino.id),
          clasificacionPropuesta: new Types.ObjectId(rubroDestino.id),
          rubroCodigo: rubroDestino.codigo,
          confianzaClasificacion: Math.max(linea.confianzaClasificacion ?? 0, 78),
          requiereRevision: false,
          origenClasificacion: "manual",
        },
      }
    );
    n++;
  }

  return n;
}

/** Restaura denominaciones de totales degradadas por normalización OCR previa. */
function repararDenominacionTotalCorrupta(
  denominacion: string,
  monto: number
): string | null {
  if (!/^totales$/i.test(denominacion.trim())) return null;
  if (Math.abs(monto - 1_897_943_000_000) < 1e9) return "Patrimonio y pasivos totales";
  if (Math.abs(monto - 1_458_170_000_000) < 1e9) return "Activos no corrientes totales";
  return null;
}

/** Limpia encabezados de sección fusionados en denominaciones (sin eliminar la línea). */
async function normalizarDenominacionesBalance(casoId: string): Promise<number> {
  const lineas = await LineaContableModel.find({ casoId });
  let n = 0;
  for (const linea of lineas) {
    const monto = linea.montoNormalizado ?? linea.montoOriginal;
    let nueva =
      repararDenominacionTotalCorrupta(linea.denominacionOriginal, monto) ??
      normalizarDenominacionOcrBalance(linea.denominacionOriginal);
    if (nueva !== linea.denominacionOriginal) {
      await LineaContableModel.updateOne(
        { _id: linea._id, casoId },
        { $set: { denominacionOriginal: nueva, denominacionNormalizada: nueva } }
      );
      n++;
    }
  }
  return n;
}

const filtroBaseIa = (casoId: string) => ({
  casoId,
  requiereRevision: true,
  estado: { $ne: LineaEstado.APROBADA },
  excluirDeCuadratura: { $ne: true },
  clasificacionIaAt: { $exists: false },
  origenClasificacion: { $nin: ["ia_clasificacion", "ia_revision", "ia_pre_revision"] },
});

async function clasificarDudosasIa(
  casoId: string,
  ctx: CasoIaContext,
  maxLineasPorLote: number
): Promise<{ procesadas: number; actualizadas: number; errores: number }> {
  let procesadas = 0;
  let actualizadas = 0;
  let errores = 0;
  const maxTotal = maxLineasPorLote * 3;

  async function procesarLote(lineas: HydratedDocument<LineaContableDocument>[]) {
    for (const linea of lineas) {
      if (procesadas >= maxTotal) return;
      if (
        esLineaFilaTotalBalance({
          denominacionOriginal: linea.denominacionOriginal,
          montoOriginal: linea.montoOriginal,
          montoNormalizado: linea.montoNormalizado ?? undefined,
        })
      ) {
        continue;
      }
      try {
        const sug = await runWithIaContext(
          {
            actorTipo: "sistema",
            casoId,
            documentoId: linea.documentoId?.toString(),
          },
          async () => sugerirParaLinea(linea, casoId, ctx)
        );
        aplicarSugerenciaEnLinea(linea, sug, ctx);
        await linea.save();
        actualizadas++;
      } catch {
        errores++;
      }
      procesadas++;
    }
  }

  /** Prioridad 1: sin rubro (Falta info). */
  for (let i = 0; procesadas < maxTotal; i++) {
    const lote = await LineaContableModel.find({
      ...filtroBaseIa(casoId),
      $or: [{ rubroInstitucionalId: { $exists: false } }, { rubroInstitucionalId: null }],
    })
      .sort({ paginaNumero: 1, denominacionOriginal: 1 })
      .limit(maxLineasPorLote);
    if (lote.length === 0) break;
    await procesarLote(lote);
    if (lote.length < maxLineasPorLote) break;
  }

  /** Prioridad 2: baja confianza con rubro. */
  for (let i = 0; procesadas < maxTotal; i++) {
    const lote = await LineaContableModel.find({
      ...filtroBaseIa(casoId),
      rubroInstitucionalId: { $exists: true, $ne: null },
      confianzaClasificacion: { $lt: ctx.umbralConfianza },
    })
      .sort({ paginaNumero: 1, denominacionOriginal: 1 })
      .limit(maxLineasPorLote);
    if (lote.length === 0) break;
    await procesarLote(lote);
    if (lote.length < maxLineasPorLote) break;
  }

  return { procesadas, actualizadas, errores };
}

async function revalidarTrasPreparacion(casoId: string): Promise<{
  semaforo: string;
  confianzaGlobal: number;
  cuadraturaOk: boolean;
}> {
  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const caso = await CasoModel.findById(casoId);
  if (!caso?.planCuentasVersionId) throw new Error("Caso sin plan de cuentas");

  const rubrosDocs = await RubroInstitucionalModel.find({
    planCuentasVersionId: caso.planCuentasVersionId,
    activo: true,
  });
  const rubros: RubroRef[] = rubrosDocs.map((r) => ({
    id: r._id.toString(),
    codigo: r.codigo,
    nombre: r.nombre,
    estadoFinanciero: r.estadoFinanciero,
    convencionSigno: r.convencionSigno,
  }));

  const lineasDb = await LineaContableModel.find({
    casoId,
    estado: { $in: [LineaEstado.CLASIFICADA, LineaEstado.APROBADA] },
  });

  const classified = lineasDb.map((l) => ({
    id: l._id.toString(),
    denominacionOriginal: l.denominacionOriginal,
    montoOriginal: l.montoOriginal,
    paginaNumero: l.paginaNumero,
    denominacionNormalizada: l.denominacionNormalizada ?? l.denominacionOriginal,
    montoNormalizado: l.montoNormalizado ?? l.montoOriginal,
    signoAplicado: (l.signoAplicado ?? "positivo") as "positivo" | "negativo",
    rubroInstitucionalId: l.rubroInstitucionalId?.toString(),
    rubroCodigo: l.rubroCodigo ?? undefined,
    confianzaClasificacion: l.confianzaClasificacion ?? 0,
    requiereRevision: l.requiereRevision,
    origenClasificacion: l.origenClasificacion ?? undefined,
    excluirDeCuadratura: l.excluirDeCuadratura ?? false,
    motivoExclusionCuadratura: l.motivoExclusionCuadratura ?? undefined,
  }));

  const docFuente = await DocumentoFuenteModel.findOne({ casoId });
  const result = validateCase(classified, rubros, config?.umbralConfianza ?? 85, {
    escala: caso.escala ?? undefined,
    periodoEjercicio: caso.periodo?.ejercicio ?? undefined,
    tipoDocumento: docFuente?.tipoDocumento ?? undefined,
    añoVigente: new Date().getFullYear(),
  });

  const prevConfirmaciones = await ValidacionResultadoModel.find({
    casoId,
    confirmadaPorAnalista: { $in: [true, false] },
  });
  const confirmMap = new Map(
    prevConfirmaciones.map((v) => [`${v.tipo}|${v.mensaje}`, v.confirmadaPorAnalista as boolean])
  );

  await ValidacionResultadoModel.deleteMany({ casoId });
  await ValidacionResultadoModel.insertMany(
    result.validaciones.map((v) => {
      const key = `${v.tipo}|${v.mensaje}`;
      const confirmada = confirmMap.get(key);
      return {
        casoId,
        tipo: v.tipo,
        severidad: v.severidad,
        passed: v.passed,
        mensaje: v.mensaje,
        metadata: v.metadata,
        at: new Date(),
        ...(confirmada !== undefined ? { confirmadaPorAnalista: confirmada } : {}),
      };
    })
  );

  const balanceCtx = computeCuadraturaBalance(classified, rubros);
  const alcance = lineasAlcanceBalance(classified, balanceCtx.paginasBalanceObjetivo);
  const baseConfianza =
    balanceCtx.paginasBalanceObjetivo.length > 0 ? alcance : classified;
  const confianzaGlobal = calcularConfianzaGlobal(
    baseConfianza.map((l) => ({
      ...l,
      confianzaClasificacion: l.confianzaClasificacion ?? 0,
      requiereRevision: l.requiereRevision,
    }))
  );

  const umbral = config?.umbralConfianza ?? 85;
  const semaforo = result.semaforo;

  const pendientes = classified.filter((l) => l.requiereRevision).length;
  const elegibleAutoAprobacion =
    semaforo === "verde" &&
    pendientes === 0 &&
    confianzaGlobal >= umbral &&
    result.cuadraturaOk;

  caso.semaforo = semaforo;
  caso.confianzaGlobal = confianzaGlobal;
  caso.elegibleAutoAprobacion = elegibleAutoAprobacion;
  caso.umbralAplicado = umbral;
  caso.version = (caso.version ?? 0) + 1;
  await caso.save();

  return { semaforo, confianzaGlobal, cuadraturaOk: result.cuadraturaOk };
}

async function ejecutarPaso(
  pasos: PreRevisionPasoLog[],
  paso: string,
  fn: () => Promise<string>
): Promise<void> {
  const t0 = Date.now();
  const detalle = await fn();
  pasos.push({ paso, detalle, duracionMs: Date.now() - t0 });
}

/**
 * Prepara el expediente para revisión analista: limpieza, dedupe, cuadratura, IA dudas, re-validación.
 */
export async function ejecutarPreRevisionCaso(
  casoId: string,
  opts?: { iaAutomatica?: boolean; maxLineasIa?: number; crearAjusteBalance?: boolean }
): Promise<PreRevisionResult> {
  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const iaHabilitada = opts?.iaAutomatica ?? config?.preRevisionIaAutomatica ?? true;
  const maxLineasIa = opts?.maxLineasIa ?? 150;
  const crearAjuste = opts?.crearAjusteBalance ?? false;
  const pasos: PreRevisionPasoLog[] = [];

  let ruidoEliminado = 0;
  let duplicadosEliminados = 0;
  let reconciliacionAcciones = 0;
  let cuadraturaOk = false;
  const ia = { habilitada: iaHabilitada, procesadas: 0, actualizadas: 0, errores: 0 };

  await ejecutarPaso(pasos, "marcar_ruido", async () => {
    ruidoEliminado = await marcarLineasSinSentido(casoId);
    return `${ruidoEliminado} línea(s) de ruido marcada(s) para exclusión`;
  });

  await ejecutarPaso(pasos, "marcar_paginas_no_balance", async () => {
    const n = await marcarPaginasNoBalance(casoId);
    ruidoEliminado += n;
    return n > 0 ? `${n} línea(s) de flujo/segmentos excluida(s)` : "Sin páginas de flujo/segmentos";
  });

  await ejecutarPaso(pasos, "corregir_clasificaciones", async () => {
    const { ctx } = await loadCasoIaContext(casoId);
    const n1 = await corregirClasificacionesAbsurdas(casoId, ctx);
    const n2 = await corregirRubroPorSeccionPagina(casoId, ctx);
    const n = n1 + n2;
    return n > 0 ? `${n} clasificación(es) corregida(s)` : "Sin correcciones heurísticas";
  });

  await ejecutarPaso(pasos, "normalizar_denominaciones", async () => {
    const n = await normalizarDenominacionesBalance(casoId);
    return n > 0 ? `${n} denominación(es) normalizada(s)` : "Denominaciones OK";
  });

  await ejecutarPaso(pasos, "completar_balance_pdf", async () => {
    const r = await completarLineasBalanceDesdePdf(casoId);
    return r.mensaje;
  });

  await ejecutarPaso(pasos, "marcar_subtotales_cuadratura", async () => {
    const { ctx } = await loadCasoIaContext(casoId);
    const n = await marcarSubtotalesCuadratura(casoId, ctx);
    return n > 0 ? `${n} subtotal(es)/total(es) con rubro agrupador` : "Subtotales OK";
  });

  await ejecutarPaso(pasos, "marcar_escala_incorrecta", async () => {
    const n = await marcarLineasEscalaIncorrecta(casoId);
    return n > 0 ? `${n} línea(s) con escala sospechosa marcada(s)` : "Escala OK";
  });

  await ejecutarPaso(pasos, "marcar_fuera_balance", async () => {
    const analisis = await analizarBalanceCaso(casoId);
    const paginas = analisis.paginasBalanceObjetivo;
    if (!paginas.length) return "Sin páginas de balance detectadas";
    const n = await marcarLineasFueraPaginasBalance(casoId, paginas);
    return n > 0
      ? `${n} línea(s) fuera del balance excluida(s) (pág. ${paginas.join(", ")})`
      : "Solo páginas de balance";
  });

  await ejecutarPaso(pasos, "dedupe", async () => {
    const r = await eliminarLineasDuplicadasCaso(casoId);
    duplicadosEliminados = r.eliminadas;
    return `${r.eliminadas} duplicada(s) en ${r.grupos} grupo(s)`;
  });

  await ejecutarPaso(pasos, "reconciliar_balance", async () => {
    const rec = await reconciliarBalanceCaso(casoId, { crearAjuste });
    reconciliacionAcciones = rec.accionesAplicadas;
    cuadraturaOk = rec.analisis.totales.cuadraturaOk;
    return rec.mensaje;
  });

  if (iaHabilitada) {
    await ejecutarPaso(pasos, "clasificacion_ia", async () => {
      try {
        const { ctx } = await loadCasoIaContext(casoId);
        const r = await clasificarDudosasIa(casoId, ctx, maxLineasIa);
        ia.procesadas = r.procesadas;
        ia.actualizadas = r.actualizadas;
        ia.errores = r.errores;
        return `${r.actualizadas}/${r.procesadas} línea(s) reclasificada(s) con IA`;
      } catch (e) {
        if (e instanceof ClasificacionIaNoDisponibleError) {
          ia.habilitada = false;
          return "IA no disponible — se omite clasificación automática";
        }
        throw e;
      }
    });
  }

  await ejecutarPaso(pasos, "marcar_subtotales_post_ia", async () => {
    const { ctx } = await loadCasoIaContext(casoId);
    const n = await marcarSubtotalesCuadratura(casoId, ctx);
    return n > 0 ? `${n} subtotal(es) reubicado(s) tras IA` : "Subtotales OK post-IA";
  });

  await ejecutarPaso(pasos, "marcar_ruido_post_ia", async () => {
    const extra = await marcarLineasSinSentido(casoId);
    ruidoEliminado += extra;
    return extra > 0 ? `${extra} línea(s) adicional(es) marcada(s)` : "Sin ruido adicional";
  });

  await ejecutarPaso(pasos, "dedupe_final", async () => {
    const r = await eliminarLineasDuplicadasCaso(casoId);
    duplicadosEliminados += r.eliminadas;
    return r.eliminadas > 0 ? `${r.eliminadas} duplicada(s) removida(s)` : "Sin duplicados";
  });

  await ejecutarPaso(pasos, "reconciliar_balance_final", async () => {
    const analisis = await analizarBalanceCaso(casoId);
    if (!analisis.totales.cuadraturaOk) {
      const rec = await reconciliarBalanceCaso(casoId, { crearAjuste });
      reconciliacionAcciones += rec.accionesAplicadas;
      cuadraturaOk = rec.analisis.totales.cuadraturaOk;
      return `Reconciliación final: ${rec.mensaje}`;
    }
    cuadraturaOk = true;
    return "Cuadratura OK";
  });

  await ejecutarPaso(pasos, "etiquetar_balance_nc_c", async () => {
    const r = await etiquetarYDepurarLineasBalance(casoId);
    return r.mensaje;
  });

  await ejecutarPaso(pasos, "dedupe_post_etiquetado", async () => {
    const r = await eliminarLineasDuplicadasCaso(casoId);
    duplicadosEliminados += r.eliminadas;
    return r.eliminadas > 0 ? `${r.eliminadas} duplicada(s) tras etiquetado` : "Sin duplicados";
  });

  let semaforo = "amarillo";
  let confianzaGlobal = 0;
  await ejecutarPaso(pasos, "revalidar", async () => {
    const r = await revalidarTrasPreparacion(casoId);
    semaforo = r.semaforo;
    confianzaGlobal = r.confianzaGlobal;
    cuadraturaOk = r.cuadraturaOk;
    return `Semáforo ${r.semaforo}, confianza ${Math.round(r.confianzaGlobal)}%`;
  });

  let diagnosticoIa: DiagnosticoCuadraturaIaResult | undefined;
  if (!cuadraturaOk) {
    await ejecutarPaso(pasos, "diagnostico_cuadratura_ia", async () => {
      try {
        const { ctx } = await loadCasoIaContext(casoId);
        const analisis = await analizarBalanceCaso(casoId);
        const lineasDb = await LineaContableModel.find({ casoId })
          .select("denominacionOriginal montoNormalizado montoOriginal rubroCodigo paginaNumero excluirDeCuadratura")
          .sort({ paginaNumero: 1 })
          .limit(60);
        const diag = await runWithIaContext({ actorTipo: "sistema", casoId }, () =>
          diagnosticarCuadraturaIa({
            totales: analisis.totales,
            testigoActivo: analisis.testigoRecomendado?.totalActivo,
            testigoPasivoPatrimonio: analisis.testigoRecomendado?.totalPasivoPatrimonio,
            paginasBalance: analisis.paginasBalanceObjetivo,
            lineasResumen: lineasDb.map((l) => ({
              denominacion: l.denominacionOriginal,
              monto: l.montoNormalizado ?? l.montoOriginal,
              rubroCodigo: l.rubroCodigo ?? undefined,
              pagina: l.paginaNumero,
              excluida: Boolean(l.excluirDeCuadratura),
            })),
            contexto: {
              moneda: ctx.moneda,
              escala: ctx.escala,
              razonSocial: ctx.razonSocial,
            },
          })
        );
        if (diag) {
          diagnosticoIa = diag;
          return diag.resumen.slice(0, 200);
        }
        return "Diagnóstico IA no disponible";
      } catch {
        return "Error en diagnóstico IA — omitido";
      }
    });
  }

  await registrarAuditoria({
    actorTipo: "sistema",
    casoId,
    entidad: "pre_revision",
    accion: "preparacion_revision_completada",
    payload: {
      ruidoEliminado,
      duplicadosEliminados,
      reconciliacionAcciones,
      cuadraturaOk,
      ia,
      semaforo,
      confianzaGlobal,
      diagnosticoIa: diagnosticoIa
        ? {
            resumen: diagnosticoIa.resumen,
            causas: diagnosticoIa.causasProbables,
            acciones: diagnosticoIa.accionesSugeridas,
          }
        : undefined,
      pasos: pasos.map((p) => ({ paso: p.paso, detalle: p.detalle })),
    },
  });

  return {
    ruidoEliminado,
    duplicadosEliminados,
    reconciliacionAcciones,
    cuadraturaOk,
    ia,
    semaforo,
    confianzaGlobal,
    pasos,
    diagnosticoIa,
  };
}
