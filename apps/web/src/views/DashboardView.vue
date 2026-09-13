<template>
  <div>
    <PageHeader
      page-key="dashboard"
      :subtitle="`Hola, ${auth.user?.nombre ?? 'analista'}. Acá ves qué fichas requieren acción y cómo viene el trabajo del equipo.`"
    >
      <template #actions>
        <span class="badge" :class="healthOk ? 'ok' : 'warn'">
          {{ healthOk ? "Sistema en línea" : "Sin conexión al sistema" }}
        </span>
      </template>
    </PageHeader>

    <DashboardExportPanel
      v-if="kpis && puedeExportarKpis"
      :kpis="kpis"
      :busy="exportBusy"
      :message="exportMessage"
      :message-ok="exportOk"
      @download-csv="downloadExport('csv')"
      @download-json="downloadExport('json')"
    />

    <section v-if="kpis" class="quick-actions card">
      <h2>¿Qué querés hacer ahora?</h2>
      <div class="quick-actions__grid">
        <RouterLink to="/casos" class="quick-action">
          <i class="fas fa-folder-open" aria-hidden="true"></i>
          <span>
            <strong>Bandeja de fichas</strong>
            <small>{{ kpis.resumen.enRevision }} en revisión · {{ kpis.resumen.totalCasos }} en total</small>
          </span>
        </RouterLink>
        <RouterLink to="/flujo" class="quick-action">
          <i class="fas fa-project-diagram" aria-hidden="true"></i>
          <span>
            <strong>Ver mapa del proceso</strong>
            <small>Entender en qué etapa está cada ficha</small>
          </span>
        </RouterLink>
        <RouterLink to="/repositorio" class="quick-action">
          <i class="fas fa-archive" aria-hidden="true"></i>
          <span>
            <strong>Fichas ya cerradas</strong>
            <small>{{ kpis.resumen.aprobados + kpis.resumen.informesGenerados }} con ficha o informe listo</small>
          </span>
        </RouterLink>
      </div>
    </section>

    <div v-if="kpis" class="sections">
      <section class="grid">
        <article class="card stat stat--icon">
          <span class="stat__icon stat__icon--brand" aria-hidden="true"><i class="fas fa-layer-group"></i></span>
          <h3>Fichas en el sistema</h3>
          <p class="num">{{ kpis.resumen.totalCasos }}</p>
          <p class="stat-hint">Expedientes registrados</p>
        </article>
        <article class="card stat stat--accent stat--icon">
          <span class="stat__icon stat__icon--amber" aria-hidden="true"><i class="fas fa-user-clock"></i></span>
          <h3>Esperando tu revisión</h3>
          <p class="num">{{ kpis.resumen.enRevision }}</p>
          <p class="stat-hint">Requieren analista</p>
        </article>
        <article class="card stat stat--icon">
          <span class="stat__icon stat__icon--teal" aria-hidden="true"><i class="fas fa-circle-check"></i></span>
          <h3>Fichas cerradas</h3>
          <p class="num">{{ kpis.resumen.aprobados }}</p>
          <p class="stat-hint">Aprobadas, listas para informe o archivo</p>
        </article>
        <article class="card stat stat--icon">
          <span class="stat__icon stat__icon--violet" aria-hidden="true"><i class="fas fa-file-signature"></i></span>
          <h3>Informes para comité</h3>
          <p class="num">{{ kpis.resumen.informesGenerados }}</p>
          <p class="stat-hint">Documentos ya generados</p>
        </article>
        <article class="card stat stat--icon">
          <span class="stat__icon stat__icon--ok" aria-hidden="true"><i class="fas fa-bolt"></i></span>
          <h3>Resueltas sin intervención</h3>
          <p class="num">{{ kpis.operacion.tasaResolucionAutomaticaPct }}%</p>
          <p class="stat-hint">El sistema las procesó solo</p>
        </article>
        <article class="card stat stat--icon">
          <span class="stat__icon stat__icon--brand" aria-hidden="true"><i class="fas fa-route"></i></span>
          <h3>Documentos procesados bien</h3>
          <p class="num">{{ kpis.operacion.coberturaProcesamientoPct ?? "—" }}%</p>
          <p class="stat-hint">Sin quedar atascados en el camino</p>
        </article>
      </section>

      <section v-if="kpis.tiempos" class="card block">
        <DashboardSectionCard
          title="¿Qué tan rápido cerramos una ficha?"
          subtitle="Tiempo desde la carga hasta la aprobación, comparado con la meta del equipo."
          icon="fas fa-stopwatch"
          tone="teal"
        >
          <div class="tile-grid">
            <DashboardMetricTile
              icon="fas fa-hourglass-half"
              tone="teal"
              label="Promedio hasta aprobar"
              :value="formatMinutos(kpis.tiempos.promedioMinutosAprobacion)"
              :hint="
                kpis.tiempos.promedioMinutosAprobacion == null
                  ? 'Aún no hay fichas cerradas con tiempo medible'
                  : 'Desde ingreso hasta cierre'
              "
            />
            <DashboardMetricTile
              icon="fas fa-bullseye"
              tone="brand"
              label="Meta del equipo"
              :value="`${kpis.tiempos.metaMinutos} min`"
              hint="Objetivo operativo interno"
            />
            <DashboardMetricTile
              icon="fas fa-chart-line"
              tone="violet"
              label="Mejora vs. manual"
              :value="
                kpis.tiempos.reduccionVsBaselineHorasPct != null
                  ? `${kpis.tiempos.reduccionVsBaselineHorasPct}%`
                  : '—'
              "
              :pct="kpis.tiempos.reduccionVsBaselineHorasPct"
              :hint="`Referencia manual ~${kpis.tiempos.baselineReferenciaHoras} h`"
            />
          </div>
        </DashboardSectionCard>
      </section>

      <section v-if="kpis.calidad" class="card block">
        <DashboardSectionCard
          title="Calidad del trabajo"
          subtitle="Indicadores de cuadratura, respaldo documental y revisión humana."
          icon="fas fa-award"
          tone="brand"
        >
          <div class="tile-grid">
            <DashboardMetricTile
              icon="fas fa-scale-balanced"
              tone="teal"
              label="Fichas cerradas que cuadran"
              :value="cuadraturaLabel"
              :pct="kpis.calidad.pctCuadraturaVerificada"
              show-bar
              hint="Activo = Pasivo + Patrimonio"
            />
            <DashboardMetricTile
              icon="fas fa-file-circle-check"
              tone="brand"
              label="Con respaldo documental"
              :value="`${kpis.calidad.pctTrazabilidadCompleta}%`"
              :pct="kpis.calidad.pctTrazabilidadCompleta"
              show-bar
              hint="Líneas con origen en el PDF"
            />
            <DashboardMetricTile
              icon="fas fa-robot"
              tone="violet"
              label="Sin revisar línea por línea"
              :value="`${kpis.calidad.pctCasosSinIntervencionHumana}%`"
              :pct="kpis.calidad.pctCasosSinIntervencionHumana"
              show-bar
              hint="Cerradas solo con el motor automático"
            />
            <DashboardMetricTile
              icon="fas fa-user-check"
              tone="amber"
              label="Alertas confirmadas"
              :value="String(kpis.calidad.inconsistenciasConfirmadas)"
              hint="Inconsistencias revisadas por el equipo"
            />
          </div>
        </DashboardSectionCard>
      </section>

      <section v-if="kpis.aprendizaje" class="card block">
        <DashboardSectionCard
          title="Experiencia acumulada del equipo"
          subtitle="Cuánto aprende el sistema de casos anteriores de cada empresa."
          icon="fas fa-brain"
          tone="violet"
        >
          <div class="tile-grid">
            <DashboardMetricTile
              icon="fas fa-building"
              tone="violet"
              label="Empresas con historial"
              :value="String(kpis.aprendizaje.contribuyentesConHistorial)"
              hint="Con más de una ficha en el sistema"
            />
            <DashboardMetricTile
              icon="fas fa-bookmark"
              tone="brand"
              label="Criterios validados"
              :value="String(kpis.aprendizaje.criteriosAprobadosTotal ?? 0)"
              hint="Reglas confirmadas en casos previos"
            />
            <DashboardMetricTile
              icon="fas fa-wand-magic-sparkles"
              tone="teal"
              label="Menos líneas a revisar"
              :value="
                kpis.aprendizaje.reduccionLineasRevisionPromedioPct != null
                  ? `${kpis.aprendizaje.reduccionLineasRevisionPromedioPct}%`
                  : '—'
              "
              :pct="kpis.aprendizaje.reduccionLineasRevisionPromedioPct"
              show-bar
              hint="Gracias al historial por empresa"
            />
            <DashboardMetricTile
              icon="fas fa-arrow-trend-up"
              tone="amber"
              label="Tendencia de automatización"
              :value="tendenciaAutomatizacion"
              :hint="tendenciaAutomatizacionHint"
            />
          </div>
        </DashboardSectionCard>
      </section>

      <section v-if="kpis.resolucionAutomaticaMensual?.length" class="card block">
        <DashboardSectionCard
          title="Evolución mes a mes"
          subtitle="Porcentaje de fichas cerradas sin intervención manual del analista."
          icon="fas fa-calendar-days"
          tone="slate"
        >
          <ul class="timeline">
            <li v-for="m in kpis.resolucionAutomaticaMensual" :key="m.periodo" class="timeline__item">
              <div class="timeline__head">
                <span class="timeline__period">{{ formatPeriodo(m.periodo) }}</span>
                <strong class="timeline__pct">{{ m.pctSinIntervencion }}%</strong>
              </div>
              <div class="timeline__bar" aria-hidden="true">
                <span class="timeline__fill" :style="{ width: `${m.pctSinIntervencion}%` }"></span>
              </div>
              <p class="timeline__meta">
                {{ m.casosAprobados }} ficha{{ m.casosAprobados === 1 ? "" : "s" }} cerrada{{ m.casosAprobados === 1 ? "" : "s" }}
                · sin revisión manual
              </p>
            </li>
          </ul>
        </DashboardSectionCard>
      </section>

      <section class="card block two-col">
        <div class="two-col__panel">
        <DashboardSectionCard
          title="¿De dónde llegan las fichas?"
          subtitle="Origen de carga en el período visible."
          icon="fas fa-truck-ramp-box"
          tone="brand"
        >
          <ul v-if="canalItems.length" class="canal-list">
            <li v-for="item in canalItems" :key="item.id" class="canal-list__item">
              <span class="canal-list__icon" :class="`canal-list__icon--${item.id}`" aria-hidden="true">
                <i :class="item.icon"></i>
              </span>
              <div class="canal-list__body">
                <div class="canal-list__row">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.count }}</strong>
                </div>
                <div class="canal-list__bar" aria-hidden="true">
                  <span class="canal-list__fill" :style="{ width: `${item.pct}%` }"></span>
                </div>
                <span class="canal-list__pct">{{ item.pct }}% del total</span>
              </div>
            </li>
          </ul>
          <p v-else class="empty-note">Sin datos de origen por ahora.</p>
        </DashboardSectionCard>
        </div>

        <div class="two-col__panel">
        <DashboardSectionCard
          title="Problemas de procesamiento"
          subtitle="Incidentes recientes en el pipeline automático."
          icon="fas fa-heart-pulse"
          :tone="(kpis.pipelineErrores ?? 0) === 0 ? 'ok' : 'amber'"
        >
          <div
            class="status-banner"
            :class="(kpis.pipelineErrores ?? 0) === 0 ? 'status-banner--ok' : 'status-banner--warn'"
          >
            <i
              :class="(kpis.pipelineErrores ?? 0) === 0 ? 'fas fa-circle-check' : 'fas fa-triangle-exclamation'"
              aria-hidden="true"
            ></i>
            <div>
              <strong>
                {{
                  (kpis.pipelineErrores ?? 0) === 0
                    ? "Sin incidentes recientes"
                    : `${kpis.pipelineErrores} incidente(s) registrado(s)`
                }}
              </strong>
              <p>
                {{
                  (kpis.pipelineErrores ?? 0) === 0
                    ? "El procesamiento automático viene estable."
                    : "Revisá la pantalla de operación para más detalle."
                }}
              </p>
            </div>
          </div>
          <ul v-if="erroresEtapaItems.length" class="etapa-list">
            <li v-for="item in erroresEtapaItems" :key="item.etapa">
              <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
              <span>{{ item.label }}</span>
              <strong>{{ item.count }}</strong>
            </li>
          </ul>
        </DashboardSectionCard>
        </div>
      </section>
    </div>
    <p v-else-if="loading" class="loading-msg">Cargando resumen…</p>
    <p v-else class="loading-msg">No se pudo cargar el resumen. Verificá que el sistema esté en línea.</p>
  </div>
