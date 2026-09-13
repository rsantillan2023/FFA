<template>
  <div
    class="ingest-flow card"
    :class="{ 'ingest-flow--collapsed': !expanded }"
    role="navigation"
    aria-label="Recorrido de una ficha desde la carga"
  >
    <button
      type="button"
      class="ingest-flow__toggle"
      :aria-expanded="expanded"
      aria-controls="ingest-flow-body"
      @click="expanded = !expanded"
    >
      <span class="ingest-flow__title">Etapas de Expediente</span>
      <i
        class="fas fa-chevron-down ingest-flow__chevron"
        :class="{ 'ingest-flow__chevron--open': expanded }"
        aria-hidden="true"
      ></i>
    </button>
    <div v-show="expanded" id="ingest-flow-body" class="ingest-flow__body">
    <div class="ingest-flow__track-wrap">
      <div class="ingest-flow__track">
        <template v-for="(step, index) in FLOW_STEPS" :key="step.id">
          <button
            type="button"
            class="ingest-flow__node"
            :class="{ 'ingest-flow__node--active': isActive(step) }"
            :title="step.hint"
            @click="emit('filter', step.filter)"
          >
            <span class="ingest-flow__icon" :class="`ingest-flow__icon--${step.tone}`">
              <i :class="['fas', step.icon]" aria-hidden="true"></i>
            </span>
            <span class="ingest-flow__text">
              <span class="ingest-flow__label">{{ step.label }}</span>
              <span class="ingest-flow__desc">{{ step.desc }}</span>
            </span>
            <span v-if="countFor(step) > 0" class="ingest-flow__count">{{ countFor(step) }}</span>
          </button>
          <span
            v-if="index < FLOW_STEPS.length - 1"
            class="ingest-flow__arrow"
            aria-hidden="true"
          >--></span>
        </template>
      </div>
    </div>
    <div class="ingest-flow__foot">
      <span class="ingest-flow__foot-group">
        <button
          type="button"
          class="ingest-flow__alt"
          :title="pendienteCalidadHint"
          @click="emit('filter', CasoEstado.PENDIENTE_CALIDAD)"
        >
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          {{ pendienteCalidadLabel }}
          <span v-if="counts?.pendiente_calidad" class="ingest-flow__count ingest-flow__count--inline">
            {{ counts.pendiente_calidad }}
          </span>
        </button>
        <span class="ingest-flow__sep">·</span>
        <button type="button" class="ingest-flow__alt ingest-flow__alt--error" @click="emit('filter', CasoEstado.ERROR)">
          <i class="fas fa-circle-xmark" aria-hidden="true"></i>
          Error
          <span v-if="counts?.error" class="ingest-flow__count ingest-flow__count--inline">
            {{ counts.error }}
          </span>
        </button>
      </span>
      <button
        type="button"
        class="ingest-flow__alt ingest-flow__alt--clear"
        :class="{ 'ingest-flow__alt--muted': !activeFilter }"
        @click="emit('filter', '')"
      >
        Ver todos
      </button>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { CasoEstado } from "@ffa/shared";
import { casoEstadoHint, casoEstadoLabel } from "../utils/casoEstadoDisplay";

const expanded = ref(false);

const pendienteCalidadLabel = casoEstadoLabel(CasoEstado.PENDIENTE_CALIDAD);
const pendienteCalidadHint = casoEstadoHint(CasoEstado.PENDIENTE_CALIDAD);

export interface IngestFlowStep {
  id: string;
  label: string;
  desc: string;
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
    desc: "Subís el PDF o imagen",
    icon: "fa-cloud-arrow-up",
    hint: "PDF o imagen subido al portal",
    filter: CasoEstado.RECIBIDO,
    tone: "brand",
    countKeys: [CasoEstado.RECIBIDO],
  },
  {
    id: "cola",
    label: "Cola",
    desc: "Espera su turno",
    icon: "fa-layer-group",
    hint: "Esperando turno de procesamiento",
    filter: CasoEstado.EN_COLA,
    tone: "process",
    countKeys: [CasoEstado.EN_COLA],
  },
  {
    id: "pre",
    label: "Preproceso",
    desc: "Prepara páginas del doc.",
    icon: "fa-file-image",
    hint: "Prepara páginas e imagen del documento",
    filter: CasoEstado.PREPROCESANDO,
    tone: "process",
    countKeys: [CasoEstado.PREPROCESANDO],
  },
  {
    id: "extract",
    label: "Extracción",
    desc: "Lee tablas y montos con IA",
    icon: "fa-wand-magic-sparkles",
    hint: "Lee tablas y montos con inteligencia artificial",
    filter: CasoEstado.EXTRAYENDO,
    tone: "process",
    countKeys: [CasoEstado.EXTRAYENDO],
  },
  {
    id: "norm",
    label: "Normaliza",
    desc: "Moneda, escala y signos",
    icon: "fa-scale-balanced",
    hint: "Moneda, escala y formato de montos",
    filter: CasoEstado.NORMALIZANDO,
    tone: "process",
    countKeys: [CasoEstado.NORMALIZANDO],
  },
  {
    id: "class",
    label: "Clasifica",
    desc: "Asigna rubros contables",
    icon: "fa-sitemap",
    hint: "Asigna rubros del plan de cuentas",
    filter: CasoEstado.CLASIFICANDO,
    tone: "process",
    countKeys: [CasoEstado.CLASIFICANDO],
  },
  {
    id: "valid",
    label: "Valida",
    desc: "Cuadraturas y confianza",
    icon: "fa-shield-halved",
    hint: "Cuadraturas y semáforo de confianza",
    filter: CasoEstado.VALIDANDO,
    tone: "process",
    countKeys: [CasoEstado.VALIDANDO],
  },
  {
    id: "rev",
    label: "Revisión",
    desc: "Analista corrige la ficha",
    icon: "fa-user-check",
    hint: "El analista valida y corrige la ficha",
    filter: CasoEstado.EN_REVISION,
    tone: "human",
    countKeys: [CasoEstado.EN_REVISION, CasoEstado.APROBADO, CasoEstado.INFORME_GENERADO],
  },
];

