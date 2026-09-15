<template>
  <Teleport to="body">
    <div v-if="modelValue" class="cdm-backdrop" @click.self="close">
      <div
        class="cdm"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.stop
      >
        <!-- Header -->
        <header class="cdm-hero">
          <div class="cdm-hero__main">
            <div class="cdm-hero__icon" aria-hidden="true">
              <i class="fas fa-folder-open"></i>
            </div>
            <div class="cdm-hero__text">
              <p class="cdm-hero__eyebrow">Detalle de ficha</p>
              <h2 :id="titleId" class="cdm-hero__title">
                {{ detalle?.numero ?? "Cargando…" }}
              </h2>
              <p v-if="referenciaTitulo" class="cdm-hero__ref">{{ referenciaTitulo }}</p>
              <p v-if="identidadTitulo" class="cdm-hero__ident">{{ identidadTitulo }}</p>
              <div v-if="detalle" class="cdm-hero__badges">
                <span class="cdm-badge cdm-badge--estado" :class="`cdm-badge--${detalle.estado}`">
                  <i :class="estadoIcon(detalle.estado)" aria-hidden="true"></i>
                  {{ estadoLabel(detalle.estado) }}
                </span>
                <span
                  v-if="procEstadoLabel"
                  class="cdm-badge"
                  :class="procEstadoLabel === 'En curso' ? 'cdm-badge--proc-curso' : 'cdm-badge--proc-det'"
                  :title="procEstadoTooltip"
                >
                  {{ procEstadoLabel }}
                </span>
                <span v-if="detalle.semaforo" class="cdm-badge cdm-badge--semaforo">
                  <SemaforoIndicator :value="detalle.semaforo" size="lg" />
                </span>
                <span v-if="detalle.procesamientoPausado" class="cdm-badge cdm-badge--pausa">
                  <i class="fas fa-pause" aria-hidden="true"></i>
                  Pausado
                </span>
              </div>
            </div>
          </div>
          <div class="cdm-hero__actions">
            <RouterLink
              v-if="detalle"
              :to="{
                name: 'caso-expediente',
                params: { id: detalle.id },
                query: expedienteFromQuery,
              }"
              class="btn btn-ghost btn-sm cdm-btn-light"
              @click="close"
            >
              <i class="fas fa-route" aria-hidden="true"></i>
              Expediente
            </RouterLink>
            <button type="button" class="cdm-close" aria-label="Cerrar" @click="close">
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>
        </header>

        <div class="cdm-body">
          <!-- Loading -->
          <div v-if="loading" class="cdm-state">
            <div class="cdm-spinner" aria-hidden="true"></div>
            <p>Cargando información de la ficha…</p>
          </div>

          <!-- Error -->
          <div v-else-if="error" class="cdm-state cdm-state--error">
            <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
            <p>{{ error }}</p>
          </div>

          <template v-else-if="detalle">
            <!-- KPIs -->
            <div class="cdm-kpis">
              <article class="cdm-kpi cdm-kpi--confianza">
                <button
                  type="button"
                  class="cdm-kpi__ring-btn"
                  aria-label="Ver desglose de confianza de clasificación"
                  title="Clic para ver desglose iconográfico"
                  @click="showConfianzaPanel = !showConfianzaPanel"
                >
                  <div class="cdm-kpi__ring" :style="confianzaRingStyle">
                    <span class="cdm-kpi__ring-val">{{ confianzaDisplay }}</span>
                  </div>
                </button>
                <div>
                  <div class="cdm-kpi__label-row">
                    <p class="cdm-kpi__label">Confianza de clasificación</p>
                    <button
                      type="button"
                      class="cdm-kpi__info"
                      :aria-label="CONFIANZA_AYUDA"
                      :title="CONFIANZA_AYUDA"
                      @click="showConfianzaPanel = !showConfianzaPanel"
                    >
                      <i class="fas fa-circle-info" aria-hidden="true"></i>
                    </button>
                  </div>
                  <p class="cdm-kpi__hint">{{ confianzaResumen }}</p>
                </div>
              </article>
              <article class="cdm-kpi">
                <div class="cdm-kpi__icon cdm-kpi__icon--brand">
                  <i class="fas fa-table-list" aria-hidden="true"></i>
                </div>
                <div>
                  <p class="cdm-kpi__value">{{ lineasCount }}</p>
                  <p class="cdm-kpi__label">Líneas leídas</p>
                </div>
              </article>
              <article class="cdm-kpi">
                <div class="cdm-kpi__icon" :class="validacionesOk ? 'cdm-kpi__icon--ok' : 'cdm-kpi__icon--warn'">
                  <i class="fas fa-shield-check" aria-hidden="true"></i>
                </div>
                <div>
                  <p class="cdm-kpi__value">{{ validacionesResumen }}</p>
                  <p class="cdm-kpi__label">Validaciones</p>
                </div>
              </article>
              <article class="cdm-kpi">
                <div class="cdm-kpi__icon cdm-kpi__icon--muted">
                  <i class="fas fa-file-pdf" aria-hidden="true"></i>
                </div>
                <div>
                  <p class="cdm-kpi__value">{{ detalle.documentos?.length ?? 0 }}</p>
                  <p class="cdm-kpi__label">Documento(s)</p>
                </div>
              </article>
            </div>

            <ConfianzaSemaforoPanel
              v-if="detalle"
              :open="showConfianzaPanel"
              :caso-id="detalle.id"
              :confianza-global="detalle.confianzaGlobal"
              :semaforo="detalle.semaforo"
              inline
              @close="showConfianzaPanel = false"
            />

            <!-- Progreso -->
            <section v-if="progreso || pipelineResumenData.total" class="cdm-card cdm-progreso">
              <div class="cdm-card__head">
                <h3><i class="fas fa-gears" aria-hidden="true"></i> Avance del documento</h3>
                <span v-if="pipelineResumenData.pasoActual" class="cdm-chip cdm-chip--active">
                  {{ pipelineResumenData.pasoActual }}
                </span>
                <span v-else-if="pipelineResumenData.pct === 100" class="cdm-chip cdm-chip--ok">
                  <i class="fas fa-check" aria-hidden="true"></i> Completado
                </span>
              </div>
              <div class="cdm-progreso__bar-wrap">
                <div
                  class="cdm-progreso__bar"
                  role="progressbar"
                  :aria-valuenow="progresoPct"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div class="cdm-progreso__fill" :style="{ width: `${progresoPct}%` }" />
                </div>
                <strong class="cdm-progreso__pct">{{ progresoPct }}%</strong>
              </div>
              <p class="cdm-progreso__meta">
                {{ pipelineResumenData.completados }} de {{ pipelineResumenData.total }} pasos listos
                <span v-if="etapaActualLabel">
                  · Paso actual: {{ etapaActualLabel }}
                </span>
              </p>

              <!-- Stepper horizontal -->
              <div v-if="pipelineEtapas?.length" class="cdm-stepper">
                <div
                  v-for="(e, index) in pipelineEtapas"
                  :key="e.id"
                  class="cdm-step"
                  :class="`cdm-step--${pipelinePasoEstado(e, index, pipelineEtapas)}`"
                  :title="pipelineFriendlyMeta(e).titulo"
                >
                  <div class="cdm-step__node">
                    <i v-if="e.completada" class="fas fa-check" aria-hidden="true"></i>
                    <i
                      v-else-if="pipelinePasoEstado(e, index, pipelineEtapas) === 'en_curso'"
                      class="fas fa-spinner fa-spin"
                      aria-hidden="true"
                    ></i>
                    <i v-else :class="pipelineStepIcon(e.id)" aria-hidden="true"></i>
                  </div>
                  <span class="cdm-step__label">{{ pipelineFriendlyMeta(e).titulo }}</span>
                  <span
                    v-if="pipelineEtapaProgresoPct(e) != null"
                    class="cdm-step__pct"
                  >{{ pipelineEtapaProgresoPct(e) }}%</span>
                </div>
              </div>
            </section>

            <!-- Meta rápida -->
            <div class="cdm-meta-row">
              <span><i class="fas fa-inbox" aria-hidden="true"></i> {{ canalLabel(detalle.canal) }}</span>
              <span v-if="remitenteDisplay">
                <i class="fas fa-envelope" aria-hidden="true"></i>
                {{ remitenteDisplay }}
              </span>
              <span v-if="detalle.moneda">
                <i class="fas fa-coins" aria-hidden="true"></i>
                {{ detalle.moneda }} ({{ detalle.escala ?? "—" }})
              </span>
              <span
                v-if="detalle.diferenciaCuadraturaPct != null"
                :class="detalle.cuadraturaOk ? 'cdm-meta--ok' : 'cdm-meta--fail'"
                :title="cuadraturaTooltip"
              >
                <i class="fas fa-scale-balanced" aria-hidden="true"></i>
                Δ {{ formatDiferenciaCuadraturaPct(detalle.diferenciaCuadraturaPct) }}
              </span>
              <span v-if="detalle.prioridad">
                <i class="fas fa-arrow-up" aria-hidden="true"></i>
                Prioridad P{{ detalle.prioridad }}
              </span>
              <span>
                <i class="fas fa-calendar" aria-hidden="true"></i>
                {{ formatDateShort(detalle.createdAt) }}
              </span>
              <span v-if="lineasRevisionCount">
                <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                {{ lineasRevisionCount }} línea(s) a revisar
              </span>
            </div>

            <p v-if="detalle.observaciones?.trim()" class="cdm-obs">
              <i class="fas fa-note-sticky" aria-hidden="true"></i>
              {{ detalle.observaciones.trim() }}
            </p>

            <!-- Tabs -->
            <nav class="cdm-tabs" role="tablist" aria-label="Secciones del detalle">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                type="button"
                role="tab"
                class="cdm-tab"
                :class="{ 'cdm-tab--active': activeTab === tab.id }"
                :aria-selected="activeTab === tab.id"
                @click="activeTab = tab.id"
              >
                <i :class="tab.icon" aria-hidden="true"></i>
                {{ tab.label }}
                <span v-if="tab.count != null" class="cdm-tab__count">{{ tab.count }}</span>
              </button>
            </nav>

            <!-- Tab: Resumen pipeline detallado -->
            <section v-show="activeTab === 'resumen'" class="cdm-tab-panel" role="tabpanel">
              <div v-if="pipelineEtapas?.length" class="cdm-pipeline-list">
                <article
                  v-for="(e, index) in pipelineEtapas"
                  :key="e.id"
                  class="cdm-pipeline-item"
                  :class="`cdm-pipeline-item--${pipelinePasoEstado(e, index, pipelineEtapas)}`"
                >
                  <div class="cdm-pipeline-item__icon">
                    <i :class="pipelineStepIcon(e.id)" aria-hidden="true"></i>
                  </div>
                  <div class="cdm-pipeline-item__body">
                    <div class="cdm-pipeline-item__head">
                      <strong>{{ pipelineFriendlyMeta(e).titulo }}</strong>
                      <span
                        v-if="pipelineEtapaProgresoPct(e) != null"
                        class="cdm-chip cdm-chip--sm cdm-chip--pct"
                      >{{ pipelineEtapaProgresoPct(e) }}%</span>
                      <span class="cdm-chip cdm-chip--sm" :class="chipClass(pipelinePasoEstado(e, index, pipelineEtapas))">
                        {{ pipelinePasoEstadoLabel(pipelinePasoEstado(e, index, pipelineEtapas)) }}
                      </span>
                    </div>
                    <p>{{ pipelineDetalleAmigable(e) }}</p>
                  </div>
                </article>
              </div>
              <div v-else class="cdm-empty">
                <i class="fas fa-hourglass-start" aria-hidden="true"></i>
                <p>El procesamiento aún no comenzó para esta ficha.</p>
              </div>
            </section>

            <!-- Tab: Líneas -->
            <section v-show="activeTab === 'lineas'" class="cdm-tab-panel" role="tabpanel">
              <div v-if="lineasLoading" class="cdm-state cdm-state--inline">
                <div class="cdm-spinner cdm-spinner--sm" aria-hidden="true"></div>
                <p>Leyendo líneas contables…</p>
              </div>
              <div v-else-if="lineas?.length" class="cdm-table-wrap">
                <table class="cdm-table">
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th>Rubro</th>
                      <th class="num">Monto</th>
                      <th class="num">Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="l in lineas"
                      :key="l.id"
                      :class="{ 'cdm-row--warn': l.requiereRevision }"
                    >
                      <td>
                        <span v-if="l.requiereRevision" class="cdm-row-flag" title="Requiere revisión">
                          <i class="fas fa-flag" aria-hidden="true"></i>
                        </span>
                        {{ l.denominacionOriginal }}
                      </td>
                      <td>
                        <span v-if="l.rubroCodigo" class="cdm-rubro">{{ l.rubroCodigo }}</span>
                        <span v-else class="cdm-muted">Sin rubro</span>
                      </td>
                      <td class="num">{{ formatMonto(l.montoNormalizado ?? l.montoOriginal) }}</td>
                      <td class="num">
                        <span
                          class="cdm-conf-bar"
                          :style="{ '--pct': `${l.confianzaClasificacion ?? l.confianzaExtraccion ?? 0}%` }"
                        >
                          {{ l.confianzaClasificacion ?? l.confianzaExtraccion ?? "—" }}%
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="cdm-empty">
                <i class="fas fa-table" aria-hidden="true"></i>
                <p>Todavía no hay líneas extraídas del documento.</p>
                <small>Aparecerán cuando el sistema termine de leer el PDF.</small>
              </div>
            </section>

            <!-- Tab: Validaciones -->
            <section v-show="activeTab === 'validaciones'" class="cdm-tab-panel" role="tabpanel">
              <ul v-if="detalle.validaciones?.length" class="cdm-val-list">
                <li
                  v-for="v in detalle.validaciones"
                  :key="v.id"
                  class="cdm-val-item"
                  :class="v.passed ? 'cdm-val-item--ok' : 'cdm-val-item--fail'"
                >
                  <div class="cdm-val-item__icon">
                    <i :class="v.passed ? 'fas fa-circle-check' : 'fas fa-circle-xmark'" aria-hidden="true"></i>
                  </div>
                  <div>
                    <strong>{{ v.tipo.replace(/_/g, " ") }}</strong>
                    <p>{{ v.mensaje }}</p>
                    <span v-if="v.confirmadaPorAnalista" class="cdm-chip cdm-chip--sm cdm-chip--ok">
                      Confirmada por analista
                    </span>
                  </div>
                </li>
              </ul>
              <div v-else class="cdm-empty">
                <i class="fas fa-shield" aria-hidden="true"></i>
                <p>Sin validaciones registradas todavía.</p>
              </div>
            </section>

            <!-- Tab: Documentos -->
            <section v-show="activeTab === 'documentos'" class="cdm-tab-panel" role="tabpanel">
              <div v-if="detalle.documentos?.length" class="cdm-doc-grid">
                <article v-for="d in detalle.documentos" :key="d.id" class="cdm-doc-card">
                  <div class="cdm-doc-card__icon">
                    <i :class="docIcon(d.mimeType)" aria-hidden="true"></i>
                  </div>
                  <div class="cdm-doc-card__body">
                    <strong>{{ d.nombreOriginal }}</strong>
                    <p>{{ calidadLabel(d.calidadOrigen) }}</p>
                    <div class="cdm-doc-card__meta">
                      <span><i class="fas fa-file" aria-hidden="true"></i> {{ d.paginaCount }} pág.</span>
                      <span v-if="d.remitenteEmail">
                        <i class="fas fa-envelope" aria-hidden="true"></i> {{ d.remitenteEmail }}
                      </span>
                      <span v-if="d.procesamiento?.etapaActual">
                        <i class="fas fa-cog" aria-hidden="true"></i> {{ d.procesamiento.etapaActual }}
                      </span>
                    </div>
                  </div>
                </article>
              </div>
              <div v-else class="cdm-empty">
                <i class="fas fa-file-circle-xmark" aria-hidden="true"></i>
                <p>No hay documentos asociados.</p>
              </div>
            </section>

            <!-- Tab: Historial -->
            <section v-show="activeTab === 'historial'" class="cdm-tab-panel" role="tabpanel">
              <ol v-if="detalle.estadoHistorial?.length" class="cdm-timeline">
                <li
                  v-for="(h, i) in historialReversed"
                  :key="i"
                  class="cdm-timeline__item"
                  :class="timelineClass(h.estado)"
                >
                  <div class="cdm-timeline__dot" aria-hidden="true">
                    <i :class="estadoIcon(h.estado)"></i>
                  </div>
                  <div class="cdm-timeline__content">
                    <time>{{ formatDate(h.at) }}</time>
                    <strong>{{ estadoLabel(h.estado) }}</strong>
                    <p v-if="h.nota">{{ h.nota }}</p>
                  </div>
                </li>
              </ol>
              <div v-else class="cdm-empty">
                <i class="fas fa-clock-rotate-left" aria-hidden="true"></i>
                <p>Sin movimientos en el historial.</p>
              </div>
            </section>
          </template>
        </div>

        <footer class="cdm-foot">
          <RouterLink
            v-if="detalle && canRevision"
            :to="{ name: 'caso-revision', params: { id: detalle.id } }"
            class="btn btn-primary btn-sm"
            @click="close"
          >
            <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
            Ir a revisión
          </RouterLink>
          <RouterLink
            v-if="detalle && canInforme"
            :to="{ name: 'caso-informe', params: { id: detalle.id } }"
            class="btn btn-ghost btn-sm"
            @click="close"
          >
            <i class="fas fa-file-lines" aria-hidden="true"></i>
            Ver informe
          </RouterLink>
          <button type="button" class="btn btn-primary" @click="close">Cerrar</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  CasoEstado,
  casoReferenciaGrilla,
  formatDiferenciaCuadraturaPct,
  type CasoProgresoDto,
  type LineaContableDto,
  type PipelineEtapaDto,
} from "@ffa/shared";
import { computed, onMounted, onUnmounted, ref, useId, watch } from "vue";
import { RouterLink } from "vue-router";
import type { CasoDetalleDto } from "../api/client";
import ConfianzaSemaforoPanel from "./ConfianzaSemaforoPanel.vue";
import SemaforoIndicator from "./SemaforoIndicator.vue";
import { puedeIrARevision, puedeVerInforme } from "../utils/casoAcciones";
import { casoEstadoLabel } from "../utils/casoEstadoDisplay";
import {
  pipelineDetalleAmigable,
  pipelineEtapaProgresoPct,
  pipelineFriendlyMeta,
  pipelinePasoEstado,
  pipelinePasoEstadoLabel,
  pipelineResumen,
  type PipelinePasoEstado,
} from "../utils/pipelineDisplay";