</template>

<script setup lang="ts">
import type { KpisDto } from "@ffa/shared";
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../api/client";
import DashboardExportPanel from "../components/DashboardExportPanel.vue";
import DashboardMetricTile from "../components/dashboard/DashboardMetricTile.vue";
import DashboardSectionCard from "../components/dashboard/DashboardSectionCard.vue";
import PageHeader from "../components/PageHeader.vue";
import { formatCuadraturaLabel } from "../utils/dashboardExport";
import { formatMinutos } from "../utils/formatDuration";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const healthOk = ref(false);
const kpis = ref<KpisDto | null>(null);
const loading = ref(true);
const exportBusy = ref(false);
const exportMessage = ref("");
const exportOk = ref(true);

const puedeExportarKpis = computed(() => {
  const rol = auth.user?.rol;
  return rol === "admin" || rol === "product_owner";
});

const cuadraturaLabel = computed(() =>
  kpis.value?.calidad ? formatCuadraturaLabel(kpis.value) : "—"
);

const CANAL_LABELS: Record<string, string> = {
  portal: "Portal web",
  correo: "Correo electrónico",
  manual_alternativa: "Carga alternativa",
};

const CANAL_ICONS: Record<string, string> = {
  portal: "fas fa-globe",
  correo: "fas fa-envelope",
  manual_alternativa: "fas fa-keyboard",
};

