import {
  CasoModel,
  ConfiguracionSistemaModel,
  DocumentoFuenteModel,
  LineaContableModel,
  RubroInstitucionalModel,
  ValidacionResultadoModel,
  registrarAuditoria,
  transicionarCaso,
} from "@ffa/db";
import { validateCase, type RubroRef } from "@ffa/pipeline";
import type { ValidateJobData } from "@ffa/queue";
import { CONFIG_SISTEMA_ID, CasoEstado, LineaEstado } from "@ffa/shared";
import type { Job } from "bullmq";
import { notificarRevisionAnalista } from "../lib/notificaciones.js";
import { assertCasoNoPausado } from "../lib/pausa.js";
import { actualizarProgresoCaso } from "../lib/progreso.js";

export async function processValidate(job: Job<ValidateJobData>): Promise<void> {
  const { casoId } = job.data;

  await assertCasoNoPausado(casoId);
  await transicionarCaso(casoId, CasoEstado.VALIDANDO, { nota: `Job ${job.id}` });
  await actualizarProgresoCaso(casoId, "validate");

  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  const caso = await CasoModel.findById(casoId);
  if (!caso?.planCuentasVersionId) throw new Error("Caso sin plan de cuentas aplicado");

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

  const lineasDb = await LineaContableModel.find({ casoId, estado: LineaEstado.CLASIFICADA });
  const classified = lineasDb.map((l) => ({
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
  }));

  const result = validateCase(
    classified,
    rubros,
    config?.umbralConfianza ?? 85,
    {
      escala: caso.escala ?? undefined,
      periodoEjercicio: caso.periodo?.ejercicio ?? undefined,
      tipoDocumento: (await DocumentoFuenteModel.findOne({ casoId }))?.tipoDocumento ?? undefined,
      añoVigente: new Date().getFullYear(),
    }
  );

  await ValidacionResultadoModel.deleteMany({ casoId });
  await ValidacionResultadoModel.insertMany(
    result.validaciones.map((v) => ({
      casoId,
      tipo: v.tipo,
      severidad: v.severidad,
      passed: v.passed,
      mensaje: v.mensaje,
      metadata: v.metadata,
      at: new Date(),
    }))
  );

  const umbral = config?.umbralConfianza ?? 85;
  const confianzaGlobal = caso.confianzaGlobal ?? 0;
  let semaforo = result.semaforo;

  if (confianzaGlobal < umbral) {
    semaforo = semaforo === "verde" ? "amarillo" : semaforo;
  }

  const pendientes = classified.filter((l) => l.requiereRevision).length;
  const elegibleAutoAprobacion =
    semaforo === "verde" &&
    pendientes === 0 &&
    confianzaGlobal >= umbral &&
    result.cuadraturaOk;

  caso.semaforo = semaforo;
  caso.elegibleAutoAprobacion = elegibleAutoAprobacion;
  caso.umbralAplicado = umbral;
  await caso.save();

  await registrarAuditoria({
    actorTipo: "sistema",
    casoId,
    entidad: "validaciones_resultado",
    accion: "validacion_completada",
    payload: {
      semaforo,
      cuadraturaOk: result.cuadraturaOk,
      validacionesCount: result.validaciones.length,
      elegibleAutoAprobacion,
      umbralAplicado: umbral,
    },
    configSnapshot: {
      planCuentasVersionId: caso.planCuentasVersionId.toString(),
      umbral: config?.umbralConfianza,
    },
  });

  await transicionarCaso(casoId, CasoEstado.EN_REVISION, {
    nota: `Semáforo ${result.semaforo} — listo para revisión analista`,
  });
  await actualizarProgresoCaso(casoId, "en_revision", 100);

  const autoListo = elegibleAutoAprobacion;

  await notificarRevisionAnalista({
    casoNumero: caso.numero,
    casoId,
    semaforo: result.semaforo,
    autoListo,
  });

  job.log(`Validate OK semáforo=${result.semaforo}`);
}