const PROCESSING_ESTADOS = new Set<string>([
  CasoEstado.RECIBIDO,
  CasoEstado.EN_COLA,
  CasoEstado.PREPROCESANDO,
  CasoEstado.EXTRAYENDO,
  CasoEstado.NORMALIZANDO,
  CasoEstado.CLASIFICANDO,
  CasoEstado.VALIDANDO,
]);

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    loading?: boolean;
    error?: string | null;
    detalle?: CasoDetalleDto | null;
    lineas?: LineaContableDto[];
    lineasLoading?: boolean;
    progreso?: CasoProgresoDto | null;
    pipelineEtapas?: PipelineEtapaDto[];
    /** Origen para el enlace «Expediente» y la navegación de retorno. */
    expedienteFrom?: "casos" | "repositorio" | "flujo" | "dashboard";
  }>(),
  { expedienteFrom: "casos" }
);

const expedienteFromQuery = computed(() => ({ from: props.expedienteFrom }));

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const titleId = useId();
const activeTab = ref<"resumen" | "lineas" | "validaciones" | "documentos" | "historial">("resumen");
const showConfianzaPanel = ref(false);

watch(
  () => props.modelValue,
  (open) => {
    if (open) activeTab.value = "resumen";
    else showConfianzaPanel.value = false;
  }
);