const ETAPA_LABELS: Record<string, string> = {
  preprocess: "Lectura del documento",
  extract: "Extracción de datos",
  normalize: "Normalización",
  classify: "Clasificación contable",
  validate: "Validaciones",
};

function canalLabel(canal: string): string {
  return CANAL_LABELS[canal] ?? canal;
}

const canalItems = computed(() => {
  if (!kpis.value?.casosPorCanal) return [];
  const entries = Object.entries(kpis.value.casosPorCanal);
  const total = entries.reduce((sum, [, n]) => sum + n, 0) || 1;
  return entries
    .map(([id, count]) => ({
      id,
      label: canalLabel(id),
      icon: CANAL_ICONS[id] ?? "fas fa-inbox",
      count,
      pct: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
});

const erroresEtapaItems = computed(() => {
  const map = kpis.value?.erroresPorEtapa;
  if (!map) return [];
  return Object.entries(map).map(([etapa, count]) => ({
    etapa,
    label: etapaLabel(etapa),
    count,
  }));
});

const tendenciaAutomatizacion = computed(() => {
  const val = kpis.value?.aprendizaje?.tendenciaResolucionAutomaticaPct;
  if (val == null) return "—";
  return `${val >= 0 ? "+" : ""}${val} pp`;
});

const tendenciaAutomatizacionHint = computed(() => {
  const val = kpis.value?.aprendizaje?.tendenciaResolucionAutomaticaPct;
  if (val == null) return "Se necesitan al menos dos meses de datos";
  return val >= 0 ? "Más fichas se cierran solas que antes" : "Bajó la resolución automática";
});

function etapaLabel(etapa: string): string {
  return ETAPA_LABELS[etapa] ?? etapa;
}

function formatPeriodo(periodo: string): string {
  const [y, mo] = periodo.split("-");
  if (!y || !mo) return periodo;
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const idx = Number(mo) - 1;
  return `${meses[idx] ?? mo} ${y}`;
}

async function downloadExport(format: "csv" | "json"): Promise<void> {
  exportBusy.value = true;
  exportMessage.value = "";
  try {
    await api.downloadKpisExport(format);
    exportOk.value = true;
    exportMessage.value =
      format === "csv"
        ? "Archivo descargado — abrilo con Excel o Google Sheets."
        : "JSON descargado — incluye todos los datos del tablero.";
  } catch (e) {
    exportOk.value = false;
    exportMessage.value = e instanceof Error ? e.message : "No se pudo descargar el resumen";
  } finally {
    exportBusy.value = false;
  }
}

onMounted(async () => {
  try {
    const h = await api.health();
    healthOk.value = h.status === "ok";
    kpis.value = await api.getKpis();
  } catch {
    healthOk.value = false;
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.quick-actions {
  margin-bottom: 1rem;
  padding: 1rem 1.15rem;
}

.quick-actions h2 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  color: var(--brand-ink);
}

.quick-actions__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.65rem;
}

.quick-action {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--canvas);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}

.quick-action:hover {
  border-color: var(--brand-line);
  background: var(--brand-soft);
}

.quick-action i {
  margin-top: 0.15rem;
  color: var(--brand);
  font-size: 1rem;
}

.quick-action strong {
  display: block;
  font-size: 0.85rem;
  color: var(--ink);
}

.quick-action small {
  display: block;
  margin-top: 0.15rem;
  color: var(--ink-faint);
  font-size: 0.72rem;
  line-height: 1.35;
}

.sections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}

.block {
  padding: 0;
  overflow: hidden;
}

.block :deep(.section) {
  border: none;
  box-shadow: none;
  background: transparent;
}

.stat--icon {
  position: relative;
  padding-top: 0.35rem;
}

.stat__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  margin-bottom: 0.45rem;
  font-size: 0.9rem;
}

.stat__icon--brand {
  background: color-mix(in srgb, var(--brand) 14%, var(--panel));
  color: var(--brand);
}

.stat__icon--teal {
  background: rgb(13 148 136 / 12%);
  color: #0d9488;
}

.stat__icon--amber {
  background: rgb(245 158 11 / 14%);
  color: #d97706;
}

.stat__icon--violet {
  background: rgb(124 58 237 / 12%);
  color: #7c3aed;
}

.stat__icon--ok {
  background: rgb(22 163 74 / 12%);
  color: #16a34a;
}

.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
  gap: 0.6rem;
}

