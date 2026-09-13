export interface HelpSection {
  title: string;
  bullets: string[];
}

/** Catálogo: insumos que componen la ficha canónica y dónde se cargan en FFA. */
export const FICHA_INPUTS_CATALOG: HelpSection[] = [
  {
    title: "Carga inicial (analista)",
    bullets: [
      "Documento fuente (PDF, JPEG, PNG, WebP) — Bandeja de fichas → «Cargar documentos».",
      "Email remitente (opcional, solo para acuse de recibo) — Mismo formulario de carga.",
    ],
  },
  {
    title: "Generados por procesamiento automático",
    bullets: [
      "Líneas contables (denominación y monto por fila) — Worker de extracción; visibles y editables en Revisión.",
      "Moneda, escala y ejercicio fiscal — Extraídos del documento en la etapa de normalización.",
      "Clasificación en rubros del plan — Automática (plan de cuentas + reglas); corregible línea a línea en Revisión.",
      "Validaciones e inconsistencias — Motor de validación; el analista confirma alertas en Revisión.",
      "Semáforo y confianza global — Calculados al validar; visibles en Revisión y Expediente.",
      "Trazabilidad documento/página — Registrada en cada línea contable al extraer.",
    ],
  },
  {
    title: "Datos maestros y configuración institucional",
    bullets: [
      "Plan de cuentas (rubros, convenciones) — Administración → Plan contable (versión aprobada; se aplica al caso al clasificar).",
      "Contribuyente (RUT, razón social) — Directorio de empresas; o vinculación automática si el documento trae RUT reconocible.",
      "Reglas de clasificación vigentes — Configuración global del sistema (sin pantalla propia; definida por administrador/seed).",
      "Umbral de confianza — Centro de configuración → parámetro global.",
      "Definiciones de indicadores financieros — Configuración global (versión vigente; no se cargan por caso).",
    ],
  },
  {
    title: "Al aprobar la ficha (Revisión)",
    bullets: [
      "Detalle por rubro (balance y resultados) — Consolidado automáticamente desde líneas clasificadas al pulsar «Aprobar ficha».",
      "Totales resumidos (activo, pasivo, patrimonio, utilidad) — Calculados por el sistema; no se tipean manualmente.",
      "Indicadores financieros — Calculados inmediatamente después de aprobar, a partir de los totales.",
      "Observaciones de la ficha — Texto opcional del analista al aprobar.",
      "Resumen de validaciones (cuadratura, semáforo) — Snapshot automático al aprobar.",
    ],
  },
  {
    title: "Limitaciones actuales a tener en cuenta",
    bullets: [
      "Si el PDF no trae RUT legible, el contribuyente debe existir previamente en el Directorio o vincularse por API.",
      "La carga documental no muestra aún un selector de contribuyente en pantalla (el backend sí lo acepta).",
      "Reglas de clasificación y plantilla de informe se configuran a nivel global, no por expediente.",
    ],
  },
];

/** Catálogo: insumos del informe de comité y dónde se obtienen. */
export const INFORME_INPUTS_CATALOG: HelpSection[] = [
  {
    title: "Desde la ficha aprobada (automático)",
    bullets: [
      "Balance resumido (AC, ANC, PC, PNC, patrimonio, utilidad) — Totales calculados al aprobar la ficha.",
      "Detalle con trazabilidad — Líneas contables vinculadas al documento fuente y número de página.",
      "Indicadores financieros — Tabla generada desde IndicadorCalculado (post-aprobación).",
    ],
  },
  {
    title: "Desde el caso y contribuyente (automático)",
    bullets: [
      "Número de caso y ejercicio/período — Registro del caso (metadatos extraídos o asignados en procesamiento).",
      "Razón social del contribuyente — Directorio de empresas o vinculación automática por RUT.",
      "Inconsistencias no resueltas — Validaciones del caso, con estado de confirmación del analista en Revisión.",
    ],
  },
  {
    title: "Configuración institucional (automático)",
    bullets: [
      "Plantilla HTML del informe — Versión vigente en configuración global (Administración / seed inicial).",
      "Versión del plan de cuentas aplicado — Heredado de la ficha; queda en auditoría al generar.",
      "Usuario y fecha de generación — Registrados automáticamente al pulsar «Generar informe».",
    ],
  },
  {
    title: "Carga manual del analista (Informe de comité)",
    bullets: [
      "Apartado «Análisis del analista» — Pantalla Informe → textarea editable antes de finalizar.",
      "Apartado «Recomendación comité» — Misma pantalla; obligatorio según secciones marcadas en la plantilla.",
    ],
  },
  {
    title: "Requisitos previos en el sistema",
    bullets: [
      "Ficha en estado aprobado y caso en estado aprobado — Se obtienen al completar Revisión.",
      "Plantilla de informe vigente configurada — Sin ella, la generación falla (contacte administrador).",
      "Indicadores ya calculados — Normalmente se generan al aprobar la ficha; visibles en la tarjeta de Informe.",
    ],
  },
];

/** Resumen breve para pantallas de carga y maestros. */
export const CARGA_PIPELINE_SUMMARY: HelpSection = {
  title: "¿Qué datos alimentan la ficha?",
  bullets: [
    "Usted carga el documento; el sistema extrae líneas, metadatos y clasificación.",
    "El plan de cuentas y las reglas vienen de configuración institucional.",
    "El analista revisa, corrige y aprueba; recién ahí se arman totales e indicadores.",
    "Consulte el catálogo completo en Revisión o Informe (ícono ℹ).",
  ],
};