const ESTADO_ICONS: Record<string, string> = {
  [CasoEstado.EN_REVISION]: "fas fa-user-pen",
  [CasoEstado.APROBADO]: "fas fa-circle-check",
  [CasoEstado.INFORME_GENERADO]: "fas fa-file-circle-check",
  [CasoEstado.ERROR]: "fas fa-circle-exclamation",
  [CasoEstado.PENDIENTE_CALIDAD]: "fas fa-wand-magic-sparkles",
  [CasoEstado.RECHAZADO]: "fas fa-ban",
  [CasoEstado.CANCELADO]: "fas fa-xmark",
};

const PIPELINE_ICONS: Record<string, string> = {
  "AA.1": "fas fa-inbox",
  "AA.2": "fas fa-file-lines",
  "AA.3": "fas fa-coins",
  "AA.4": "fas fa-tags",
  "AA.5": "fas fa-shield-halved",
  "AA.6": "fas fa-user-check",
  "AA.7": "fas fa-chart-line",
  "AA.8": "fas fa-file-contract",
};

const pipelineResumenData = computed(() => pipelineResumen(props.pipelineEtapas ?? []));

const progresoPct = computed(
  () => props.progreso?.progresoPct ?? pipelineResumenData.value.pct
);

const lineasCount = computed(
  () => props.lineas?.length ?? props.detalle?.lineasCount ?? 0
);