.stat h3 {
  margin: 0 0 0.35rem;
  color: var(--ink-soft);
  font-size: 0.875rem;
  line-height: 1.3;
}

.stat--accent {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand-soft) 40%, var(--panel));
}

.num {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--ink);
}

.stat-hint {
  margin: 0.35rem 0 0;
  font-size: 0.72rem;
  color: var(--ink-faint);
  line-height: 1.35;
}

.metrics-list {
  margin: 0;
  padding-left: 1.2rem;
  color: var(--ink-soft);
  font-size: 0.9rem;
  line-height: 1.55;
}

.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.timeline__item {
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}

.timeline__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.timeline__period {
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.timeline__pct {
  font-size: 1rem;
  color: var(--brand-ink);
}

.timeline__bar {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line) 75%, transparent);
  overflow: hidden;
}

.timeline__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--brand), #0d9488);
}

.timeline__meta {
  margin: 0.35rem 0 0;
  font-size: 0.68rem;
  color: var(--ink-faint);
}

.canal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
}

.canal-list__item {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
}

.canal-list__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 9px;
  flex-shrink: 0;
  font-size: 0.85rem;
}

.canal-list__icon--portal {
  background: rgb(37 99 235 / 12%);
  color: #2563eb;
}

.canal-list__icon--correo {
  background: rgb(13 148 136 / 12%);
  color: #0d9488;
}

