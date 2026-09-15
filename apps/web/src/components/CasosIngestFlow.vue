<template>
  <div class="ingest-flow card" role="navigation" aria-label="Recorrido de la ficha desde la carga">
    <div v-if="activeFilter" class="ingest-flow__toolbar">
      <span class="ingest-flow__filter-tag">
        Filtrando: {{ activeStepLabel }}
      </span>
      <button
        type="button"
        class="ingest-flow__clear"
        title="Quitar filtro de etapa"
        @click="emit('filter', '')"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
        Limpiar filtro
      </button>
    </div>
    <div id="ingest-flow-body" class="ingest-flow__body">
    <div class="ingest-flow__track-wrap">
      <div class="ingest-flow__track">
        <template v-for="(step, index) in FLOW_STEPS" :key="step.id">
          <button
            type="button"
            class="ingest-flow__node"
            :class="{ 'ingest-flow__node--active': isActive(step) }"
            :title="step.hint"
            @click="onNodeClick(step)"
          >
            <span class="ingest-flow__icon-wrap">
              <span class="ingest-flow__icon" :class="`ingest-flow__icon--${step.tone}`">
                <i :class="['fas', step.icon]" aria-hidden="true"></i>
              </span>
              <span v-if="countFor(step) > 0" class="ingest-flow__count">{{ countFor(step) }}</span>
            </span>
            <span class="ingest-flow__text">
              <span class="ingest-flow__label-row">
                <span class="ingest-flow__label">{{ step.label }}</span>
                <span
                  class="ingest-flow__pct"
                  :title="`Avance global del procesamiento al llegar a ${step.label}`"
                >{{ progresoPctStep(step) }}%</span>
              </span>
              <span class="ingest-flow__desc">{{ step.desc }}</span>
            </span>
          </button>
          <div
            v-if="index < FLOW_STEPS.length - 1"
            class="ingest-flow__bridge"
            aria-hidden="true"
          >
            <span
              class="ingest-flow__handoff"
              :title="`Entrega de ${step.label}: ${step.output}`"
            >{{ step.output }}</span>
            <span class="ingest-flow__arrow"></span>
          </div>
        </template>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CasoEstado } from "@ffa/shared";
import { computed } from "vue";
import { ingestFlowStepProgresoPct } from "../utils/pipelineDisplay";

const props = defineProps<{
  counts?: Record<string, number>;
  activeFilter?: string;
}>();

export interface IngestFlowStep {
  id: string;
  label: string;
  desc: string;
  /** Resultado que este paso deja listo para el siguiente. */
  output: string;
  icon: string;
  hint: string;
  filter: string;
  tone: "brand" | "process" | "human" | "done";
  countKeys: string[];
}

const FLOW_STEPS: IngestFlowStep[] = [
  {
    id: "carga",
    label: "Carga",
    desc: "Carga de PDF o imagen",
    output: "Expediente registrado",
    icon: "fa-cloud-arrow-up",
    hint: "PDF o imagen registrado en el portal",
    filter: CasoEstado.RECIBIDO,
    tone: "brand",
    countKeys: [CasoEstado.RECIBIDO],
  },
  {
    id: "cola",
    label: "Cola",
    desc: "En espera de turno",
    output: "Turno asignado",
    icon: "fa-layer-group",
    hint: "Espera de turno de procesamiento",
    filter: CasoEstado.EN_COLA,
    tone: "process",
    countKeys: [CasoEstado.EN_COLA],
  },
  {
    id: "pre",
    label: "Preproceso",
    desc: "Preparación de páginas",
    output: "Páginas e imágenes",
    icon: "fa-file-image",
    hint: "Preparación de páginas e imágenes del documento",
    filter: CasoEstado.PREPROCESANDO,
    tone: "process",
    countKeys: [CasoEstado.PREPROCESANDO],
  },
  {
    id: "extract",
    label: "Extracción",
    desc: "Lectura con IA",
    output: "Líneas y montos extraídos",
    icon: "fa-wand-magic-sparkles",
    hint: "Lectura de tablas y montos con inteligencia artificial",
    filter: CasoEstado.EXTRAYENDO,
    tone: "process",
    countKeys: [CasoEstado.EXTRAYENDO],
  },
  {
    id: "norm",
    label: "Normalización",
    desc: "Moneda, escala y signos",
    output: "Moneda, escala y ejercicio",
    icon: "fa-scale-balanced",
    hint: "Normalización de moneda, escala y formato de montos",
    filter: CasoEstado.NORMALIZANDO,
    tone: "process",
    countKeys: [CasoEstado.NORMALIZANDO],
  },
  {
    id: "class",
    label: "Clasificación",
    desc: "Rubros contables",
    output: "Rubros del plan",
    icon: "fa-sitemap",
    hint: "Asignación de rubros del plan de cuentas",
    filter: CasoEstado.CLASIFICANDO,
    tone: "process",
    countKeys: [CasoEstado.CLASIFICANDO],
  },
  {
    id: "valid",
    label: "Validación",
    desc: "Cuadratura y confianza",
    output: "Cuadratura y semáforo",
    icon: "fa-shield-halved",
    hint: "Validación de cuadraturas y semáforo de confianza",
    filter: CasoEstado.VALIDANDO,
    tone: "process",
    countKeys: [CasoEstado.VALIDANDO],
  },
  {
    id: "rev",
    label: "Revisión",
    desc: "Corrección por analista",
    output: "Ficha validada",
    icon: "fa-user-check",
    hint: "Validación y corrección de la ficha por el analista",
    filter: CasoEstado.EN_REVISION,
    tone: "human",
    countKeys: [CasoEstado.EN_REVISION, CasoEstado.APROBADO, CasoEstado.INFORME_GENERADO],
  },
];