const props = defineProps<{
  counts?: Record<string, number>;
  activeFilter?: string;
}>();

const emit = defineEmits<{
  filter: [estado: string];
}>();

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

.ingest-flow--collapsed {
  padding-bottom: 0.65rem;
}

.ingest-flow__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.ingest-flow__toggle:hover .ingest-flow__title {
  color: var(--brand);
}

.ingest-flow__title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.35;
  transition: color 0.15s ease;
}

.ingest-flow__chevron {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--ink-soft);
  transition: transform 0.2s ease, color 0.15s ease;
}

.ingest-flow__chevron--open {
  transform: rotate(180deg);
  color: var(--brand);
}

.ingest-flow__body {
  margin-top: 0.55rem;
}

.ingest-flow__track-wrap {
  width: 100%;
}

.ingest-flow__track {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-height: 5.75rem;
  gap: 0;
}

.ingest-flow__node {
  display: inline-flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.55rem 0.18rem 0.45rem;
  border: 1px solid color-mix(in srgb, var(--line) 75%, var(--brand));
  background: color-mix(in srgb, var(--panel) 88%, var(--brand));
  cursor: pointer;
  position: relative;
  min-width: 0;
  border-radius: 10px;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.ingest-flow__node:hover {
  background: color-mix(in srgb, var(--brand) 10%, var(--panel));
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
}

.ingest-flow__node--active {
  background: color-mix(in srgb, var(--brand) 14%, var(--panel));
  border-color: color-mix(in srgb, var(--brand) 50%, var(--line));
  box-shadow: 0 1px 3px color-mix(in srgb, var(--brand) 18%, transparent);
}

.ingest-flow__node--active .ingest-flow__icon {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 45%, transparent);
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

.ingest-flow__label {
  font-size: clamp(0.625rem, 1.15vw, 0.75rem);
  font-weight: 600;
  line-height: 1.15;
  color: var(--ink);
  letter-spacing: 0.01em;
  text-align: center;
  max-width: 100%;
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
  top: 0.2rem;
  right: 0.2rem;
  flex-shrink: 0;
  min-width: 1.2rem;
  height: 1.2rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1.2rem;
  text-align: center;
}

.ingest-flow__count--inline {
  position: static;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.15rem;
  vertical-align: middle;
}

.ingest-flow__arrow {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  align-self: center;
  padding: 0 0.15rem;
  color: color-mix(in srgb, var(--brand) 65%, var(--ink));
  font-size: clamp(0.6875rem, 1.25vw, 0.875rem);
  font-weight: 700;
  font-family: ui-monospace, "Cascadia Mono", monospace;
  letter-spacing: -0.06em;
  line-height: 1;
  text-align: center;
  user-select: none;
}

.ingest-flow__foot {
  margin: 0.45rem 0 0;
  min-height: 1.4rem;
  font-size: clamp(0.5625rem, 1.1vw, 0.75rem);
  color: var(--ink-faint);
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  width: 100%;
}

.ingest-flow__foot-group {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  flex-shrink: 1;
  overflow: hidden;
}

.ingest-flow__alt {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.15rem;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--warn);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  white-space: nowrap;
}

.ingest-flow__alt--error {
  color: var(--bad);
}

.ingest-flow__alt--clear {
  color: var(--brand);
  text-decoration: none;
  font-weight: 600;
}

.ingest-flow__alt--clear:hover {
  text-decoration: underline;
}

.ingest-flow__alt--muted {
  opacity: 0.55;
}

.ingest-flow__sep {
  opacity: 0.45;
  user-select: none;
}
</style>
