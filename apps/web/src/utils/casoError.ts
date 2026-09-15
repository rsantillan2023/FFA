import { CasoEstado, diagnoseExtractFailure } from "@ffa/shared";
import type { CasoDetalleDto } from "../api/client";

export type CasoErrorInfo = {
  titulo: string;
  mensaje: string;
  fecha?: string;
  detalles: string[];
  sugerencias: string[];
  esDuplicado: boolean;
  esExtraccionFallida: boolean;
  codigo?: string;
  archivo?: {
    nombre: string;
    tamanoMb?: number;
    paginas?: number;
  };
  numero: string;
  referencia?: string;
};

function mb(bytes?: number): number | undefined {
  if (bytes == null || bytes <= 0) return undefined;
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

export function extractCasoErrorInfo(caso: CasoDetalleDto): CasoErrorInfo {
  const historial = [...(caso.estadoHistorial ?? [])].reverse();
  const errorEntry = historial.find((h) => h.estado === CasoEstado.ERROR);
  const calidadEntry = historial.find((h) => h.estado === CasoEstado.PENDIENTE_CALIDAD);
  const falloEntry = errorEntry ?? calidadEntry;

  const doc = (caso.documentos ?? [])[0];
  const docError = doc?.procesamiento?.ultimoError?.trim();
  const nota = falloEntry?.nota?.trim();

  const esDuplicado = nota?.toLowerCase().includes("duplicado") ?? false;
  const esFalloCarga =
    nota?.includes("Fallo al guardar el archivo") ||
    nota?.includes("Fallo al encolar preprocesamiento") ||
    doc?.procesamiento?.ultimoErrorCodigo === "CARGA_STORAGE" ||
    doc?.procesamiento?.ultimoErrorCodigo === "CARGA_ENCOLA";
  const esFalloPreproceso =
    nota?.includes("Preproceso fallido") ||
    caso.observaciones?.includes("preprocesamiento no produjo") ||
    doc?.procesamiento?.ultimoErrorCodigo === "PREPROCESO_DERIVADOS";
  const esExtraccionFallida =
    !esFalloCarga &&
    !esFalloPreproceso &&
    (caso.estado === CasoEstado.PENDIENTE_CALIDAD ||
      Boolean(docError) ||
      /extracción fallida|extract falló/i.test(nota ?? ""));

  let titulo = esDuplicado ? "Documento duplicado" : "Error de procesamiento";
  let mensaje =
    nota ||
    docError ||
    "El procesamiento falló sin un mensaje detallado registrado.";
  let detalles: string[] = [];
  let sugerencias: string[] = [];
  let codigo = doc?.procesamiento?.ultimoErrorCodigo;

  if (esFalloPreproceso && !esDuplicado) {
    titulo = "Preproceso fallido";
    mensaje =
      caso.observaciones?.trim() ||
      nota?.replace(/^Preproceso fallido —\s*/i, "") ||
      "El PDF no generó páginas legibles para extracción.";
    if (docError && docError !== mensaje) detalles = [docError];
    sugerencias = [
      "Revisá el PDF original: a veces la vista previa del navegador muestra texto que el render interno no puede pintar.",
      "Usá «Foja cero» (reproceso completo) o cargá una exportación alternativa del mismo balance.",
    ];
    codigo = codigo ?? "PREPROCESO_DERIVADOS";
  } else if (esFalloCarga && !esDuplicado) {
    const esStorage =
      nota?.includes("Fallo al guardar el archivo") ||
      codigo === "CARGA_STORAGE";
    titulo = esStorage ? "Error al guardar el archivo" : "Error al encolar procesamiento";
    mensaje = nota ?? docError ?? mensaje;
    if (docError && docError !== mensaje) detalles = [docError];
    sugerencias = esStorage
      ? [
          "Verificá espacio en disco o permisos de almacenamiento.",
          "Reintentá con «Foja cero» o subí el archivo de nuevo.",
        ]
      : [
          "Verificá que Redis/worker estén activos (o modo inline en desarrollo).",
          "Usá «Reprocesar» o «Foja cero» en la fila del caso.",
        ];
  } else if (esExtraccionFallida && !esDuplicado) {
    const rawError = docError ?? nota?.replace(/^Extracción fallida tras \d+ intentos:\s*/i, "") ?? mensaje;
    const diagnosis = diagnoseExtractFailure(rawError, {
      tamanoBytes: doc?.tamanoBytes,
      paginaCount: doc?.paginaCount,
      nombreArchivo: doc?.nombreOriginal,
    });
    titulo = diagnosis.titulo;
    mensaje = diagnosis.mensaje;
    detalles = diagnosis.detalles;
    sugerencias = diagnosis.sugerencias;
    codigo = codigo ?? diagnosis.codigo;
  } else if (docError && docError !== mensaje) {
    detalles = [docError];
  }

  return {
    titulo,
    mensaje,
    fecha: falloEntry?.at,
    detalles,
    sugerencias,
    esDuplicado,
    esExtraccionFallida,
    codigo,
    archivo: doc
      ? {
          nombre: doc.nombreOriginal,
          tamanoMb: mb(doc.tamanoBytes),
          paginas: doc.paginaCount,
        }
      : undefined,
    numero: caso.numero,
    referencia: caso.referencia,
  };
}

/** Caso con fallo de extracción visible en bandeja. */
export function casoTieneFalloExtraccionVisible(estado: string): boolean {
  return estado === CasoEstado.ERROR || estado === CasoEstado.PENDIENTE_CALIDAD;
}
