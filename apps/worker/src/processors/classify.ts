import {
  CasoModel,
  ConfiguracionSistemaModel,
  ContribuyenteModel,
  CriterioAprobadoModel,
  LineaContableModel,
  ReglasClasificacionVersionModel,
  RubroInstitucionalModel,
  registrarAuditoria,
  transicionarCaso,
} from "@ffa/db";
import {
  calcularConfianzaGlobal,
  classifyLinesWithIa,
  type RubroRef,
} from "@ffa/pipeline";
import type { ClassifyJobData } from "@ffa/queue";
import { CONFIG_SISTEMA_ID, CasoEstado, LineaEstado } from "@ffa/shared";
import type { Job } from "bullmq";
import { Types } from "mongoose";
import { skipSiPipelineObsoleto } from "../lib/pipeline-run.js";
import { assertCasoNoPausado } from "../lib/pausa.js";
import { enqueueValidate } from "../lib/enqueue.js";
import { actualizarProgresoCaso } from "../lib/progreso.js";

export async function processClassify(job: Job<ClassifyJobData>): Promise<void> {
  const { casoId } = job.data;
  await assertCasoNoPausado(casoId);
  if (await skipSiPipelineObsoleto(casoId, job.data.runId, (m) => job.log(m))) return;

  await transicionarCaso(casoId, CasoEstado.CLASIFICANDO, { nota: `Job ${job.id}` });
  await actualizarProgresoCaso(casoId, "classify");

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  if (!config?.planCuentasVigenteId) {
    throw new Error("No hay plan de cuentas vigente — ejecute seed");
  }

  const rubrosDocs = await RubroInstitucionalModel.find({
    planCuentasVersionId: config.planCuentasVigenteId,
    activo: true,
  });
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

  let reglas: { id: string; prioridad: number; tipo: "patron_denominacion" | "codigo_origen" | "regex" | "contribuyente"; patron: string; rubroInstitucionalId: string; activa: boolean }[] = [];
  if (config.reglasVigenteId) {
    const reglasDoc = await ReglasClasificacionVersionModel.findById(config.reglasVigenteId);
    reglas = (reglasDoc?.reglas ?? []).map((r) => ({
      id: r.id,
      prioridad: r.prioridad,
      tipo: r.tipo,
      patron: r.patron,
      rubroInstitucionalId: r.rubroInstitucionalId.toString(),
      activa: r.activa,
    }));
  }

  const caso = await CasoModel.findById(casoId);
  let criterios: { id: string; denominacionOrigen: string; rubroInstitucionalId: string }[] = [];
  if (caso?.contribuyenteId) {
    const critDocs = await CriterioAprobadoModel.find({
      contribuyenteId: caso.contribuyenteId,
      activo: true,
    });
    criterios = critDocs.map((c) => ({
      id: c._id.toString(),
      denominacionOrigen: c.denominacionOrigen,
      rubroInstitucionalId: c.rubroInstitucionalId.toString(),
    }));
  }

  const lineasDb = await LineaContableModel.find({ casoId, estado: LineaEstado.NORMALIZADA });
  const normalized = lineasDb.map((l) => ({
    denominacionOriginal: l.denominacionOriginal,
    codigoOrigen: l.codigoOrigen ?? undefined,
    columnaOrigen: l.columnaOrigen ?? undefined,
    montoOriginal: l.montoOriginal,
    paginaNumero: l.paginaNumero,
    confianzaExtraccion: l.confianzaExtraccion ?? undefined,
    denominacionNormalizada: l.denominacionNormalizada ?? l.denominacionOriginal,
    montoNormalizado: l.montoNormalizado ?? l.montoOriginal,
    signoAplicado: (l.signoAplicado ?? "positivo") as "positivo" | "negativo",
  }));

  let razonSocial: string | undefined;
  if (caso?.contribuyenteId) {
    const contrib = await ContribuyenteModel.findById(caso.contribuyenteId).select("razonSocial").lean();
    razonSocial = contrib?.razonSocial ?? undefined;
  }

  const classified = await classifyLinesWithIa({
    lineas: normalized,
    rubros,
    reglas,
    criterios,
    umbralConfianza: config.umbralConfianza,
    contextoCaso: {
      moneda: caso?.moneda ?? undefined,
      escala: caso?.escala ?? undefined,
      razonSocial,
    },
  });

  const iaCount = classified.filter((c) => c.origenClasificacion === "ia_clasificacion").length;
  const semCount = classified.filter((c) =>
    ["semantica", "asistida"].includes(c.origenClasificacion ?? "")
  ).length;
  if (iaCount > 0 || semCount > 0) {
    job.log(`Clasificación: ia=${iaCount} semántica_fallback=${semCount}`);
  }

  for (let i = 0; i < lineasDb.length; i++) {
    const c = classified[i];
    if (c.rubroInstitucionalId) {
      lineasDb[i].rubroInstitucionalId = new Types.ObjectId(c.rubroInstitucionalId);
      lineasDb[i].clasificacionPropuesta = lineasDb[i].rubroInstitucionalId;
      lineasDb[i].rubroCodigo = c.rubroCodigo;
    } else {
      lineasDb[i].rubroInstitucionalId = undefined;
      lineasDb[i].clasificacionPropuesta = undefined;
      lineasDb[i].rubroCodigo = undefined;
    }
    lineasDb[i].confianzaClasificacion = c.confianzaClasificacion;
    lineasDb[i].requiereRevision = c.requiereRevision;
    lineasDb[i].origenClasificacion = c.origenClasificacion;
    if (c.excluirDeCuadratura != null) {
      lineasDb[i].excluirDeCuadratura = c.excluirDeCuadratura;
    }
    if (c.motivoExclusionCuadratura != null) {
      lineasDb[i].motivoExclusionCuadratura = c.motivoExclusionCuadratura;
    }
    if (c.origenClasificacion === "ia_clasificacion") {
      lineasDb[i].clasificacionIaAt = new Date();
      if (c.clasificacionIaRazonamiento) {
        lineasDb[i].clasificacionIaRazonamiento = c.clasificacionIaRazonamiento;
      }
    }
    if (c.candidatosAsistidos?.length) {
      lineasDb[i].set(
        "candidatosAsistidos",
        c.candidatosAsistidos.map((ca) => ({
          rubroInstitucionalId: new Types.ObjectId(ca.rubroInstitucionalId),
          codigo: ca.codigo,
          nombre: ca.nombre,
          score: ca.score,
        }))
      );
    }
    lineasDb[i].estado = LineaEstado.CLASIFICADA;
    await lineasDb[i].save();
  }

  const confianzaGlobal = calcularConfianzaGlobal(classified);
  await CasoModel.findByIdAndUpdate(casoId, {
    confianzaGlobal,
    umbralAplicado: config.umbralConfianza,
    planCuentasVersionId: config.planCuentasVigenteId,
    reglasVersionId: config.reglasVigenteId,
  });

  await registrarAuditoria({
    actorTipo: "sistema",
    casoId,
    entidad: "lineas_contables",
    accion: "clasificacion_completada",
    payload: { confianzaGlobal, lineasCount: classified.length },
    configSnapshot: {
      planCuentasVersionId: config.planCuentasVigenteId.toString(),
      reglasVersionId: config.reglasVigenteId?.toString(),
      umbral: config.umbralConfianza,
    },
  });

  await enqueueValidate(casoId, job.data.runId);
  job.log(`Classify OK confianza=${confianzaGlobal}% → validate`);
}
