/** Etiquetas funcionales para colas técnicas del pipeline FFA. */
export const COLA_LABELS: Record<
  string,
  { titulo: string; descripcion: string; etapa: number }
> = {
  "ffa-preprocess": {
    etapa: 1,
    titulo: "Preparación del PDF",
    descripcion: "Revisa que el archivo se pueda leer (calidad, páginas, formato).",
  },
  "ffa-extract": {
    etapa: 2,
    titulo: "Lectura del documento",
    descripcion: "Lee tablas y montos del balance o estado de resultados (OCR / IA).",
  },
  "ffa-normalize": {
    etapa: 3,
    titulo: "Normalización de montos",
    descripcion: "Pasa todo a la misma escala (miles CLP) y corrige signos.",
  },
  "ffa-classify": {
    etapa: 4,
    titulo: "Clasificación por rubros",
    descripcion: "Asigna cada línea al plan contable de la institución.",
  },
  "ffa-validate": {
    etapa: 5,
    titulo: "Validaciones automáticas",
    descripcion: "Comprueba cuadratura y reglas antes de enviar a revisión humana.",
  },
};

export interface ColaHelpContent {
  title: string;
  summary: string;
  whenToUse: string;
  bullets: string[];
  sections?: { title: string; bullets: string[] }[];
}

export const COLA_HELP: Record<string, ColaHelpContent> = {
  "ffa-preprocess": {
    title: "Etapa 1 — Preparación del PDF",
    summary:
      "Es el primer paso automático después de cargar una ficha. El sistema revisa si el PDF es legible, si tiene páginas completas y si el formato es compatible.",
    whenToUse: "Consultá esta fila si la ficha queda en «preprocesando» o «extracción fallida» mucho tiempo.",
    bullets: [
      "En espera: fichas que ya llegaron pero aún no empezaron esta revisión.",
      "Procesando: el sistema está analizando la calidad del archivo ahora.",
      "Con error: el PDF puede estar corrupto, vacío o en un formato no soportado.",
    ],
    sections: [
      {
        title: "Qué hacer si hay demoras o errores",
        bullets: [
          "Pedí al contribuyente un PDF nativo (no escaneado borroso) si hay muchos errores.",
          "Revisá la ficha en la bandeja — puede estar en «Extracción fallida».",
          "Usá «Reintentar procesamiento» más abajo si una ficha puntual quedó trabada.",
        ],
      },
    ],
  },
  "ffa-extract": {
    title: "Etapa 2 — Lectura del documento (OCR)",
    summary:
      "Acá el motor lee el contenido del PDF: tablas, cuentas y montos. Es la etapa que más tarda en fichas largas o escaneadas.",
    whenToUse: "Si la ficha se detiene en «extrayendo» o falla con error de lectura.",
    bullets: [
      "En espera: fichas listas para OCR pero esperando turno.",
      "Procesando: lectura en curso (normal en balances extensos).",
      "Con error: timeout, PDF ilegible o proveedor OCR no disponible.",
    ],
    sections: [
      {
        title: "Qué hacer",
        bullets: [
          "Verificá que el proveedor OCR esté configurado (sección avanzada al final).",
          "Reintentá la ficha; a veces es un fallo transitorio.",
          "Si persiste, escalá a soporte con el número de ficha.",
        ],
      },
    ],
  },
  "ffa-normalize": {
    title: "Etapa 3 — Normalización de montos",
    summary:
      "Convierte los montos extraídos a un formato único (escala miles, moneda CLP, signos contables coherentes).",
    whenToUse: "Si la ficha queda en «normalizando» o los montos en revisión parecen incoherentes.",
    bullets: [
      "En espera: extracción terminó, falta normalizar.",
      "Procesando: ajuste de escalas en curso.",
      "Con error: datos extraídos incompletos o inconsistentes.",
    ],
  },
  "ffa-classify": {
    title: "Etapa 4 — Clasificación por rubros",
    summary:
      "Cada línea del documento se asocia a un rubro del plan contable vigente (caja, proveedores, patrimonio, etc.).",
    whenToUse: "Si la ficha demora en «clasificando» o muchas líneas quedan sin rubro en revisión.",
    bullets: [
      "En espera: normalización lista, falta clasificar.",
      "Procesando: el motor está asignando rubros.",
      "Con error: plan contable sin versión aprobada o reglas incompletas.",
    ],
    sections: [
      {
        title: "Qué revisar",
        bullets: [
          "Confirmá que exista un plan de cuentas aprobado en Configuración.",
          "Revisá reglas de clasificación si muchas líneas fallan.",
        ],
      },
    ],
  },
  "ffa-validate": {
    title: "Etapa 5 — Validaciones automáticas",
    summary:
      "Última etapa automática: cuadratura activo = pasivo + patrimonio, coherencia entre estados y alertas de negocio.",
    whenToUse: "Si la ficha queda en «validando» o llega a revisión con semáforo rojo.",
    bullets: [
      "En espera: clasificación lista, faltan validaciones.",
      "Procesando: reglas de cuadratura en ejecución.",
      "Con error: validación crítica fallida — suele requerir analista.",
    ],
    sections: [
      {
        title: "Después de esta etapa",
        bullets: [
          "La ficha pasa a «En revisión» para el analista.",
          "El semáforo (verde/amarillo/rojo) resume la confianza del resultado.",
        ],
      },
    ],
  },
};

