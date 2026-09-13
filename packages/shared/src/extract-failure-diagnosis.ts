/** Umbrales orientativos para alertas de extracción IA (no bloquean carga). */
export const EXTRACT_FILE_WARN_MB = 12;
export const EXTRACT_FILE_HIGH_MB = 25;
export const EXTRACT_DEFAULT_MAX_PAGES = 6;

export type ExtractFailureCode =
  | "openai_rechazo"
  | "archivo_muy_grande"
  | "archivo_grande"
  | "pdf_paginas_parciales"
  | "modelo_ia_invalido"
  | "respuesta_vacia"
  | "json_invalido"
  | "sin_lineas"
  | "timeout"
  | "validacion_schema"
  | "proveedor_ia"
  | "desconocido";

export interface ExtractFailureContext {
  tamanoBytes?: number;
  paginaCount?: number;
  maxPaginasExtraccion?: number;
  nombreArchivo?: string;
}

export interface ExtractFailureDiagnosis {
  codigo: ExtractFailureCode;
  titulo: string;
  mensaje: string;
  detalles: string[];
  sugerencias: string[];
}

function mb(bytes?: number): number | undefined {
  if (bytes == null || bytes <= 0) return undefined;
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function inferCodigo(error: string): ExtractFailureCode {
  const e = error.toLowerCase();
  if (/se requiere al menos una línea|sin líneas/i.test(e)) {
    return "sin_lineas";
  }
  if (
    /anthropic falló/i.test(e) &&
    (/json|truncad|unexpected token/i.test(e) || /json de extracción/i.test(error))
  ) {
    return "json_invalido";
  }
  if (/json de extracción inválido|respuesta ia ilegible|truncad/i.test(e)) {
    return "json_invalido";
  }
  if (/openai rechazó|can't assist|can't help|no puedo ayudar|i'm sorry/i.test(error)) {
    return "openai_rechazo";
  }
  if (/respuesta openai vacía|respuesta anthropic vacía/i.test(error)) {
    return "respuesta_vacia";
  }
  if (/modelo.*no encontrado|not_found_error.*model|http 404.*model/i.test(e)) {
    return "modelo_ia_invalido";
  }
  if (/assistant message prefill|invalid_request_error/i.test(e)) {
    return "modelo_ia_invalido";
  }
  if (/json|unexpected token|truncad/i.test(e)) {
    return "json_invalido";
  }
  if (/timeout|timed out|etimedout|abort/i.test(e)) {
    return "timeout";
  }
  if (/monto inválido|denominación vacía|validación|extractvalidation/i.test(e)) {
    return "validacion_schema";
  }
  if (/openai falló|anthropic falló|anthropic http|openai http/i.test(e)) {
    return "proveedor_ia";
  }
  return "desconocido";
}

function buildSinLineasMensaje(ctx: ExtractFailureContext): string {
  const nombre = ctx.nombreArchivo ?? "";
  if (/memoria/i.test(nombre)) {
    return "El archivo parece ser memoria anual o texto narrativo: no contiene tablas con montos contables. No hay datos suficientes para generar el informe.";
  }
  return "No se encontraron filas con montos numéricos en el documento. El PDF no aporta datos contables para el informe.";
}

const TITULOS: Record<ExtractFailureCode, string> = {
  openai_rechazo: "OpenAI rechazó leer el PDF",
  archivo_muy_grande: "Archivo muy pesado para extracción IA",
  archivo_grande: "Archivo pesado — extracción lenta o incompleta",
  pdf_paginas_parciales: "Solo se procesaron las primeras páginas",
  modelo_ia_invalido: "Modelo de IA no disponible",
  respuesta_vacia: "El proveedor IA no devolvió contenido",
  json_invalido: "Respuesta IA ilegible o truncada",
  sin_lineas: "No se detectaron líneas contables",
  timeout: "Tiempo de espera agotado",
  validacion_schema: "Datos extraídos incompletos o inválidos",
  proveedor_ia: "Fallo del proveedor de IA",
  desconocido: "Extracción automática fallida",
};

const SUGERENCIAS: Partial<Record<ExtractFailureCode, string[]>> = {
  openai_rechazo: [
    "OpenAI suele rechazar balances/memorias; el sistema reintenta con Anthropic (Claude).",
    "Verificá que ANTHROPIC_API_KEY esté configurada y reiniciá la API.",
    "Probá Foja cero después de reiniciar.",
  ],
  archivo_muy_grande: [
    "PDFs mayores a ~25 MB aumentan mucho el riesgo de timeout o respuesta truncada.",
    "Exportá solo las páginas del balance (sin anexos) o comprimí el PDF.",
    "Volvé a subir una versión más liviana.",
  ],
  archivo_grande: [
    "Archivos de más de ~12 MB tardan varios minutos; no interrumpas el procesamiento.",
    "Si falla repetidamente, subí solo el balance (menos páginas).",
  ],
  pdf_paginas_parciales: [
    "Por defecto se leen las primeras 6 páginas del PDF con IA.",
    "Si el balance está más adelante, recortá el PDF a esas páginas antes de subir.",
    "Podés ajustar OPENAI_PDF_MAX_PAGES / ANTHROPIC_PDF_MAX_PAGES en .env.",
  ],
  modelo_ia_invalido: [
    "El modelo configurado fue retirado o no existe en tu cuenta.",
    "Usá ANTHROPIC_EXTRACT_MODEL=claude-sonnet-4-6 en .env y reiniciá la API.",
  ],
  json_invalido: [
    "La IA devolvió demasiado texto y la respuesta se cortó; el sistema reintenta con extracción compacta.",
    "Reiniciá la API y probá Foja cero (versión reciente reduce imágenes y reintenta sin transcripción).",
    "Si persiste, comprimí el PDF o subí solo la página del balance.",
  ],
  timeout: [
    "Aumentá OPENAI_REQUEST_TIMEOUT_MS / ANTHROPIC_REQUEST_TIMEOUT_MS (ej. 300000).",
    "Archivos grandes + muchas páginas suelen necesitar más tiempo.",
  ],
  sin_lineas: [
    "Este tipo de archivo no sirve para el informe: necesitás balance o estado de resultados con cifras.",
    "Subí el PDF con tablas numéricas (activo, pasivo, ingresos, gastos, etc.).",
    "Si el balance está en otra parte del documento, recortá y subí solo esas páginas.",
  ],
  validacion_schema: [
    "La IA leyó algo pero faltan montos o nombres de cuenta válidos.",
    "Revisá calidad del escaneo o usá carga manual desde Revisión.",
  ],
};

/** Diagnóstico legible para analistas cuando falla extract. */
export function diagnoseExtractFailure(
  error: string,
  ctx: ExtractFailureContext = {}
): ExtractFailureDiagnosis {
  let codigo = inferCodigo(error);
  const detalles: string[] = [];
  const sizeMb = mb(ctx.tamanoBytes);

  if (sizeMb != null) {
    detalles.push(`Tamaño del archivo: ${sizeMb} MB (límite de carga: 50 MB)`);
    if (sizeMb >= EXTRACT_FILE_HIGH_MB) {
      if (codigo === "desconocido" || codigo === "timeout" || codigo === "json_invalido") {
        codigo = "archivo_muy_grande";
      }
      detalles.push(`Supera ${EXTRACT_FILE_HIGH_MB} MB — alto riesgo de timeout o JSON truncado`);
    } else if (sizeMb >= EXTRACT_FILE_WARN_MB) {
      if (codigo === "desconocido") codigo = "archivo_grande";
      detalles.push(`Supera ${EXTRACT_FILE_WARN_MB} MB — la extracción puede tardar varios minutos`);
    }
  }

  const maxPages = ctx.maxPaginasExtraccion ?? EXTRACT_DEFAULT_MAX_PAGES;
  if (ctx.paginaCount != null && ctx.paginaCount > maxPages) {
    detalles.push(
      `El PDF tiene ${ctx.paginaCount} páginas; la IA procesa hasta ${maxPages} por corrida`
    );
    if (codigo === "desconocido" || codigo === "sin_lineas") {
      codigo = "pdf_paginas_parciales";
    }
  } else if (ctx.paginaCount != null) {
    detalles.push(`Páginas del PDF: ${ctx.paginaCount}`);
  }

  if (ctx.nombreArchivo?.trim()) {
    detalles.push(`Archivo: ${ctx.nombreArchivo.trim()}`);
    if (codigo === "sin_lineas" && /memoria/i.test(ctx.nombreArchivo)) {
      detalles.push("El nombre sugiere memoria anual (texto), no balance con cifras.");
    }
  }

  const esErrorDocumento = codigo === "sin_lineas";
  if (!esErrorDocumento && error.trim()) {
    detalles.push(`Error técnico: ${error.trim()}`);
  }

  const sugerencias = [...(SUGERENCIAS[codigo] ?? [])];
  if (!sugerencias.length) {
    sugerencias.push("Usá Foja cero tras reiniciar la API.", "Si persiste, probá carga manual en Revisión.");
  }

  const mensaje = esErrorDocumento
    ? buildSinLineasMensaje(ctx)
    : error.trim() || TITULOS[codigo];

  return {
    codigo,
    titulo: TITULOS[codigo],
    mensaje,
    detalles,
    sugerencias,
  };
}
