<template>
  <CreateFormModal
    :model-value="modelValue"
    xl
    :title="titulo"
    :subtitle="subtitulo"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="proc-modal">
      <div v-if="loading && !progreso" class="proc-modal__loading">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        Consultando estado del procesamiento…
      </div>
      <p v-else-if="error" class="error-msg">{{ error }}</p>
      <template v-else-if="progreso">
        <div class="proc-modal__status" :class="`proc-modal__status--${motorClase}`">
          <i :class="motorIcono" aria-hidden="true"></i>
          <div>
            <strong>{{ motorTitulo }}</strong>
            <p v-if="progreso.motor?.detalle" class="proc-modal__status-hint">
              {{ progreso.motor.detalle }}
            </p>
          </div>
        </div>

        <div class="proc-modal__bar-wrap">
          <div
            class="proc-modal__bar"
            role="progressbar"
            :aria-valuenow="progreso.progresoPct"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="proc-modal__fill" :style="{ width: `${progreso.progresoPct}%` }" />
          </div>
          <strong class="proc-modal__pct">{{ progreso.progresoPct }}%</strong>
        </div>

        <dl class="proc-modal__facts">
          <div>
            <dt>Sub-fase activa</dt>
            <dd>{{ subFaseLabel }}</dd>
          </div>
          <div>
            <dt>Estado del caso</dt>
            <dd>{{ estadoLabel(progreso.estado) }}</dd>
          </div>
          <div>
            <dt>Espera en cola</dt>
            <dd>{{ tiempoEsperaCola }}</dd>
          </div>
          <div>
            <dt>Trabajo activo</dt>
            <dd>{{ tiempoTrabajoActivo }}</dd>
          </div>
          <div>
            <dt>Motor</dt>
            <dd>{{ progreso.motor?.backend ?? "—" }}</dd>
          </div>
          <div>
            <dt>Etapa técnica</dt>
            <dd>{{ etapaLabel }}</dd>
          </div>
        </dl>

        <p v-if="progreso.notaEtapa" class="proc-modal__nota">
          <i class="fas fa-circle-info" aria-hidden="true"></i>
          {{ progreso.notaEtapa }}
        </p>

        <p v-if="progreso.ultimoError" class="proc-modal__error-doc">
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          {{ progreso.ultimoError }}
        </p>

        <PipelineEtapasList
          v-if="pipelineEtapas?.length"
          titulo="Etapas del pipeline"
          :etapas="pipelineEtapas"
          :procesando="motorProcesando"
        />

        <section v-if="progreso.eventosRecientes?.length" class="proc-modal__log">
          <h3>Actividad reciente</h3>
          <ul>
            <li
              v-for="(ev, i) in progreso.eventosRecientes"
              :key="i"
              :class="ev.accion === 'alerta_trabado' ? 'proc-modal__log-warn' : undefined"
            >
              <time>{{ formatLogDate(ev.at) }}</time>
              <span>{{ ev.mensaje }}</span>
            </li>
          </ul>
        </section>

        <p v-else class="proc-modal__log-empty">
          Aún no hay eventos de extracción registrados — el job puede estar iniciando.
        </p>

        <p class="proc-modal__hint">
          En <strong>Lectura del documento</strong> hay tres sub-fases: cola (solo espera),
          preproceso PDF y extracción IA. Los tiempos de cola no son trabajo activo — en modo
          inline solo corre una extracción a la vez. El % avanza por etapas, no página a página.
        </p>
      </template>
    </div>
    <template #footer>
      <button class="btn btn-ghost" type="button" @click="emit('update:modelValue', false)">
        Cerrar
      </button>
      <button v-if="casoId" class="btn btn-primary" type="button" @click="emit('verDetalle', casoId)">
        Ver detalle completo
      </button>
    </template>
  </CreateFormModal>
</template>