const lineasRevisionCount = computed(
  () => props.lineas?.filter((l) => l.requiereRevision).length ?? 0
);

const validacionesOk = computed(
  () => (props.detalle?.validaciones ?? []).every((v) => v.passed)
);

const validacionesResumen = computed(() => {
  const vals = props.detalle?.validaciones ?? [];
  if (!vals.length) return "—";
  const ok = vals.filter((v) => v.passed).length;
  return `${ok}/${vals.length} OK`;
});

const CONFIANZA_AYUDA =
  "Promedio de confianza de clasificación al plan de cuentas institucional (no es la calidad de lectura del PDF). " +
  "Por ejemplo, 51 % suele indicar muchas líneas sin rubro o clasificación incierta. " +
  "Clic en el anillo o en ℹ para ver el desglose iconográfico.";

const ETAPA_ACTUAL_LABEL: Record<string, string> = {
  receive: "recepción del documento",
  queue: "en cola",
  preprocess: "preprocesamiento",
  extract: "lectura del PDF",
  normalize: "normalización de montos",
  classify: "clasificación de rubros",
  validate: "validaciones automáticas",
};

const confianzaDisplay = computed(() => {
  const c = props.detalle?.confianzaGlobal;
  return c != null ? `${c}%` : "—";
});

const confianzaResumen = computed(() => {
  const c = props.detalle?.confianzaGlobal;
  if (c == null) return "Aún sin calcular";
  if (c >= 85) return "Alta — pocas líneas dudosas";
  if (c >= 60) return "Media — conviene revisar algunas líneas";
  if (c > 0) return "Baja — revisar con atención";
  return "Sin procesar aún";
});

