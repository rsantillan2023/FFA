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
  setCasoPipelineRunId,
  transicionarCaso,
} from "@ffa/db";
import { preprocessCacheEsValida } from "@ffa/pipeline";
import { newPipelineRunId } from "@ffa/queue";
import { CasoEstado } from "@ffa/shared";
import { Types } from "mongoose";
import { enqueueExtract, enqueuePreprocess } from "../lib/queues.js";

export type ReiniciarFojaCeroOpciones = {
  motivo?: string;
  /** Si true, salta preproceso y reutiliza derivados/cache del último preproceso OK. */
  reutilizarPreproceso?: boolean;
};

export type ReiniciarFojaCeroResult = {
  casoId: string;
  casoNumero: string;
  fichaArchivada: boolean;
  informesArchivados: number;
  documentosReencolados: number;
  reutilizoPreproceso: boolean;
  documentosConPreprocesoReutilizado: number;
  documentosRepreprocesados: number;
};

export async function reiniciarCasoFojaCero(
  casoId: string,
  userId: string,
  opts?: ReiniciarFojaCeroOpciones | string
): Promise<ReiniciarFojaCeroResult> {
  const options: ReiniciarFojaCeroOpciones =
    typeof opts === "string" ? { motivo: opts } : (opts ?? {});
  const motivo = options.motivo;
  const reutilizarPreproceso = options.reutilizarPreproceso === true;

  if (!Types.ObjectId.isValid(casoId)) {
    throw new Error("ID de caso inválido");
  }
  const casoObjectId = new Types.ObjectId(casoId);

  const caso = await CasoModel.findById(casoObjectId);
  if (!caso) throw new Error("Caso no encontrado");

  const docs = await DocumentoFuenteModel.find({ casoId: casoObjectId });
  if (!docs.length) {
    throw new Error(
      "Caso sin documentos fuente — no hay PDF almacenado para re-leer (ej. duplicado sin archivo)"
    );
  }

  let fichaArchivada = false;
  let informesArchivados = 0;

  const ficha = await FichaCanonicaModel.findOne({ casoId: casoObjectId });
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
    { casoId: casoObjectId, estado: { $ne: "archivado" } },
    { $set: { estado: "archivado", archivadoAt, archivadoMotivo } }
  );
  informesArchivados = archivado.modifiedCount;

  await LineaContableModel.deleteMany({ casoId: casoObjectId });
  await ValidacionResultadoModel.deleteMany({ casoId: casoObjectId });

  const resetExtraccion = {
    procesamiento: { etapaActual: "reinicio", progresoPct: 0 },
    extractNotas: [],
    extractTranscripcion: [],
    normalizeLog: [],
  };

  const resetCompletoPreproceso = {
    ...resetExtraccion,
    tipoDocumento: "desconocido",
    calidadOrigen: "pendiente",
    paginaCount: 0,
    preprocessLog: [],
    preprocessFlags: {
      concatenado: false,
      incompleto: false,
      rotacionGrados: 0,
      unidadesDetectadas: 1,
    },
  };

  let documentosConPreprocesoReutilizado = 0;
  let documentosRepreprocesados = 0;

  if (reutilizarPreproceso) {
    for (const doc of docs) {
      const cacheValida = preprocessCacheEsValida(doc);
      if (cacheValida && doc.preprocessCache) {
        await DocumentoFuenteModel.updateOne(
          { _id: doc._id },
          {
            $set: {
              ...resetExtraccion,
              calidadOrigen: doc.preprocessCache.calidadOrigen,
              tipoDocumento: doc.preprocessCache.tipoDocumento,
              paginaCount: doc.preprocessCache.paginaCount ?? 0,
              preprocessFlags: doc.preprocessCache.preprocessFlags,
              derivados: doc.preprocessCache.derivados,
              preprocessLog: [
                {
                  at: new Date(),
                  etapa: "foja_cero",
                  mensaje: "Preproceso reutilizado desde cache (sin re-renderizar PDF)",
                },
              ],
            },
            $unset: { extractMetadata: "", extractPayload: "" },
          }
        );
        documentosConPreprocesoReutilizado += 1;
      } else {
        await DocumentoFuenteModel.updateOne(
          { _id: doc._id },
          {
            $set: resetCompletoPreproceso,
            $unset: { extractMetadata: "", extractPayload: "", derivados: "", preprocessCache: "" },
          }
        );
        documentosRepreprocesados += 1;
      }
    }
  } else {
    await DocumentoFuenteModel.updateMany(
      { casoId: casoObjectId },
      {
        $set: resetCompletoPreproceso,
        $unset: { extractMetadata: "", extractPayload: "", derivados: "", preprocessCache: "" },
      }
    );
    documentosRepreprocesados = docs.length;
  }

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

  const pipelineRunId = newPipelineRunId();
  await setCasoPipelineRunId(casoId, pipelineRunId);
  const reutilizoAlguno =
    reutilizarPreproceso && documentosConPreprocesoReutilizado > 0 && documentosRepreprocesados === 0;

  await transicionarCaso(casoId, CasoEstado.EN_COLA, {
    by: userId,
    nota:
      motivo?.trim() ||
      (reutilizoAlguno
        ? "Foja cero — re-lectura IA reutilizando preproceso guardado"
        : reutilizarPreproceso && documentosConPreprocesoReutilizado > 0
          ? "Foja cero — mixto: preproceso reutilizado donde había cache"
          : "Foja cero — re-lectura IA del PDF desde cero (como carga nueva)"),
  });

  for (const doc of docs) {
    const fresh = await DocumentoFuenteModel.findById(doc._id);
    if (!fresh) continue;

    const puedeSaltarPreproceso = reutilizarPreproceso && preprocessCacheEsValida(fresh);

    if (puedeSaltarPreproceso) {
      await DocumentoFuenteModel.updateOne(
        { _id: fresh._id },
        { $set: { procesamiento: { etapaActual: "extract", progresoPct: 0 } } }
      );
      await enqueueExtract(casoId, fresh._id.toString(), pipelineRunId);
    } else {
      await enqueuePreprocess(casoId, fresh._id.toString(), pipelineRunId);
    }
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
      reutilizarPreproceso,
      fichaArchivada,
      informesArchivados,
      documentosCount: docs.length,
      documentosConPreprocesoReutilizado,
      documentosRepreprocesados,
      versionNueva: caso.version,
    },
  });

  return {
    casoId,
    casoNumero: caso.numero,
    fichaArchivada,
    informesArchivados,
    documentosReencolados: docs.length,
    reutilizoPreproceso: reutilizoAlguno,
    documentosConPreprocesoReutilizado,
    documentosRepreprocesados,
  };
}
