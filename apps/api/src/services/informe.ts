import {
  CasoModel,
  ConfiguracionSistemaModel,
  FichaCanonicaModel,
  InformeComiteModel,
  PlantillaInformeVersionModel,
  registrarAuditoria,
} from "@ffa/db";
import { CONFIG_SISTEMA_ID, CasoEstado } from "@ffa/shared";
import { Types } from "mongoose";
import { uploadInformeHtml } from "../lib/storage.js";
import { generarNarrativaInforme } from "./informe-ia.js";
import { buildInformeHtml } from "./informe-render.js";

export async function generarInforme(
  fichaId: string,
  userId: string
): Promise<{ informeId: string; storageKey: string; narrativaOrigen: string }> {
  const config = await ConfiguracionSistemaModel.findById(CONFIG_SISTEMA_ID);
  if (!config?.plantillaVigenteId) {
    throw new Error("No hay plantilla de informe vigente — ejecute seed");
  }

  const [ficha, plantilla] = await Promise.all([
    FichaCanonicaModel.findById(fichaId),
    PlantillaInformeVersionModel.findById(config.plantillaVigenteId),
  ]);

  if (!ficha || ficha.estado !== "aprobada") {
    throw new Error("La ficha debe estar aprobada");
  }

  const caso = await CasoModel.findById(ficha.casoId);
  if (!caso || caso.estado !== CasoEstado.APROBADO) {
    throw new Error("El caso debe estar aprobado");
  }

  const narrativa = await generarNarrativaInforme(fichaId, {
    userId,
    casoId: caso._id.toString(),
  });

  const html = await buildInformeHtml(fichaId, {
    template: plantilla?.htmlTemplate,
    estadoInforme: "Preliminar",
    resumenEjecutivo: narrativa.resumenEjecutivo,
    apartadoAnalisis: narrativa.apartadoAnalisis,
    apartadoRecomendacion: narrativa.apartadoRecomendacion,
  });

  const storageKey = await uploadInformeHtml(
    caso._id.toString(),
    fichaId,
    Buffer.from(html, "utf-8")
  );

  const informe = await InformeComiteModel.create({
    fichaId: ficha._id,
    casoId: caso._id,
    plantillaVersionId: plantilla!._id,
    estado: "preliminar",
    storageKeyHtml: storageKey,
    generadoPor: new Types.ObjectId(userId),
    fichaVersion: ficha.version,
    apartadosManuales: new Map([
      ["apartado_analisis", narrativa.apartadoAnalisis],
      ["apartado_recomendacion", narrativa.apartadoRecomendacion],
    ]),
  });

  await transicionarInformeCaso(caso._id.toString());

  await registrarAuditoria({
    actorTipo: "usuario",
    actorId: userId,
    casoId: caso._id.toString(),
    entidad: "informe_comite",
    entidadId: informe._id.toString(),
    accion: "informe_generado",
    configSnapshot: { planCuentasVersionId: ficha.planCuentasVersionId.toString() },
    payload: {
      narrativaOrigen: narrativa.origen,
      modeloIa: narrativa.modelo ?? null,
      narrativaError: narrativa.error ?? null,
    },
  });

  return {
    informeId: informe._id.toString(),
    storageKey,
    narrativaOrigen: narrativa.origen,
  };
}

async function transicionarInformeCaso(casoId: string): Promise<void> {
  const { transicionarCaso } = await import("@ffa/db");
  const caso = await CasoModel.findById(casoId);
  if (caso?.estado === CasoEstado.APROBADO) {
    await transicionarCaso(casoId, CasoEstado.INFORME_GENERADO, {
      nota: "Informe preliminar generado",
    });
  }
}

export async function finalizarInforme(informeId: string, userId: string): Promise<void> {
  const informe = await InformeComiteModel.findById(informeId);
  if (!informe) throw new Error("Informe no encontrado");
  if (informe.estado === "final") {
    throw new Error("El informe ya está marcado como final");
  }

  const ficha = await FichaCanonicaModel.findById(informe.fichaId);
  if (!ficha || ficha.estado !== "aprobada") {
    throw new Error("La ficha asociada debe estar aprobada para finalizar el informe");
  }

  const plantilla = await PlantillaInformeVersionModel.findById(informe.plantillaVersionId);
  const obligatorios = (plantilla?.secciones ?? []).filter(
    (s) => s.tipo === "variable" && s.obligatorio
  );

  const manuales = informe.apartadosManuales as Map<string, string> | Record<string, string>;
  const getManual = (id: string): string => {
    if (manuales instanceof Map) return manuales.get(id) ?? "";
    return (manuales as Record<string, string>)[id] ?? "";
  };

  const incompletos = obligatorios.filter((sec) => !getManual(sec.id)?.trim());
  if (incompletos.length > 0) {
    const nombres = incompletos.map((s) => s.nombre).join(", ");
    throw new Error(
      `Complete los apartados obligatorios antes de finalizar: ${nombres}`
    );
  }

  informe.estado = "final";
  informe.finalizadoAt = new Date();
  await informe.save();

  await registrarAuditoria({
    actorTipo: "usuario",
    actorId: userId,
    casoId: informe.casoId.toString(),
    entidad: "informe_comite",
    entidadId: informeId,
    accion: "informe_finalizado",
    payload: { intervencionHumanaFocalizada: true },
  });
}
