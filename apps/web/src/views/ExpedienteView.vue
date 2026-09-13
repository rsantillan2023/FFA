<template>
  <div class="expediente-view">
    <div v-if="loading" class="loading">Cargando expediente…</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>
    <div v-else-if="caso">
    <PageHeader
      page-key="expediente"
      :title="`Expediente ${caso.numero}`"
      :subtitle="expedienteSubtitle"
      :back-link="expedienteBackLink"
    >
      <template #extra>
        <p>
          Estado actual: <strong>{{ estadoLabel(caso.estado) }}</strong>
          <span v-if="caso.semaforo" class="expediente-semaforo">
            · Confianza:
            <SemaforoIndicator :value="caso.semaforo" />
          </span>
          <span v-if="progreso"> · Procesamiento: {{ progreso.progresoPct }}%</span>
        </p>
      </template>
      <template #actions>
        <RouterLink :to="{ name: 'casos' }" class="btn btn-ghost btn-sm">Bandeja de fichas</RouterLink>
        <RouterLink
          v-if="caso.estado === 'en_revision' || caso.estado === 'aprobado' || caso.estado === 'informe_generado'"
          :to="{ name: 'caso-revision', params: { id: casoId } }"
          class="btn btn-ghost btn-sm"
        >
          Revisión
        </RouterLink>
        <RouterLink
          v-if="caso.estado === 'aprobado' || caso.estado === 'informe_generado'"
          :to="{ name: 'caso-informe', params: { id: casoId } }"
          class="btn btn-primary btn-sm"
        >
          Informe
        </RouterLink>
        <button
          v-if="puedeReiniciarFojaCero"
          class="btn btn-ghost btn-sm btn-reinicio"
          type="button"
          @click="openReinicioModal"
        >
          Reiniciar a foja cero
        </button>
      </template>
    </PageHeader>

    <section class="card block">
      <h2>Avance del expediente</h2>
      <WorkflowDiagram
        :steps="workflowSteps"
        :caso-id="casoId"
        show-dates
        show-links
        :selected-id="selectedId"
        @select="selectedId = $event"
      />
    </section>

    <section class="card block proceso-block">
      <header class="proceso-block__head">
        <h2>Detalle del procesamiento automático</h2>
        <p class="proceso-block__lead">
          Pasos que el sistema ejecuta después de cargar la ficha. No hace falta conocer códigos internos.
        </p>
      </header>

      <div v-if="pipeline.length" class="proceso-resumen">
        <div class="proceso-resumen__text">
          <strong>{{ pipelineResumenData.completados }} de {{ pipelineResumenData.total }}</strong>
          pasos completados
          <span v-if="pipelineResumenData.pasoActual" class="proceso-resumen__actual">
            · Ahora: {{ pipelineResumenData.pasoActual }}
          </span>
        </div>
        <div
          class="proceso-resumen__bar"
          role="progressbar"
          :aria-valuenow="pipelineResumenData.pct"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`Avance del procesamiento: ${pipelineResumenData.pct} por ciento`"
        >
          <span class="proceso-resumen__fill" :style="{ width: `${pipelineResumenData.pct}%` }" />
        </div>
      </div>

      <ol v-if="pipeline.length" class="proceso-pasos">
        <li
          v-for="(e, index) in pipeline"
          :key="e.id"
          class="proceso-paso"
          :class="`proceso-paso--${pipelinePasoEstado(e, index, pipeline)}`"
        >
          <div class="proceso-paso__marker" aria-hidden="true">
            <i v-if="e.completada" class="fas fa-check"></i>
            <i v-else-if="pipelinePasoEstado(e, index, pipeline) === 'en_curso'" class="fas fa-spinner fa-spin"></i>
            <span v-else>{{ index + 1 }}</span>
          </div>
          <div class="proceso-paso__body">
            <div class="proceso-paso__title-row">
              <strong>{{ pipelineFriendlyMeta(e).titulo }}</strong>
              <span class="proceso-paso__badge">{{ pipelinePasoEstadoLabel(pipelinePasoEstado(e, index, pipeline)) }}</span>
            </div>
            <p class="proceso-paso__detalle">{{ pipelineDetalleAmigable(e) }}</p>
            <button
              type="button"
              class="proceso-paso__detalle-btn"
              :aria-label="`Ver detalle de ${pipelineFriendlyMeta(e).titulo}`"
              @click="abrirDetallePaso(e)"
            >
              <i class="fas fa-circle-info" aria-hidden="true"></i>
              Ver detalle
            </button>
          </div>
        </li>
      </ol>
      <p v-else class="empty">Todavía no hay información de procesamiento para este expediente.</p>
    </section>

    <details class="card block historial-panel">
      <summary class="historial-panel__summary">
        <span class="historial-panel__title">
          <i class="fas fa-clock-rotate-left" aria-hidden="true"></i>
          Historial de movimientos
        </span>
        <span v-if="historialItems.length" class="historial-panel__meta">
          {{ historialItems.length }} {{ historialItems.length === 1 ? "registro" : "registros" }}
          · último: {{ estadoLabel(historialItems[0]!.estado) }}
        </span>
        <span v-else class="historial-panel__meta">Sin registros</span>
      </summary>

      <ul v-if="historialItems.length" class="historial-timeline">
        <li v-for="(h, i) in historialItems" :key="i" class="historial-timeline__item">
          <div class="historial-timeline__dot" :class="historialDotClass(h.estado)" aria-hidden="true" />
          <div class="historial-timeline__content">
            <time :datetime="h.at">{{ formatHistorialDate(h.at) }}</time>
            <p class="historial-timeline__estado">{{ estadoLabel(h.estado) }}</p>
            <p v-if="h.nota" class="historial-timeline__nota">{{ h.nota }}</p>
          </div>
        </li>
      </ul>
      <p v-else class="empty historial-panel__empty">Sin movimientos registrados todavía.</p>
    </details>

    <PipelineEtapaModal
      v-model="detalleModalOpen"
      :loading="detalleLoading"
      :error="detalleError"
      :detalle="detallePaso"
    />

    <CreateFormModal
      v-if="reinicioModalOpen"
      v-model="reinicioModalOpen"
      title="Reiniciar a foja cero"
      :subtitle="caso ? `${caso.numero}${caso.referencia ? ` · ${caso.referencia}` : ''}` : ''"
    >
      <div class="reinicio-modal">
        <p class="reinicio-modal__lead">
          El sistema <strong>vuelve a leer el PDF con IA</strong> como si recién lo subieras. La ficha
          aprobada y el informe actual quedan <strong>archivados en el historial</strong>.
        </p>
        <ul class="reinicio-modal__list">
          <li>Se borran líneas, metadatos y validaciones de la lectura anterior</li>
          <li>Pipeline completo: preproceso → extracción IA → clasificación → revisión</li>
          <li>Deberás revisar y aprobar de nuevo antes de un informe nuevo</li>
        </ul>
        <label class="label" for="reinicio-motivo">Motivo (opcional)</label>
        <textarea
          id="reinicio-motivo"
          v-model="reinicioMotivo"
          class="input"
          rows="2"
          placeholder="Ej. PDF incorrecto, cambio de ejercicio, corrección de extracción…"
        />
        <p v-if="reinicioError" class="error-msg">{{ reinicioError }}</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" type="button" :disabled="reinicioSaving" @click="cerrarReinicioModal">
          Cancelar
        </button>
        <button class="btn btn-primary btn-reinicio-confirm" type="button" :disabled="reinicioSaving" @click="confirmReinicio">
          {{ reinicioSaving ? "Reiniciando…" : "Sí, reiniciar a foja cero" }}
        </button>
      </template>
    </CreateFormModal>

    <section v-if="progreso?.documentos?.length" class="card block">
      <h2>Documentos del expediente</h2>
      <ul>
        <li v-for="d in progreso!.documentos" :key="d.id">
          {{ d.nombre }}
          <span v-if="d.etapaActual"> — {{ d.etapaActual }}</span>
          <span v-if="d.progresoPct != null"> ({{ d.progresoPct }}%)</span>
        </li>
      </ul>
    </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CasoEstado,
  type CasoEstadoHistorialEntry,
  type CasoProgresoDto,
  type PipelineEtapaDetalleDto,
  type PipelineEtapaDto,
} from "@ffa/shared";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api, type CasoDetalleDto } from "../api/client";
import CreateFormModal from "../components/CreateFormModal.vue";
import PageHeader from "../components/PageHeader.vue";
import SemaforoIndicator from "../components/SemaforoIndicator.vue";
import PipelineEtapaModal from "../components/PipelineEtapaModal.vue";
import WorkflowDiagram from "../components/WorkflowDiagram.vue";
import { resolveWorkflowForCaso, type WorkflowStepView } from "../constants/workflow";
import { expedienteBackLink as resolveExpedienteBackLink } from "../utils/expedienteNavigation";
import { apiErrorMessage } from "../utils/apiError";
import { casoEstadoLabel } from "../utils/casoEstadoDisplay";
import { puedeReiniciarFojaCero as casoPuedeReiniciarFojaCero } from "../utils/casoAcciones";
import {
  pipelineDetalleAmigable,
  pipelineFriendlyMeta,
  pipelinePasoEstado,
  pipelinePasoEstadoLabel,
  pipelineResumen,
} from "../utils/pipelineDisplay";

