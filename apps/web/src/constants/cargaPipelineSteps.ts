/** Pasos que el sistema ejecutará tras «Enviar a procesamiento». */
export interface CargaPipelineStep {
  id: string;
  label: string;
  desc: string;
  icon: string;
  tone: "brand" | "process" | "human" | "done";
}

export const CARGA_PIPELINE_STEPS: CargaPipelineStep[] = [
  {
    id: "registro",
    label: "Registro",
    desc: "Guarda el archivo en el expediente",
    icon: "fa-cloud-arrow-up",
    tone: "brand",
  },
  {
    id: "cola",
    label: "Cola",
    desc: "Espera turno (sin lectura aún)",
    icon: "fa-hourglass-half",
    tone: "process",
  },
  {
    id: "preprocess",
    label: "Preproceso",
    desc: "Prepara páginas del PDF",
    icon: "fa-file-image",
    tone: "process",
  },
  {
    id: "extract",
    label: "Extracción IA",
    desc: "Lee filas y montos",
    icon: "fa-wand-magic-sparkles",
    tone: "process",
  },
  {
    id: "normalize",
    label: "Normaliza",
    desc: "Moneda, escala y signos",
    icon: "fa-scale-balanced",
    tone: "process",
  },
  {
    id: "classify",
    label: "Clasifica",
    desc: "Rubros del plan",
    icon: "fa-sitemap",
    tone: "process",
  },
  {
    id: "validate",
    label: "Valida",
    desc: "Cuadratura y confianza",
    icon: "fa-shield-halved",
    tone: "process",
  },
  {
    id: "revision",
    label: "Revisión",
    desc: "Analista corrige la ficha",
    icon: "fa-user-check",
    tone: "human",
  },
];