const etapaActualLabel = computed(() => {
  const e = props.progreso?.etapaActual;
  if (!e) return null;
  return ETAPA_ACTUAL_LABEL[e] ?? e;
});

const confianzaRingStyle = computed(() => {
  const c = props.detalle?.confianzaGlobal ?? 0;
  const color =
    c >= 85 ? "var(--ok)" : c >= 60 ? "var(--warn)" : c > 0 ? "var(--bad)" : "var(--line)";
  return {
    background: `conic-gradient(${color} ${c * 3.6}deg, var(--line) 0deg)`,
  };
});

const historialReversed = computed(
  () => [...(props.detalle?.estadoHistorial ?? [])].reverse()
);

const canRevision = computed(() =>
  props.detalle ? puedeIrARevision(props.detalle.estado) : false
);

const canInforme = computed(() => puedeVerInforme(props.detalle?.hasInforme));

const referenciaTitulo = computed(() => {
  if (!props.detalle) return "";
  return casoReferenciaGrilla(props.detalle);
});

const identidadTitulo = computed(() => {
  const d = props.detalle;
  if (!d) return "";
  const id = d.identidadResuelta;
  if (id?.razonSocial?.trim()) {
    return id.rut?.trim() ? `${id.razonSocial.trim()} · ${id.rut.trim()}` : id.razonSocial.trim();
  }
  if (d.contribuyente?.razonSocial) {
    const rs = d.contribuyente.razonSocial;
    return d.contribuyente.rut ? `${rs} · ${d.contribuyente.rut}` : rs;
  }
  return "";
});

const remitenteDisplay = computed(() => {
  const d = props.detalle;
  if (!d) return "";
  return (
    d.remitenteEmail?.trim() ||
    d.documentos?.find((doc) => doc.remitenteEmail?.trim())?.remitenteEmail?.trim() ||
    ""
  );
});

const cuadraturaTooltip = computed(() => {
  const d = props.detalle;
  if (!d || d.diferenciaCuadraturaPct == null) {
    return "Sin validación de cuadratura aún";
  }
  if (d.cuadraturaOk) {
    return "Cuadratura OK: Activo = Pasivo + Patrimonio neto";
  }
  return `Desbalance: ${formatDiferenciaCuadraturaPct(d.diferenciaCuadraturaPct)} entre Activo y Pasivo + Patrimonio neto`;
});

const procEstadoLabel = computed((): "En curso" | "Detenido" | null => {
  const d = props.detalle;
  if (!d || !PROCESSING_ESTADOS.has(d.estado)) return null;
  if (d.procesamientoPausado || props.progreso?.pausado) return "Detenido";
  const motor = props.progreso?.motor?.estado;
  if (motor === "inactivo") return "Detenido";
  return "En curso";
});

const procEstadoTooltip = computed(() => {
  if (procEstadoLabel.value === "Detenido") {
    return props.progreso?.ultimoError
      ? `Procesamiento detenido: ${props.progreso.ultimoError}`
      : "Procesamiento detenido — sin avance ni job activo.";
  }
  if (procEstadoLabel.value === "En curso") {
    return props.progreso?.motor?.estado === "en_cola"
      ? "En cola — esperando turno en el worker."
      : "Procesamiento automático en marcha.";
  }
  return "";
});

const tabs = computed(() => [
  { id: "resumen" as const, label: "Proceso", icon: "fas fa-list-check", count: null },
  {
    id: "lineas" as const,
    label: "Líneas",
    icon: "fas fa-table",
    count: lineasCount.value || null,
  },
  {
    id: "validaciones" as const,
    label: "Validaciones",
    icon: "fas fa-shield-check",
    count: props.detalle?.validaciones?.length || null,
  },
  {
    id: "documentos" as const,
    label: "Documentos",
    icon: "fas fa-file-pdf",
    count: props.detalle?.documentos?.length || null,
  },
  {
    id: "historial" as const,
    label: "Historial",
    icon: "fas fa-clock-rotate-left",
    count: props.detalle?.estadoHistorial?.length || null,
  },
]);