const route = useRoute();
const casoId = computed(() => String(route.params.id ?? ""));

const expedienteBackLink = computed(() =>
  resolveExpedienteBackLink(typeof route.query.from === "string" ? route.query.from : null)
);

const loading = ref(true);
const error = ref<string | null>(null);
const caso = ref<CasoDetalleDto | null>(null);
const progreso = ref<CasoProgresoDto | null>(null);
const pipeline = ref<PipelineEtapaDto[]>([]);
const selectedId = ref<string>("carga");
const detalleModalOpen = ref(false);
const detalleLoading = ref(false);
const detalleError = ref<string | null>(null);
const detallePaso = ref<PipelineEtapaDetalleDto | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let loadSeq = 0;
let isMounted = false;

const reinicioModalOpen = ref(false);
const reinicioMotivo = ref("");
const reinicioSaving = ref(false);
const reinicioError = ref("");

const puedeReiniciarFojaCero = computed(() =>
  caso.value
    ? casoPuedeReiniciarFojaCero({
        documentosCount:
          caso.value.documentos?.length ??
          progreso.value?.documentos?.length ??
          0,
      })
    : false
);

const TERMINAL = new Set([
  CasoEstado.EN_REVISION,
  CasoEstado.APROBADO,
  CasoEstado.INFORME_GENERADO,
  CasoEstado.ERROR,
  CasoEstado.RECHAZADO,
  CasoEstado.CANCELADO,
]);