export const MAIL_INGEST_HELP: ColaHelpContent = {
  title: "¿Por qué no aparece la cola de correo?",
  summary:
    "En esta grilla solo se muestran las 5 etapas por las que pasa una ficha ya recibida en el sistema (desde la preparación del PDF hasta las validaciones).",
  whenToUse: "Cuando te preguntás si falta una cola o si el correo electrónico debería verse acá.",
  bullets: [
    "La ingesta por correo (ffa-mail-ingest) es un canal de entrada aparte: recibe emails y crea fichas nuevas.",
    "Una vez creada la ficha, el procesamiento sigue las 5 filas de esta tabla — no la cola de mail.",
    "Por eso la ocultamos acá: evita confusión entre «llegó un mail» y «se está procesando la ficha».",
    "En desarrollo (modo directo) ambas pueden mostrar ceros aunque el sistema funcione bien.",
  ],
};

export const SECCION_HELP = {
  reprocesar: {
    title: "Reintentar una ficha atascada",
    summary:
      "Vuelve a encolar una ficha que quedó en error o no avanzó de etapa. No borra el documento ni la revisión ya hecha: reinicia el pipeline automático.",
    whenToUse: "Cuando una ficha lleva mucho tiempo en la misma etapa o figura con estado «Error».",
    bullets: [
      "Usá el ID del expediente (desde la bandeja → Ver expediente) o el número de caso asignado al expediente.",
      "Tras reintentar, refrescá esta grilla con «Actualizar» para ver si la ficha entró en «En espera».",
      "Si falla repetidamente, revisá la etapa con error en la tabla superior.",
    ],
  },
  ilegibles: {
    title: "Documentos ilegibles o de mala calidad",
    summary:
      "Define qué hace SOOFT FINYX cuando el PDF escaneado no alcanza calidad mínima para OCR (borroso, recortado, ilegible).",
    whenToUse: "Cuando muchas fichas quedan en «Extracción fallida» o rechazadas por mala imagen.",
    bullets: [
      "Pedir nuevo documento: notifica al remitente para que reenvíe el PDF.",
      "Derivar a analista: un humano decide si se procesa igual o se pide otro archivo.",
      "Reintentos máximos: cuántas veces el sistema vuelve a intentar antes de escalar.",
    ],
  },
  notificaciones: {
    title: "Notificaciones por correo",
    summary: "Lista de personas que reciben avisos automáticos del sistema (no es la cola de ingesta de fichas).",
    whenToUse: "Para configurar quién recibe alertas de fichas listas, errores o documentos ilegibles.",
    bullets: [
      "Analistas: avisos operativos (ficha en revisión, extracción fallida).",
      "Administradores: errores graves o fallos del sistema.",
      "El historial inferior muestra los últimos correos enviados.",
    ],
  },
} as const satisfies Record<string, ColaHelpContent>;

export function colaDisplay(name: string): { titulo: string; descripcion: string; tecnico: string } {
  const meta = COLA_LABELS[name];
  if (meta) {
    return {
      titulo: `${meta.etapa}. ${meta.titulo}`,
      descripcion: meta.descripcion,
      tecnico: name,
    };
  }
  return { titulo: name, descripcion: "", tecnico: name };
}

export function colaHelp(name: string): ColaHelpContent | undefined {
  return COLA_HELP[name];
}

export const ETAPA_REINTENTO_LABELS: Record<string, string> = {
  preprocess: "Preparación del PDF",
  extract: "Lectura del documento",
  normalize: "Normalización de montos",
  classify: "Clasificación por rubros",
  validate: "Validaciones automáticas",
};

export const NOTIF_TIPO_LABELS: Record<string, string> = {
  caso_en_revision: "Ficha lista para revisión",
  caso_error: "Error en procesamiento",
  informe_generado: "Informe generado",
  pendiente_calidad: "Extracción fallida",
  acceso_fallido: "Intento de acceso fallido",
};

export function interpretarColas(colas: Array<{ waiting: number; active: number; failed: number }>): {
  nivel: "ok" | "atencion" | "critico";
  titulo: string;
  detalle: string;
} {
  const totalFailed = colas.reduce((n, c) => n + c.failed, 0);
  const totalWaiting = colas.reduce((n, c) => n + c.waiting, 0);
  const totalActive = colas.reduce((n, c) => n + c.active, 0);

  if (totalFailed > 0) {
    return {
      nivel: "critico",
      titulo: "Hay fichas con error en el procesamiento",
      detalle: `${totalFailed} error(es) en alguna etapa. Revisá la fila «Con error» y considerá reintentar la ficha afectada.`,
    };
  }
  if (totalWaiting > 5) {
    return {
      nivel: "atencion",
      titulo: "Cola de espera elevada",
      detalle: `${totalWaiting} ficha(s) esperando turno. Puede haber demora; si es habitual, consultá con soporte técnico.`,
    };
  }
  if (totalActive > 0) {
    return {
      nivel: "ok",
      titulo: "Procesamiento en curso",
      detalle: `${totalActive} ficha(s) procesándose ahora. Las demás etapas en cero es normal si no hay carga pendiente.`,
    };
  }
  return {
    nivel: "ok",
    titulo: "Sin carga pendiente visible",
    detalle:
      "Todas las etapas en cero suele significar que no hay fichas en pipeline ahora. En modo desarrollo directo los números pueden quedar en cero aunque el sistema funcione.",
  };
}