const emit = defineEmits<{
  filter: [estado: string];
}>();

function progresoPctStep(step: IngestFlowStep): number {
  return ingestFlowStepProgresoPct(step);
}

function countFor(step: IngestFlowStep): number {
  if (!props.counts) return 0;
  return step.countKeys.reduce((n, k) => n + (props.counts![k] ?? 0), 0);
}

function isActive(step: IngestFlowStep): boolean {
  if (!props.activeFilter) return false;
  if (props.activeFilter === step.filter) return true;
  if (step.id === "rev") {
    return (
      props.activeFilter === CasoEstado.EN_REVISION ||
      props.activeFilter === CasoEstado.APROBADO ||
      props.activeFilter === CasoEstado.INFORME_GENERADO
    );
  }
  return false;
}

const activeStepLabel = computed(() => {
  const step = FLOW_STEPS.find((s) => isActive(s));
  return step?.label ?? props.activeFilter ?? "";
});

function onNodeClick(step: IngestFlowStep): void {
  emit("filter", isActive(step) ? "" : step.filter);
}
</script>

<style scoped>
.ingest-flow {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.75rem;
  padding: 0.65rem 0.85rem 0.55rem;
  border-color: color-mix(in srgb, var(--brand) 18%, var(--line));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--brand) 4%, var(--panel)) 0%,
    var(--panel) 55%
  );
}

.ingest-flow__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}

.ingest-flow__filter-tag {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--brand-ink);
}

.ingest-flow__clear {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.18rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
  transition: color 0.12s ease, border-color 0.12s ease;
}

.ingest-flow__clear:hover {
  color: var(--ink);
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
}

.ingest-flow__body {
  margin: 0;
}

.ingest-flow__track-wrap {
  width: 100%;
}

.ingest-flow__track {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 5.5rem;
  padding-top: 1.45rem;
  gap: 0;
  box-sizing: border-box;
}

.ingest-flow__node {
  display: inline-flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.35rem 0.12rem 0.25rem;
  border: none;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  position: relative;
  min-width: 0;
  border-radius: 0;
  transition: opacity 0.15s ease;
}

.ingest-flow__node:hover {
  background: transparent;
  border: none;
  box-shadow: none;
}

.ingest-flow__node:hover .ingest-flow__label {
  color: var(--brand);
}

.ingest-flow__node--active .ingest-flow__label {
  color: var(--brand-ink);
}

.ingest-flow__node--active .ingest-flow__icon {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 45%, transparent);
}

.ingest-flow__bridge {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  align-self: center;
  width: clamp(2.5rem, 4vw, 4.25rem);
  margin: 0 0.08rem;
}

.ingest-flow__handoff {
  position: absolute;
  bottom: calc(100% + 0.35rem);
  left: 50%;
  transform: translateX(-50%);
  width: max(100%, 4.5rem);
  min-height: 1.35rem;
  padding: 0 0.05rem;
  font-size: clamp(0.4375rem, 0.78vw, 0.5625rem);
  font-weight: 600;
  line-height: 1.2;
  color: var(--ink-soft);
  text-align: center;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  pointer-events: none;
}

.ingest-flow__icon-wrap {
  position: relative;
  flex-shrink: 0;
}

.ingest-flow__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.65rem;
  height: 2.65rem;
  aspect-ratio: 1;
  border-radius: 999px;
  font-size: 1.05rem;
  color: #fff;
  transition: box-shadow 0.15s ease;
}

.ingest-flow__icon--brand {
  background: linear-gradient(145deg, var(--brand), var(--brand-dark, #134e4a));
}

.ingest-flow__icon--process {
  background: linear-gradient(145deg, #64748b, #475569);
}

.ingest-flow__icon--human {
  background: linear-gradient(145deg, #0ea5e9, #0369a1);
}

.ingest-flow__icon--done {
  background: linear-gradient(145deg, var(--ok), #15803d);
}

.ingest-flow__text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  width: 100%;
  min-width: 0;
  padding: 0 0.08rem;
}

.ingest-flow__label-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.2rem;
  max-width: 100%;
}

.ingest-flow__label {
  font-size: clamp(0.625rem, 1.15vw, 0.75rem);
  font-weight: 600;
  line-height: 1.15;
  color: var(--ink);
  letter-spacing: 0.01em;
  text-align: center;
}

.ingest-flow__pct {
  display: inline-block;
  padding: 0.04rem 0.32rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
  font-size: clamp(0.5rem, 0.95vw, 0.625rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  color: var(--brand);
  white-space: nowrap;
}

.ingest-flow__desc {
  font-size: clamp(0.4375rem, 0.82vw, 0.5625rem);
  font-weight: 400;
  line-height: 1.25;
  color: var(--ink-soft);
  text-align: center;
  max-width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ingest-flow__count {
  position: absolute;
  top: -0.12rem;
  left: -0.12rem;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.28rem;
  border-radius: 999px;
  border: 1.5px solid var(--panel);
  background: var(--brand);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}

.ingest-flow__arrow {
  --arrow-color: color-mix(in srgb, var(--brand) 65%, var(--ink));
  flex: 1 1 auto;
  width: 100%;
  height: 2px;
  background: var(--arrow-color);
  position: relative;
  user-select: none;
}

.ingest-flow__arrow::after {
  content: "";
  position: absolute;
  right: -1px;
  top: 50%;
  width: 0.4rem;
  height: 0.4rem;
  border-top: 2px solid var(--arrow-color);
  border-right: 2px solid var(--arrow-color);
  transform: translateY(-50%) rotate(45deg);
}

</style>