function close(): void {
  emit("update:modelValue", false);
}

function estadoLabel(estado: string): string {
  return casoEstadoLabel(estado);
}

function estadoIcon(estado: string): string {
  return ESTADO_ICONS[estado] ?? "fas fa-circle-dot";
}

function pipelineStepIcon(id: string): string {
  return PIPELINE_ICONS[id] ?? "fas fa-circle";
}

function canalLabel(canal: string): string {
  if (canal === "correo") return "Correo electrónico";
  if (canal === "portal") return "Portal web";
  if (canal === "manual_alternativa") return "Carga manual";
  return canal;
}

function calidadLabel(q: string): string {
  const map: Record<string, string> = {
    nativo: "PDF nativo — buena calidad",
    escaneado_legible: "Escaneado legible",
    degradado: "Calidad degradada",
    ilegible: "Ilegible — revisar",
    pendiente: "Calidad pendiente",
  };
  return map[q] ?? q;
}

function docIcon(mime: string): string {
  if (mime.includes("pdf")) return "fas fa-file-pdf";
  if (mime.includes("image")) return "fas fa-file-image";
  return "fas fa-file";
}

function chipClass(estado: PipelinePasoEstado): string {
  if (estado === "listo") return "cdm-chip--ok";
  if (estado === "en_curso") return "cdm-chip--active";
  return "";
}

function timelineClass(estado: string): string {
  if ([CasoEstado.ERROR, CasoEstado.RECHAZADO, CasoEstado.CANCELADO].includes(estado as CasoEstado)) {
    return "cdm-timeline__item--warn";
  }
  if ([CasoEstado.APROBADO, CasoEstado.INFORME_GENERADO].includes(estado as CasoEstado)) {
    return "cdm-timeline__item--ok";
  }
  return "";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMonto(n: number): string {
  return n.toLocaleString("es-CL");
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.modelValue) close();
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.cdm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
}

.cdm {
  width: min(960px, 100%);
  max-height: min(94vh, 920px);
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: var(--sh-lg);
  overflow: hidden;
  color: var(--ink);
}

/* Hero header */
.cdm-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.35rem;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--brand) 92%, var(--canvas)),
    color-mix(in srgb, var(--brand) 58%, var(--panel-2))
  );
  color: #fff;
}

.cdm-hero__main {
  display: flex;
  gap: 1rem;
  min-width: 0;
}

.cdm-hero__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.15);
  font-size: 1.35rem;
  flex-shrink: 0;
}

.cdm-hero__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.85;
}

.cdm-hero__title {
  margin: 0.15rem 0 0.25rem;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.2;
}

.cdm-hero__ref {
  margin: 0 0 0.15rem;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.25;
  opacity: 0.95;
}

.cdm-hero__ident {
  margin: 0 0 0.45rem;
  font-size: 0.78rem;
  line-height: 1.3;
  opacity: 0.82;
}

.cdm-hero__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.cdm-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.18);
}

.cdm-badge--semaforo {
  background: rgba(255, 255, 255, 0.12);
  padding: 0.35rem 0.55rem;
}

.cdm-badge--proc-curso {
  background: color-mix(in srgb, #22c55e 35%, rgba(255, 255, 255, 0.15));
}

.cdm-badge--proc-det {
  background: color-mix(in srgb, #f59e0b 35%, rgba(255, 255, 255, 0.15));
}

.cdm-badge--semaforo :deep(.semaforo-ind__label) {
  color: rgba(255, 255, 255, 0.92) !important;
}

.cdm-hero__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.cdm-btn-light {
  color: #fff !important;
  border-color: rgba(255, 255, 255, 0.35) !important;
}

.cdm-close {
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
}

.cdm-close:hover {
  background: rgba(255, 255, 255, 0.25);
}

/* Body */
.cdm-body {
  flex: 1;
  overflow: auto;
  padding: 1.15rem 1.35rem;
  background: var(--panel-2);
}

.cdm-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2.5rem 1rem;
  color: var(--ink-soft);
  text-align: center;
}

.cdm-state--inline {
  flex-direction: row;
  padding: 1.5rem;
  justify-content: center;
}

.cdm-state--error {
  color: var(--bad);
}

.cdm-state--error i {
  font-size: 2rem;
}

.cdm-spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 3px solid var(--line);
  border-top-color: var(--brand);
  border-radius: 999px;
  animation: cdm-spin 0.8s linear infinite;
}

.cdm-spinner--sm {
  width: 1.25rem;
  height: 1.25rem;
  border-width: 2px;
}

@keyframes cdm-spin {
  to {
    transform: rotate(360deg);
  }
}

/* KPIs */
.cdm-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
  gap: 0.65rem;
  margin-bottom: 1rem;
}

.cdm-kpi {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--sh);
}

.cdm-kpi__ring-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 999px;
  flex-shrink: 0;
}

.cdm-kpi__ring-btn:hover .cdm-kpi__ring,
.cdm-kpi__ring-btn:focus-visible .cdm-kpi__ring {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand, #2563eb) 35%, transparent);
}

.cdm-kpi__ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  flex-shrink: 0;
  position: relative;
}