.canal-list__icon--manual_alternativa {
  background: rgb(124 58 237 / 12%);
  color: #7c3aed;
}

.canal-list__body {
  flex: 1;
  min-width: 0;
}

.canal-list__row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--ink-soft);
  margin-bottom: 0.35rem;
}

.canal-list__row strong {
  color: var(--ink);
}

.canal-list__bar {
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line) 75%, transparent);
  overflow: hidden;
}

.canal-list__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--brand);
}

.canal-list__pct {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.65rem;
  color: var(--ink-faint);
}

.status-banner {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.85rem 0.95rem;
  border-radius: 12px;
  border: 1px solid transparent;
}

.status-banner i {
  font-size: 1.35rem;
  margin-top: 0.1rem;
}

.status-banner strong {
  display: block;
  font-size: 0.9rem;
  margin-bottom: 0.2rem;
}

.status-banner p {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
}

.status-banner--ok {
  background: rgb(22 163 74 / 8%);
  border-color: rgb(22 163 74 / 20%);
  color: #15803d;
}

.status-banner--ok p {
  color: rgb(21 128 61 / 85%);
}

.status-banner--warn {
  background: rgb(234 88 12 / 8%);
  border-color: rgb(234 88 12 / 22%);
  color: #c2410c;
}

.status-banner--warn p {
  color: rgb(194 65 12 / 85%);
}

.etapa-list {
  list-style: none;
  margin: 0.65rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.etapa-list li {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.78rem;
  color: var(--ink-soft);
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--line) 35%, transparent);
}

.etapa-list i {
  color: #ea580c;
  font-size: 0.72rem;
}

.etapa-list strong {
  margin-left: auto;
  color: var(--ink);
}

.empty-note {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ink-faint);
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.two-col__panel {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius, 12px);
  background: var(--panel);
  overflow: hidden;
}

.loading-msg {
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.badge {
  font-size: 0.8rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-weight: 600;
}

@media (max-width: 720px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}
</style>