const workflowSteps = computed<WorkflowStepView[]>(() => {
  if (!caso.value) return [];
  return resolveWorkflowForCaso({
    estado: caso.value.estado,
    pipeline: pipeline.value,
    progresoPct: progreso.value?.progresoPct,
    etapaActual: progreso.value?.etapaActual,
    historial: caso.value.estadoHistorial,
  });
});

const pipelineResumenData = computed(() => pipelineResumen(pipeline.value));

const historialItems = computed<CasoEstadoHistorialEntry[]>(() => {
  const items = caso.value?.estadoHistorial ?? [];
  return [...items].reverse();
});

const ESTADOS_NEGATIVOS = new Set([
  CasoEstado.ERROR,
  CasoEstado.RECHAZADO,
  CasoEstado.CANCELADO,
]);

const ESTADOS_POSITIVOS = new Set([
  CasoEstado.APROBADO,
  CasoEstado.INFORME_GENERADO,
  CasoEstado.EN_REVISION,
]);

const expedienteSubtitle = computed(() => {
  const active = workflowSteps.value.find((s) => s.status === "active");
  return active
    ? `Etapa en curso: ${active.titulo}${active.detalle ? ` — ${active.detalle}` : ""}`
    : "Seguimiento nodo a nodo del procesamiento de la ficha.";
});

function estadoLabel(estado: string): string {
  return casoEstadoLabel(estado);
}

function formatHistorialDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function historialDotClass(estado: string): string {
  if (ESTADOS_NEGATIVOS.has(estado as CasoEstado)) return "historial-timeline__dot--warn";
  if (ESTADOS_POSITIVOS.has(estado as CasoEstado)) return "historial-timeline__dot--ok";
  return "historial-timeline__dot--neutral";
}