.cdm-kpi__ring::after {
  content: "";
  position: absolute;
  inset: 4px;
  border-radius: 999px;
  background: var(--panel);
}

.cdm-kpi__ring-val {
  position: relative;
  z-index: 1;
  font-size: 0.65rem;
  font-weight: 800;
  color: var(--ink);
}

.cdm-kpi__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  font-size: 1rem;
  flex-shrink: 0;
}

.cdm-kpi__icon--brand {
  background: var(--brand-soft);
  color: var(--brand-ink);
}

.cdm-kpi__icon--ok {
  background: var(--ok-bg);
  color: var(--ok);
}

.cdm-kpi__icon--warn {
  background: var(--warn-bg);
  color: var(--warn);
}

.cdm-kpi__icon--muted {
  background: var(--line);
  color: var(--ink-soft);
}

.cdm-kpi__value {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.1;
}

.cdm-kpi__label-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.cdm-kpi__label {
  margin: 0.1rem 0 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cdm-kpi__info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.1rem;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink-faint);
  font-size: 0.85rem;
  cursor: help;
  line-height: 1;
  transition: color 0.15s;
}

.cdm-kpi__info:hover,
.cdm-kpi__info:focus-visible {
  color: var(--brand-ink);
  outline: none;
}

.cdm-kpi__hint {
  margin: 0.05rem 0 0;
  font-size: 0.68rem;
  color: var(--ink-faint);
}

/* Cards */
.cdm-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1rem 1.1rem;
  margin-bottom: 1rem;
}

.cdm-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.cdm-card__head h3 {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--brand-ink);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.cdm-progreso__bar-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cdm-progreso__bar {
  flex: 1;
  height: 0.55rem;
  background: var(--line);
  border-radius: 999px;
  overflow: hidden;
}

.cdm-progreso__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--brand), var(--ok));
  transition: width 0.4s ease;
}

.cdm-progreso__pct {
  font-size: 0.95rem;
  color: var(--brand-ink);
  min-width: 2.5rem;
  text-align: right;
}

.cdm-progreso__meta {
  margin: 0.5rem 0 0.85rem;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.cdm-progreso__meta code {
  font-size: 0.72rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--line);
}

/* Stepper */
.cdm-stepper {
  display: flex;
  gap: 0;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.cdm-step {
  flex: 1;
  min-width: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  position: relative;
  text-align: center;
}

.cdm-step:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 0.95rem;
  left: 50%;
  width: 100%;
  height: 2px;
  background: var(--line);
  z-index: 0;
}

.cdm-step--listo:not(:last-child)::after {
  background: var(--ok);
}

.cdm-step__node {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 999px;
  background: var(--line);
  color: var(--ink-soft);
  font-size: 0.72rem;
  border: 2px solid var(--panel);
}

.cdm-step--listo .cdm-step__node {
  background: var(--ok);
  color: #fff;
}

.cdm-step--en_curso .cdm-step__node {
  background: var(--brand);
  color: #fff;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 25%, transparent);
}

.cdm-step__label {
  font-size: 0.58rem;
  line-height: 1.2;
  color: var(--ink-soft);
  max-width: 72px;
}

.cdm-step__pct {
  font-size: 0.52rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--brand);
}

.cdm-step--en_curso .cdm-step__label {
  color: var(--brand-ink);
  font-weight: 600;
}

.cdm-chip--pct {
  font-variant-numeric: tabular-nums;
  color: var(--brand);
  border: 1px solid color-mix(in srgb, var(--brand) 30%, var(--line));
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
}

/* Meta row */
.cdm-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1.1rem;
  margin-bottom: 1rem;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.cdm-meta-row i {
  margin-right: 0.3rem;
  color: var(--brand);
  opacity: 0.85;
}

.cdm-meta--ok {
  color: var(--ok);
}

.cdm-meta--fail {
  color: var(--bad);
}

.cdm-obs {
  margin: -0.35rem 0 0.85rem;
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--panel-2);
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--ink-soft);
}

.cdm-obs i {
  margin-right: 0.35rem;
  color: var(--brand);
}

/* Tabs */
.cdm-tabs {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  margin-bottom: 0.85rem;
  padding-bottom: 0.15rem;
  border-bottom: 1px solid var(--line);
}

.cdm-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  border: none;
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  white-space: nowrap;
  transition: color 0.15s, background 0.15s;
}

.cdm-tab:hover {
  color: var(--brand-ink);
  background: var(--brand-soft);
}

.cdm-tab--active {
  color: var(--brand-ink);
  background: var(--panel);
  box-shadow: inset 0 -2px 0 var(--brand);
}

.cdm-tab__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--line);
  font-size: 0.62rem;
  font-weight: 700;
}

.cdm-tab--active .cdm-tab__count {
  background: var(--brand-soft);
  color: var(--brand-ink);
}

.cdm-tab-panel {
  min-height: 180px;
}

/* Pipeline list */
.cdm-pipeline-list {
  display: grid;
  gap: 0.5rem;
}

.cdm-pipeline-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}

.cdm-pipeline-item--listo {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
}

.cdm-pipeline-item--en_curso {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand-soft) 35%, var(--panel));
}

.cdm-pipeline-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  background: var(--line);
  color: var(--ink-soft);
  font-size: 0.85rem;
}

.cdm-pipeline-item--listo .cdm-pipeline-item__icon {
  background: var(--ok-bg);
  color: var(--ok);
}

.cdm-pipeline-item--en_curso .cdm-pipeline-item__icon {
  background: var(--brand-soft);
  color: var(--brand-ink);
}