<script setup lang="ts">
import { CasoEstado, type CasoProgresoDto, type PipelineEtapaDto } from "@ffa/shared";
import { computed } from "vue";
import CreateFormModal from "./CreateFormModal.vue";
import PipelineEtapasList from "./PipelineEtapasList.vue";
import { casoEstadoLabel } from "../utils/casoEstadoDisplay";
import {
  formatDuracionSegundos,
  pipelineSubPasoActivo,
} from "../utils/pipelineDisplay";

const props = defineProps<{
  modelValue: boolean;
  casoNumero?: string;
  casoId?: string;
  loading?: boolean;
  error?: string | null;
  progreso?: CasoProgresoDto | null;
  pipelineEtapas?: PipelineEtapaDto[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  verDetalle: [casoId: string];
}>();

const ETAPA_LABELS: Record<string, string> = {
  recibido: "Recibido",
  en_cola: "En cola",
  preprocess: "Preproceso del PDF",
  extract: "Extracción con IA",
  normalize: "Normalización",
  classify: "Clasificación de rubros",
  validate: "Validaciones",
  en_revision: "Listo para revisión",
  completado: "Completado",
  reinicio: "Reinicio",
  reprocess: "Reproceso",
};

const titulo = computed(() =>
  props.casoNumero ? `Procesamiento · ${props.casoNumero}` : "Estado del procesamiento"
);

const subtitulo = computed(() =>
  props.progreso?.pausado ? "Pausado" : "Actualización automática cada 2 s"
);

const etapaLabel = computed(() => {
  const k = props.progreso?.etapaActual;
  return k ? (ETAPA_LABELS[k] ?? k) : "—";
});

const etapaAA2 = computed(() => props.pipelineEtapas?.find((e) => e.id === "AA.2"));
const subActivo = computed(() =>
  etapaAA2.value ? pipelineSubPasoActivo(etapaAA2.value) : undefined
);

const motorProcesando = computed(() => {
  const e = props.progreso?.motor?.estado;
  if (props.progreso?.pausado) return false;
  return e === "activo" || e === "en_cola";
});

const subFaseLabel = computed(() => {
  const sub = subActivo.value;
  if (sub) return sub.label;
  if (props.progreso?.motor?.estado === "en_cola") return "En cola";
  return etapaLabel.value;
});

const tiempoEsperaCola = computed(() => {
  const sub = subActivo.value;
  if (sub?.estado === "espera" && sub.esperaSegundos != null) {
    return formatDuracionSegundos(sub.esperaSegundos);
  }
  const cola = etapaAA2.value?.subPasos?.find((s) => s.id === "cola");
  if (cola?.esperaSegundos != null && cola.esperaSegundos > 0) {
    return formatDuracionSegundos(cola.esperaSegundos);
  }
  if (props.progreso?.motor?.estado === "en_cola") return "En curso";
  return "—";
});

const tiempoTrabajoActivo = computed(() => {
  const sub = subActivo.value;
  if (sub?.estado === "en_curso" && sub.trabajoSegundos != null) {
    return formatDuracionSegundos(sub.trabajoSegundos);
  }
  if (props.progreso?.motor?.estado === "activo") {
    const s = props.progreso.segundosEnEtapa;
    if (s != null && s > 0) return formatDuracionSegundos(s);
    return "En curso";
  }
  return "—";
});

const extraccionEnCurso = computed(
  () =>
    props.progreso?.estado === CasoEstado.EXTRAYENDO ||
    props.progreso?.etapaActual === "extract"
);

const motorClase = computed(() => {
  const e = props.progreso?.motor?.estado;
  if (props.progreso?.pausado) return "pausado";
  if (e === "activo") return "activo";
  if (e === "en_cola") return "cola";
  if (e === "inactivo") return "inactivo";
  if (e === "desconocido" && extraccionEnCurso.value) return "activo";
  return "neutral";
});

const motorTitulo = computed(() => {
  if (props.progreso?.pausado) return "Procesamiento pausado";
  const sub = subActivo.value;
  if (sub?.estado === "espera") return "En cola — esperando turno";
  if (sub?.estado === "en_curso") return `${sub.label} en curso`;
  const e = props.progreso?.motor?.estado;
  if (e === "desconocido" && extraccionEnCurso.value) {
    return "Extracción IA en curso";
  }
  switch (e) {
    case "activo":
      return extraccionEnCurso.value ? "Extracción IA en curso" : "Job en ejecución";
    case "en_cola":
      return "En cola — esperando turno";
    case "inactivo":
      return extraccionEnCurso.value
        ? "Extracción detenida — posible trabado"
        : "Sin actividad detectada";
    case "pausado":
      return "Pausado";
    default:
      return "Estado del procesamiento";
  }
});

const motorIcono = computed(() => {
  if (extraccionEnCurso.value && motorClase.value === "activo") {
    return "fas fa-wand-magic-sparkles fa-spin";
  }
  switch (motorClase.value) {
    case "activo":
      return "fas fa-gears fa-spin";
    case "cola":
      return "fas fa-hourglass-half";
    case "inactivo":
      return "fas fa-circle-exclamation";
    case "pausado":
      return "fas fa-pause";
    default:
      return "fas fa-circle-info";
  }
});

function estadoLabel(estado: string): string {
  return casoEstadoLabel(estado);
}

function formatLogDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
</script>

<style scoped>
.proc-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.proc-modal__loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.proc-modal__status {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.75rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--line);
}