async function abrirDetallePaso(etapa: PipelineEtapaDto): Promise<void> {
  detalleModalOpen.value = true;
  detalleLoading.value = true;
  detalleError.value = null;
  detallePaso.value = null;
  try {
    detallePaso.value = await api.getPipelineEtapaDetalle(casoId.value, etapa.id);
  } catch (e) {
    detalleError.value = apiErrorMessage(e, "No se pudo cargar el detalle del paso");
  } finally {
    detalleLoading.value = false;
  }
}

async function load(options: { showSpinner?: boolean } = {}): Promise<void> {
  const showSpinner = options.showSpinner ?? !caso.value;
  const seq = ++loadSeq;
  if (showSpinner) loading.value = true;
  error.value = null;
  try {
    const [c, p, pl] = await Promise.all([
      api.getCaso(casoId.value),
      api.getCasoProgreso(casoId.value).catch(() => null),
      api.getPipelineEtapas(casoId.value).catch(() => []),
    ]);
    if (seq !== loadSeq) return;
    caso.value = c;
    progreso.value = p;
    pipeline.value = pl;
    const active = resolveWorkflowForCaso({
      estado: c.estado,
      pipeline: pl,
      progresoPct: p?.progresoPct,
      etapaActual: p?.etapaActual,
      historial: c.estadoHistorial,
    }).find((s) => s.status === "active");
    if (active) selectedId.value = active.id;
  } catch (e) {
    if (seq !== loadSeq) return;
    error.value = e instanceof Error ? e.message : "No se pudo cargar el expediente";
  } finally {
    if (seq === loadSeq && showSpinner) loading.value = false;
  }
}

function cerrarReinicioModal(): void {
  reinicioModalOpen.value = false;
}

watch(reinicioModalOpen, (open) => {
  if (!open) {
    reinicioSaving.value = false;
    reinicioError.value = "";
  }
});

function openReinicioModal(): void {
  reinicioSaving.value = false;
  reinicioMotivo.value = "";
  reinicioError.value = "";
  reinicioModalOpen.value = true;
}

async function confirmReinicio(): Promise<void> {
  reinicioSaving.value = true;
  reinicioError.value = "";
  try {
    await api.reiniciarFojaCero(casoId.value, reinicioMotivo.value.trim() || undefined);
    cerrarReinicioModal();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    await load({ showSpinner: true });
    if (isMounted && !pollTimer) {
      pollTimer = setInterval(refreshProgreso, 4000);
    }
  } catch (e) {
    reinicioError.value = apiErrorMessage(e, "No se pudo reiniciar el expediente");
  } finally {
    reinicioSaving.value = false;
  }
}

async function refreshProgreso(): Promise<void> {
  if (!isMounted || !caso.value || TERMINAL.has(caso.value.estado as CasoEstado)) return;
  try {
    const [p, pl] = await Promise.all([
      api.getCasoProgreso(casoId.value),
      api.getPipelineEtapas(casoId.value),
    ]);
    if (!isMounted) return;
    progreso.value = p;
    pipeline.value = pl;
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  isMounted = true;
  await load();
  if (!isMounted) return;
  pollTimer = setInterval(refreshProgreso, 4000);
});

onUnmounted(() => {
  isMounted = false;
  if (pollTimer) clearInterval(pollTimer);
});

watch(casoId, () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  caso.value = null;
  progreso.value = null;
  pipeline.value = [];
  void load({ showSpinner: true }).then(() => {
    if (!isMounted || pollTimer) return;
    pollTimer = setInterval(refreshProgreso, 4000);
  });
});
</script>

<style scoped>
.block {
  margin-bottom: 1rem;
}

.block h2 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--brand-ink);
}

.proceso-block__head {
  margin-bottom: 0.85rem;
}

.proceso-block__lead {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--ink-soft);
}

.btn-reinicio {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 40%, var(--line));
}

.reinicio-modal__lead {
  margin: 0 0 0.75rem;
  line-height: 1.45;
  color: var(--ink);
}