.cdm-pipeline-item__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.2rem;
}

.cdm-pipeline-item__head strong {
  font-size: 0.84rem;
  color: var(--ink);
}

.cdm-pipeline-item__body p {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ink-soft);
  line-height: 1.4;
}

/* Chips */
.cdm-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  background: var(--line);
  color: var(--ink-soft);
}

.cdm-chip--sm {
  font-size: 0.62rem;
  padding: 0.1rem 0.4rem;
}

.cdm-chip--ok {
  background: var(--ok-bg);
  color: var(--ok);
}

.cdm-chip--active {
  background: var(--brand-soft);
  color: var(--brand-ink);
}

/* Table */
.cdm-table-wrap {
  overflow: auto;
  max-height: 280px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}

.cdm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.cdm-table th,
.cdm-table td {
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  color: var(--ink);
}

.cdm-table th {
  position: sticky;
  top: 0;
  background: var(--panel-2);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink-faint);
  border-bottom: 1px solid var(--line);
}

.cdm-table td.num,
.cdm-table th.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.cdm-row--warn {
  background: color-mix(in srgb, var(--warn-bg) 80%, var(--panel));
}

.cdm-row-flag {
  color: var(--warn);
  margin-right: 0.25rem;
}

.cdm-rubro {
  display: inline-block;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: 0.72rem;
  font-weight: 600;
}

.cdm-muted {
  color: var(--ink-faint);
  font-style: italic;
}

.cdm-conf-bar {
  display: inline-block;
  min-width: 2.5rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ok) 35%, transparent) var(--pct),
    transparent var(--pct)
  );
}

/* Validaciones */
.cdm-val-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.5rem;
}

.cdm-val-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel);
}

.cdm-val-item--ok {
  border-color: color-mix(in srgb, var(--ok) 30%, var(--line));
}

.cdm-val-item--fail {
  border-color: color-mix(in srgb, var(--bad) 30%, var(--line));
  background: color-mix(in srgb, var(--bad) 4%, var(--panel));
}

.cdm-val-item__icon {
  font-size: 1.25rem;
}

.cdm-val-item--ok .cdm-val-item__icon {
  color: var(--ok);
}

.cdm-val-item--fail .cdm-val-item__icon {
  color: var(--bad);
}

.cdm-val-item strong {
  display: block;
  font-size: 0.78rem;
  text-transform: capitalize;
  margin-bottom: 0.15rem;
  color: var(--ink);
}

.cdm-val-item p {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
  line-height: 1.4;
}

/* Docs */
.cdm-doc-grid {
  display: grid;
  gap: 0.55rem;
}

.cdm-doc-card {
  display: flex;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}

.cdm-doc-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bad) 12%, var(--panel));
  color: var(--bad);
  font-size: 1.2rem;
  flex-shrink: 0;
}

.cdm-doc-card__body strong {
  display: block;
  font-size: 0.88rem;
  margin-bottom: 0.15rem;
  word-break: break-word;
  color: var(--ink);
}

.cdm-doc-card__body p {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.cdm-doc-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 0.35rem;
  font-size: 0.72rem;
  color: var(--ink-faint);
}

.cdm-doc-card__meta i {
  margin-right: 0.2rem;
}

/* Timeline */
.cdm-timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}

.cdm-timeline__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.85rem;
  padding-bottom: 1rem;
  position: relative;
}

.cdm-timeline__item:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 0.9rem;
  top: 2rem;
  bottom: 0;
  width: 2px;
  background: var(--line);
}

.cdm-timeline__dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 999px;
  background: var(--line);
  color: var(--ink-soft);
  font-size: 0.72rem;
  z-index: 1;
}

.cdm-timeline__item--ok .cdm-timeline__dot {
  background: var(--ok-bg);
  color: var(--ok);
}

.cdm-timeline__item--warn .cdm-timeline__dot {
  background: var(--warn-bg);
  color: var(--warn);
}

.cdm-timeline__content time {
  display: block;
  font-size: 0.68rem;
  color: var(--ink-faint);
}

.cdm-timeline__content strong {
  display: block;
  font-size: 0.86rem;
  margin: 0.1rem 0;
  color: var(--ink);
}

.cdm-timeline__content p {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

/* Empty */
.cdm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--ink-soft);
}

.cdm-empty i {
  font-size: 2rem;
  opacity: 0.45;
  color: var(--brand);
}

.cdm-empty p {
  margin: 0;
  font-size: 0.88rem;
}

.cdm-empty small {
  font-size: 0.75rem;
  color: var(--ink-faint);
}

/* Footer */
.cdm-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.9rem 1.35rem;
  border-top: 1px solid var(--line);
  background: var(--panel);
}

.cdm-foot .btn-ghost {
  background: var(--panel-2);
  border-color: var(--line-2);
  color: var(--ink);
}

.cdm-foot .btn-ghost:hover:not(:disabled) {
  background: var(--brand-soft);
  border-color: var(--brand-line);
  color: var(--brand-ink);
}

.cdm-foot .btn i {
  margin-right: 0.35rem;
}

@media (max-width: 640px) {
  .cdm-hero {
    flex-direction: column;
  }

  .cdm-hero__actions {
    width: 100%;
    justify-content: flex-end;
  }

  .cdm-kpis {
    grid-template-columns: 1fr 1fr;
  }

  .cdm-step__label {
    display: none;
  }
}
</style>
