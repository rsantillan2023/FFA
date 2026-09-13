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
  const esExtraccionFallida =
    caso.estado === CasoEstado.PENDIENTE_CALIDAD ||
    Boolean(docError) ||
    /extracción fallida|extract falló/i.test(nota ?? "");

  let titulo = esDuplicado ? "Documento duplicado" : "Error de procesamiento";
  let mensaje =
    nota ||
    docError ||
    "El procesamiento falló sin un mensaje detallado registrado.";
  let detalles: string[] = [];
  let sugerencias: string[] = [];
  let codigo = doc?.procesamiento?.ultimoErrorCodigo;

  if (esExtraccionFallida && !esDuplicado) {
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