.reinicio-modal__list {
  margin: 0 0 1rem;
  padding-left: 1.2rem;
  font-size: 0.875rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.btn-reinicio-confirm {
  background: var(--warn);
  border-color: var(--warn);
}

.btn-reinicio-confirm:hover:not(:disabled) {
  filter: brightness(1.06);
}

.proceso-resumen {
  margin-bottom: 1rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-soft) 35%, var(--panel));
}

.proceso-resumen__text {
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.proceso-resumen__text strong {
  color: var(--brand-ink);
}

.proceso-resumen__actual {
  color: var(--ink);
}

.proceso-resumen__bar {
  height: 0.45rem;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}

.proceso-resumen__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--brand), color-mix(in srgb, var(--ok) 70%, var(--brand)));
  transition: width 0.35s ease;
}

.proceso-pasos {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.55rem;
}

.proceso-paso {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}

.proceso-paso--listo {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
  background: color-mix(in srgb, var(--ok) 6%, var(--panel));
}

.proceso-paso--en_curso {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand) 20%, transparent);
  background: color-mix(in srgb, var(--brand-soft) 45%, var(--panel));
}

.proceso-paso--pendiente {
  opacity: 0.88;
}

.proceso-paso__marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  background: var(--line);
  color: var(--ink-soft);
  font-size: 0.72rem;
  font-weight: 700;
  flex-shrink: 0;
}

.proceso-paso--listo .proceso-paso__marker {
  background: var(--ok);
  color: #fff;
}

.proceso-paso--en_curso .proceso-paso__marker {
  background: var(--brand);
  color: #fff;
}

.proceso-paso__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.55rem;
}

.proceso-paso__title-row strong {
  font-size: 0.86rem;
  color: var(--ink);
}

.proceso-paso__badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--line);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.proceso-paso--listo .proceso-paso__badge {
  background: color-mix(in srgb, var(--ok) 18%, var(--panel));
  color: var(--ok);
}

.proceso-paso--en_curso .proceso-paso__badge {
  background: var(--brand-soft);
  color: var(--brand-ink);
}

.proceso-paso__detalle {
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--ink-soft);
}

.proceso-paso__detalle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.45rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--brand);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.proceso-paso__detalle-btn:hover {
  color: var(--brand-ink);
}

.historial-panel {
  padding: 0;
  overflow: hidden;
}

.historial-panel__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
  padding: 0.85rem 1rem;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.historial-panel__summary::-webkit-details-marker {
  display: none;
}

.historial-panel__summary::after {
  content: "▾";
  margin-left: auto;
  color: var(--ink-faint);
  font-size: 0.85rem;
  transition: transform 0.2s ease;
}

.historial-panel[open] .historial-panel__summary::after {
  transform: rotate(180deg);
}

.historial-panel__title {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--brand-ink);
}

.historial-panel__meta {
  font-size: 0.75rem;
  color: var(--ink-faint);
}

.historial-panel__empty {
  padding: 0 1rem 1rem;
}

.historial-timeline {
  margin: 0;
  padding: 0 1rem 1rem 1.35rem;
  list-style: none;
}

.historial-timeline__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  position: relative;
  padding-bottom: 0.85rem;
}

.historial-timeline__item:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 0.42rem;
  top: 1.1rem;
  bottom: 0;
  width: 2px;
  background: var(--line);
}

.historial-timeline__dot {
  width: 0.85rem;
  height: 0.85rem;
  margin-top: 0.2rem;
  border-radius: 999px;
  border: 2px solid var(--line-2);
  background: var(--panel);
  flex-shrink: 0;
}

.historial-timeline__dot--ok {
  border-color: var(--ok);
  background: color-mix(in srgb, var(--ok) 25%, var(--panel));
}

.historial-timeline__dot--warn {
  border-color: var(--warn);
  background: color-mix(in srgb, var(--warn) 25%, var(--panel));
}

.historial-timeline__content time {
  display: block;
  font-size: 0.72rem;
  color: var(--ink-faint);
}

.historial-timeline__estado {
  margin: 0.15rem 0 0;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--ink);
}

.historial-timeline__nota {
  margin: 0.2rem 0 0;
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--ink-soft);
}

.expediente-semaforo {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.empty {
  margin: 0;
  color: var(--ink-faint);
  font-size: 0.85rem;
}

.loading {
  padding: 2rem;
  color: var(--ink-soft);
}
</style>
