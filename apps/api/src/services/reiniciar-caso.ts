import {
  CasoModel,
  DocumentoFuenteModel,
  FichaCanonicaModel,
  FichaHistorialModel,
  IndicadorCalculadoModel,
  InformeComiteModel,
  LineaContableModel,
  ValidacionResultadoModel,
  registrarAuditoria,
  transicionarCaso,
} from "@ffa/db";
import { CasoEstado } from "@ffa/shared";
import { enqueuePreprocess } from "../lib/queues.js";

export type ReiniciarFojaCeroResult = {
  fichaArchivada: boolean;
  informesArchivados: number;
  documentosReencolados: number;
};

export async function reiniciarCasoFojaCero(
  casoId: string,
  userId: string,
  motivo?: string
): Promise<ReiniciarFojaCeroResult> {
  const caso = await CasoModel.findById(casoId);
  if (!caso) throw new Error("Caso no encontrado");

  const docs = await DocumentoFuenteModel.find({ casoId });
  if (!docs.length) {
    throw new Error(
      "Caso sin documentos fuente — no hay PDF almacenado para re-leer (ej. duplicado sin archivo)"
    );
  }

  let fichaArchivada = false;
  let informesArchivados = 0;

  const ficha = await FichaCanonicaModel.findOne({ casoId });
  if (ficha) {
    if (ficha.estado === "aprobada") {
      await FichaHistorialModel.create({
        casoId: ficha.casoId,
        version: ficha.version ?? 1,
        estado: ficha.estado,
        semaforo: ficha.validacionesResumen?.semaforo ?? caso.semaforo,
        confianzaGlobal: caso.confianzaGlobal,
        aprobadaPor: ficha.aprobadaPor,
        aprobadaAt: ficha.aprobadaAt,
        observaciones: ficha.observaciones
          ? `${ficha.observaciones}${motivo ? ` · Reinicio: ${motivo}` : ""}`
          : motivo,
      });
      fichaArchivada = true;
    }

    await IndicadorCalculadoModel.deleteMany({ fichaId: ficha._id });

    ficha.set("estado", "borrador");
    ficha.set("balance", { detalle: [] });
    ficha.set("estadoResultados", { detalle: [] });
    ficha.set("validacionesResumen", undefined);
    ficha.set("aprobadaPor", undefined);
    ficha.set("aprobadaAt", undefined);
    ficha.set("observaciones", undefined);
    await ficha.save();
  }

  const archivadoAt = new Date();
  const archivadoMotivo = motivo?.trim() || "Reinicio a foja cero del caso";
  const archivado = await InformeComiteModel.updateMany(
    { casoId, estado: { $ne: "archivado" } },
    { $set: { estado: "archivado", archivadoAt, archivadoMotivo } }
  );
  informesArchivados = archivado.modifiedCount;

  await LineaContableModel.deleteMany({ casoId });
  await ValidacionResultadoModel.deleteMany({ casoId });

  await DocumentoFuenteModel.updateMany(
    { casoId },
    {
      $set: {
        procesamiento: { etapaActual: "reinicio", progresoPct: 0 },
        tipoDocumento: "desconocido",
        calidadOrigen: "pendiente",
        paginaCount: 0,
        extractNotas: [],
        extractTranscripcion: [],
        normalizeLog: [],
        preprocessLog: [],
        preprocessFlags: {
          concatenado: false,
          incompleto: false,
          rotacionGrados: 0,
          unidadesDetectadas: 1,
        },
      },
      $unset: { extractMetadata: "", extractPayload: "", derivados: "" },
    }
  );

  caso.semaforo = undefined;
  caso.confianzaGlobal = undefined;
  caso.elegibleAutoAprobacion = false;
  caso.procesamientoPausado = false;
  caso.moneda = undefined;
  caso.escala = undefined;
  caso.periodo = undefined;
  caso.observaciones = undefined;
  caso.rechazoMotivo = undefined;
  caso.version = (caso.version ?? 0) + 1;
  await caso.save();

  const pipelineRunId = String(Date.now());

  await transicionarCaso(casoId, CasoEstado.EN_COLA, {
    by: userId,
    nota:
      motivo?.trim() ||
      "Foja cero — re-lectura IA del PDF desde cero (como carga nueva)",
  });

  for (const doc of docs) {
    await enqueuePreprocess(casoId, doc._id.toString(), pipelineRunId);
  }

  await registrarAuditoria({
    actorTipo: "usuario",
    actorId: userId,
    casoId,
    entidad: "caso",
    entidadId: casoId,
    accion: "caso_reiniciado_foja_cero",
    payload: {
      motivo: motivo ?? null,
      fichaArchivada,
      informesArchivados,
      documentosCount: docs.length,
      versionNueva: caso.version,
    },
  });

  return {
    fichaArchivada,
    informesArchivados,
    documentosReencolados: docs.length,
  };
}