.proc-modal__status--activo {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand) 8%, var(--panel-2));
  color: var(--brand-ink);
}

.proc-modal__status--cola {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--line));
  background: var(--warn-bg);
  color: var(--warn);
}

.proc-modal__status--inactivo {
  border-color: color-mix(in srgb, var(--bad) 35%, var(--line));
  background: var(--bad-bg);
  color: var(--bad);
}

.proc-modal__status--pausado {
  border-color: var(--line);
  background: var(--panel-2);
}

.proc-modal__status-hint {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  font-weight: 400;
  line-height: 1.4;
  opacity: 0.95;
}

.proc-modal__bar-wrap {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.proc-modal__bar {
  flex: 1;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--panel-2);
  overflow: hidden;
}

.proc-modal__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--brand), color-mix(in srgb, var(--brand) 70%, #6366f1));
  transition: width 0.4s ease;
}

.proc-modal__pct {
  font-variant-numeric: tabular-nums;
  min-width: 2.5rem;
  text-align: right;
}

.proc-modal__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem 1rem;
  margin: 0;
}

@media (max-width: 640px) {
  .proc-modal__facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.proc-modal__facts dt {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
}

.proc-modal__facts dd {
  margin: 0.15rem 0 0;
  font-size: 0.88rem;
  color: var(--ink);
}

.proc-modal__nota,
.proc-modal__error-doc {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
}

.proc-modal__nota {
  background: var(--panel-2);
  color: var(--ink-soft);
}

.proc-modal__error-doc {
  background: var(--bad-bg);
  color: var(--bad);
  border: 1px solid color-mix(in srgb, var(--bad) 25%, var(--line));
}

.proc-modal__log h3 {
  margin: 0 0 0.5rem;
  font-size: 0.88rem;
}

.proc-modal__log ul {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel-2);
}

.proc-modal__log li {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  font-size: 0.78rem;
  border-bottom: 1px solid var(--line);
}

.proc-modal__log li:last-child {
  border-bottom: none;
}

.proc-modal__log-warn {
  background: color-mix(in srgb, var(--warn) 10%, var(--panel-2));
  color: var(--warn);
  font-weight: 600;
}

.proc-modal__log time {
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}

.proc-modal__log-empty {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.proc-modal__hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ink-soft);
  line-height: 1.45;
  padding-top: 0.25rem;
  border-top: 1px dashed var(--line);
}
</style>
