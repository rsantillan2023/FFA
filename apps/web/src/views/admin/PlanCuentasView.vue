<template>
  <div class="page">
    <PageHeader page-key="plan-cuentas">
      <template #actions>
        <button class="btn btn-ghost" type="button" @click="openPlanAssist">Asistente IA</button>
        <button class="btn btn-primary" type="button" @click="showCreate = true">Nueva versión</button>
      </template>
    </PageHeader>

    <details ref="versionStripRef" class="card version-strip">
      <summary class="version-strip__summary">
        <span class="version-strip__summary-main">
          <span class="version-strip__title">Versiones del plan</span>
          <span v-if="selectedVersion" class="version-strip__current">
            v{{ selectedVersion.version }}
            <span v-if="selectedVersion.esVigente" class="estado-badge estado-badge--vigente">Vigente</span>
            <span class="estado-badge" :class="`estado-badge--${selectedVersion.estado}`">
              {{ planEstadoLabel(selectedVersion.estado) }}
            </span>
          </span>
          <span v-else-if="loading" class="version-strip__hint">Cargando…</span>
        </span>
        <span class="version-strip__count">{{ versions.length }}</span>
      </summary>
      <div class="version-strip__body">
        <p v-if="loading" class="hint">Cargando versiones…</p>
        <nav
          v-else-if="sortedVersions.length"
          class="version-tabs"
          role="tablist"
          aria-label="Versiones del plan contable"
        >
          <button
            v-for="v in sortedVersions"
            :key="v.id"
            type="button"
            role="tab"
            class="version-tab"
            :class="{
              'version-tab--active': selectedId === v.id,
              'version-tab--vigente': v.esVigente,
            }"
            :aria-selected="selectedId === v.id"
            @click="selectVersion(v.id)"
          >
            <span class="version-tab__label">v{{ v.version }}</span>
            <span class="version-tab__meta">
              {{ v.rubrosCount ?? 0 }} rubros<template v-if="v.responsableNombre"> · {{ v.responsableNombre }}</template>
            </span>
            <span class="version-tab__badges">
              <span v-if="v.esVigente" class="estado-badge estado-badge--vigente">Vigente</span>
              <span class="estado-badge" :class="`estado-badge--${v.estado}`">
                {{ planEstadoLabel(v.estado) }}
              </span>
            </span>
          </button>
        </nav>
      </div>
    </details>

    <div v-if="selectedId && selectedVersion" class="content">
      <main class="main">
        <section class="card hero">
          <div class="hero__top">
            <div class="hero__text">
              <span class="hero__label">Plan contable</span>
              <h2>v{{ selectedVersion.version }}</h2>
              <p class="hero__meta">
                <span v-if="selectedVersion.notas">{{ selectedVersion.notas }}</span>
                <span v-if="selectedVersion.notas" class="hero__sep" aria-hidden="true">·</span>
                <span class="hero__ref-wrap">
                  <button
                    type="button"
                    class="hero__ref hero__ref--btn"
                    title="Cambiar referente del área"
                    @click="openReferenteEdit"
                  >
                    Referente: {{ selectedVersion.responsableNombre ?? "Sin asignar" }}
                  </button>
                  <button
                    type="button"
                    class="hero__ref-info"
                    aria-label="¿Qué es el referente del área?"
                    @click="showReferenteInfo = true"
                  >
                    <i class="fas fa-circle-info" aria-hidden="true"></i>
                  </button>
                </span>
              </p>
            </div>
            <div class="hero__aside">
              <div v-if="statsRubros.total" class="hero__stats">
                <button
                  type="button"
                  class="stat-pill stat-pill--btn"
                  :class="{ 'stat-pill--active': highlightStat === 'total' }"
                  title="Mostrar todos los rubros"
                  @click="applyStatFilter('total')"
                >
                  <span>Total rubros</span>
                  <strong>{{ statsRubros.total }}</strong>
                </button>
                <button
                  v-for="(meta, key) in ESTADO_FINANCIERO_META"
                  :key="key"
                  type="button"
                  class="stat-pill stat-pill--btn stat-pill--sec"
                  :class="{ 'stat-pill--active': highlightStat === key }"
                  :style="{ '--c': meta.color, '--bg': meta.bg }"
                  :title="`Filtrar por ${meta.label}`"
                  @click="applyStatFilter(key)"
                >
                  <span>{{ meta.label }}</span>
                  <strong>{{ statsRubros.porEstado[key] ?? 0 }}</strong>
                </button>
                <button
                  type="button"
                  class="stat-pill stat-pill--btn"
                  :class="{ 'stat-pill--active': highlightStat === 'niveles' }"
                  title="Ver jerarquía en árbol"
                  @click="applyStatFilter('niveles')"
                >
                  <span>Niveles</span>
                  <strong>{{ statsRubros.maxDepth + 1 }}</strong>
                </button>
              </div>
              <div v-if="canEdit" class="hero__actions">
                <button class="btn btn-ghost btn-sm" type="button" @click="solicitarAprobacion">
                  Solicitar aprobación
                </button>
                <button class="btn btn-primary btn-sm" type="button" @click="aprobar">Aprobar versión</button>
              </div>
            </div>
          </div>
        </section>

        <section v-if="canEdit" class="card import-card">
          <header class="import-card__head">
            <div>
              <h3 class="block-title">Importar rubros desde CSV</h3>
              <p class="import-card__intro">
                Elegí entre armar tu plan con la plantilla vacía o cargar el plan de demostración ya completo.
              </p>
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-sm import-card__template"
              @click="downloadPlantillaCsv"
            >
              <i class="fas fa-download" aria-hidden="true"></i>
              Plantilla vacía
            </button>
          </header>

          <aside class="import-card__demo">
            <div class="import-card__demo-copy">
              <strong>Plan de demostración precargado</strong>
              <p>
                Un CSV ya armado con {{ SAMPLE_CSV_RUBROS }} cuentas contables (caja, proveedores, capital,
                ingresos…). Sirve para probar el explorador sin completar la plantilla a mano.
              </p>
              <ul class="import-card__demo-rubros">
                <li v-for="item in SAMPLE_CSV_PREVIEW" :key="item">{{ item }}</li>
              </ul>
            </div>
            <button type="button" class="btn btn-ghost btn-sm import-card__demo-btn" @click="openSampleCsvModal">
              <i class="fas fa-circle-info" aria-hidden="true"></i>
              Qué incluye y cargar
            </button>
          </aside>

          <FileDropzone
            v-model="importFiles"
            :multiple="false"
            accept=".csv,text/csv"
            compact
            title="Arrastrá tu CSV o elegí el archivo"
            hint="Usá la plantilla vacía si vas a cargar el plan real de la institución."
            :busy="importing"
            @change="onImportFilesChange"
          />
        </section>

        <section ref="explorerCardRef" class="card explorer-card">
          <header class="explorer-head">
            <h3 class="block-title">Explorador de rubros</h3>
          </header>
          <PlanCuentasExplorer
            ref="explorerRef"
            v-model:filtro-estado="explorerFiltroEstado"
            v-model:vista="explorerVista"
            :rubros="rubros"
          />
        </section>

        <p v-if="msg" class="banner-msg">{{ msg }}</p>
        <p v-if="error" class="error-msg">{{ error }}</p>

        <details v-if="historial.length" class="card historial-card">
          <summary>Historial de cambios ({{ historial.length }})</summary>
          <ul class="historial-list">
            <li v-for="h in historial" :key="h.id">
              <span class="historial-date">{{ formatDate(h.at) }}</span>
              {{ h.accion }}
              <span v-if="h.motivo"> · {{ h.motivo }}</span>
            </li>
          </ul>
        </details>
      </main>
    </div>

    <main v-else-if="!loading" class="empty-main card">
      <i class="fas fa-book empty-main__ico" aria-hidden="true"></i>
      <p>Seleccioná una versión del plan o creá una nueva.</p>
    </main>

    <CreateFormModal
      v-if="showCreate"
      v-model="showCreate"
      title="Nueva versión del plan"
      subtitle="Semver y notas descriptivas. Luego podrá importar rubros desde CSV."
      assist-flow-id="nueva-version-plan"
      :assist-context="planAssistContext"
    >
      <div class="modal-form">
        <label class="label">Versión (semver)</label>
        <input v-model="newVersion" class="input" placeholder="1.0.0" data-assist-field="version" />
        <label class="label">Notas</label>
        <input v-model="newNotas" class="input" data-assist-field="notas" />
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" @click="showCreate = false">Cancelar</button>
          <button class="btn btn-primary" type="button" data-assist-field="submit" @click="createVersion">
            Crear versión
          </button>
        </div>
      </div>
    </CreateFormModal>

    <InfoModal
      v-if="showReferenteInfo"
      v-model="showReferenteInfo"
      title="Referente del área"
      summary="Persona del área contable institucional asignada formalmente a esta versión del plan de cuentas."
      when-to-use="Para trazabilidad interna: saber a quién consultar sobre cambios normativos, borradores o aprobaciones de esa versión."
      :bullets="[
        'No interviene en la clasificación automática de las fichas.',
        'No reemplaza al analista que revisa cada caso.',
        'Queda registrado en el historial cuando se asigna o cambia.',
        'Hacé clic en el nombre del referente para cambiar la asignación.',
      ]"
    />

    <CreateFormModal
      v-if="showReferenteEdit && selectedVersion"
      v-model="showReferenteEdit"
      title="Cambiar referente del área"
      :subtitle="`Versión v${selectedVersion.version}`"
    >
      <div class="modal-form">
        <label class="label" for="plan-referente-select">Usuario responsable</label>
        <select id="plan-referente-select" v-model="responsableDraft" class="input">
          <option value="">— Sin asignar —</option>
          <option v-for="u in users" :key="u.id" :value="u.id">{{ u.nombre }} ({{ u.rol }})</option>
        </select>
        <p v-if="referenteEditError" class="error-msg">{{ referenteEditError }}</p>
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" @click="showReferenteEdit = false">Cancelar</button>
          <button class="btn btn-primary" type="button" :disabled="savingReferente" @click="saveReferente">
            {{ savingReferente ? "Guardando…" : "Guardar" }}
          </button>
        </div>
      </div>
    </CreateFormModal>

    <CreateFormModal
      v-if="showSampleCsvModal && selectedVersion"
      v-model="showSampleCsvModal"
      title="Cargar plan de demostración"
      :subtitle="`Se aplicará a la versión v${selectedVersion.version}`"
    >
      <div class="modal-form sample-csv-modal">
        <p class="sample-csv-modal__lead">
          El sistema importará un <strong>archivo CSV ya completo</strong> con la estructura contable típica de
          ECR Salud: <strong>{{ SAMPLE_CSV_RUBROS }} rubros</strong> en activo, pasivo, patrimonio y resultados.
        </p>

        <div class="sample-csv-modal__box">
          <h4 class="sample-csv-modal__box-title">¿Qué hace al confirmar?</h4>
          <ul class="sample-csv-modal__list">
            <li>Carga las cuentas en esta versión del plan, igual que si hubieras subido un Excel.</li>
            <li v-if="(selectedVersion.rubrosCount ?? 0) > 0">
              <strong>Reemplaza</strong> los {{ selectedVersion.rubrosCount }} rubros que tiene hoy esta versión.
            </li>
            <li v-else>Como la versión está vacía, crea todos los rubros desde cero.</li>
            <li>Te lleva al explorador para ver la tabla y el árbol contable.</li>
          </ul>
        </div>

        <div class="sample-csv-modal__box">
          <h4 class="sample-csv-modal__box-title">Algunas cuentas que incluye</h4>
          <ul class="sample-csv-modal__preview">
            <li v-for="item in SAMPLE_CSV_PREVIEW" :key="item">{{ item }}</li>
          </ul>
        </div>

        <p class="sample-csv-modal__note">
          No es el plan vigente de producción: es material de prueba. Para el plan real de la institución, usá
          <strong>Plantilla vacía</strong> y subí tu CSV.
        </p>
        <p v-if="sampleCsvError" class="error-msg">{{ sampleCsvError }}</p>
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" :disabled="importing" @click="showSampleCsvModal = false">
            Cancelar
          </button>
          <button class="btn btn-primary" type="button" :disabled="importing" @click="confirmSampleCsv">
            {{ importing ? "Cargando plan…" : `Cargar plan demo (${SAMPLE_CSV_RUBROS} rubros)` }}
          </button>
        </div>
      </div>
    </CreateFormModal>
  </div>
</template>

<script setup lang="ts">
import type {
  PlanCuentasHistorialDto,
  PlanCuentasVersionDto,
  RubroInstitucionalDto,
  UserDto,
} from "@ffa/shared";
import { computed, onMounted, ref, watch } from "vue";
import { api } from "../../api/client";
import CreateFormModal from "../../components/CreateFormModal.vue";
import FileDropzone from "../../components/FileDropzone.vue";
import InfoModal from "../../components/InfoModal.vue";
import PageHeader from "../../components/PageHeader.vue";
import PlanCuentasExplorer from "../../components/PlanCuentasExplorer.vue";
import { useCloseOnRouteLeave } from "../../composables/useCloseOnRouteLeave";
import { useCreateAssistListener } from "../../utils/useCreateAssistListener";
import { apiErrorMessage } from "../../utils/apiError";
import {
  ESTADO_FINANCIERO_META,
  PLAN_ESTADO_LABELS,
  planStats,
  type PlanVistaModo,
} from "../../utils/planCuentasDisplay";

const versions = ref<PlanCuentasVersionDto[]>([]);
const rubros = ref<RubroInstitucionalDto[]>([]);
const historial = ref<PlanCuentasHistorialDto[]>([]);
const selectedId = ref<string | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const msg = ref<string | null>(null);
const showCreate = ref(false);
const SAMPLE_CSV_RUBROS = 20;
const SAMPLE_CSV_PREVIEW = [
  "1.1.01 · Caja y bancos",
  "2.1.01 · Cuentas por pagar",
  "3.1 · Capital pagado",
  "4.1 · Ingresos operacionales",
  "4.3 · Utilidad del ejercicio",
];

const showReferenteInfo = ref(false);
const showReferenteEdit = ref(false);
const showSampleCsvModal = ref(false);
const sampleCsvError = ref<string | null>(null);
const responsableDraft = ref("");
const referenteEditError = ref<string | null>(null);
const savingReferente = ref(false);
const users = ref<UserDto[]>([]);
const newVersion = ref("1.0.0");
const newNotas = ref("Plan institucional inicial ECR Salud");
const planAssistContext = computed(() => ({
  version: newVersion.value.trim(),
  notas: newNotas.value.trim(),
  submit: Boolean(newVersion.value.trim()),
}));

const statsRubros = computed(() => planStats(rubros.value));

function openPlanAssist(): void {
  showCreate.value = true;
}

useCreateAssistListener("nueva-version-plan", () => {
  showCreate.value = true;
});

useCloseOnRouteLeave(showCreate);
useCloseOnRouteLeave(showReferenteEdit);
useCloseOnRouteLeave(showSampleCsvModal);

const importFiles = ref<File[]>([]);
const importing = ref(false);
const versionStripRef = ref<HTMLDetailsElement | null>(null);
const explorerRef = ref<InstanceType<typeof PlanCuentasExplorer> | null>(null);
const explorerCardRef = ref<HTMLElement | null>(null);
const explorerFiltroEstado = ref("");
const explorerVista = ref<PlanVistaModo>("arbol");
const highlightStat = ref<"total" | "niveles" | string>("total");

const selectedVersion = computed(() => versions.value.find((v) => v.id === selectedId.value));

const sortedVersions = computed(() =>
  [...versions.value].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
);

const canEdit = computed(
  () =>
    selectedVersion.value &&
    selectedVersion.value.estado !== "aprobado" &&
    selectedVersion.value.estado !== "obsoleto"
);

watch(explorerFiltroEstado, (estado) => {
  if (estado) highlightStat.value = estado;
  else if (highlightStat.value !== "niveles") highlightStat.value = "total";
});

function planEstadoLabel(estado: string): string {
  return PLAN_ESTADO_LABELS[estado] ?? estado;
}

async function loadVersions(): Promise<void> {
  loading.value = true;
  try {
    versions.value = await api.listPlanVersions();
    if (!selectedId.value && versions.value.length) {
      const vigente = versions.value.find((v) => v.esVigente);
      selectedId.value = vigente?.id ?? versions.value[0].id;
      await loadRubros();
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error";
  } finally {
    loading.value = false;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL");
}

async function loadRubros(): Promise<void> {
  if (!selectedId.value) return;
  try {
    rubros.value = await api.getPlanRubros(selectedId.value);
    historial.value = await api.getPlanHistorial(selectedId.value).catch(() => []);
  } catch (e) {
    error.value = apiErrorMessage(e, "No se pudieron cargar los rubros");
  }
}

function resetExplorerFilters(): void {
  explorerFiltroEstado.value = "";
  explorerVista.value = "arbol";
  highlightStat.value = "total";
}

function scrollToExplorer(): void {
  explorerCardRef.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyStatFilter(kind: "total" | "niveles" | string): void {
  if (kind === "total") {
    explorerFiltroEstado.value = "";
    explorerVista.value = "tabla";
    highlightStat.value = "total";
  } else if (kind === "niveles") {
    explorerFiltroEstado.value = "";
    explorerVista.value = "arbol";
    highlightStat.value = "niveles";
  } else if (highlightStat.value === kind) {
    explorerFiltroEstado.value = "";
    explorerVista.value = "tabla";
    highlightStat.value = "total";
  } else {
    explorerFiltroEstado.value = kind;
    explorerVista.value = "secciones";
    highlightStat.value = kind;
  }
  scrollToExplorer();
}

async function selectVersion(id: string): Promise<void> {
  selectedId.value = id;
  error.value = null;
  msg.value = null;
  showReferenteEdit.value = false;
  resetExplorerFilters();
  await loadRubros();
  if (versionStripRef.value) versionStripRef.value.open = false;
}

async function ensureUsersLoaded(): Promise<void> {
  if (users.value.length > 0) return;
  users.value = await api.listUsers();
}

function openReferenteEdit(): void {
  responsableDraft.value = selectedVersion.value?.responsableId ?? "";
  referenteEditError.value = null;
  showReferenteEdit.value = true;
  void ensureUsersLoaded().catch((e) => {
    referenteEditError.value = e instanceof Error ? e.message : "No se pudieron cargar los usuarios";
  });
}

async function saveReferente(): Promise<void> {
  if (!selectedId.value) return;
  savingReferente.value = true;
  referenteEditError.value = null;
  try {
    await api.setPlanResponsable(selectedId.value, responsableDraft.value || null);
    showReferenteEdit.value = false;
    msg.value = "Referente del área actualizado";
    await loadVersions();
    await loadRubros();
  } catch (e) {
    referenteEditError.value = e instanceof Error ? e.message : "No se pudo guardar";
  } finally {
    savingReferente.value = false;
  }
}

async function createVersion(): Promise<void> {
  try {
    const v = await api.createPlanVersion(newVersion.value, newNotas.value);
    showCreate.value = false;
    await loadVersions();
    selectedId.value = v.id;
    await loadRubros();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error";
  }
}

async function onImportFilesChange(files: File[]): Promise<void> {
  const file = files[0];
  if (!file || !selectedId.value) return;
  importing.value = true;
  error.value = null;
  try {
    const csv = await file.text();
    await importCsv(csv);
  } catch (e) {
    error.value = apiErrorMessage(e, "No se pudo importar el archivo");
  } finally {
    importing.value = false;
    importFiles.value = [];
  }
}

async function downloadPlantillaCsv(): Promise<void> {
  error.value = null;
  try {
    const res = await fetch("/fixtures/plan-cuentas-plantilla.csv");
    if (!res.ok) throw new Error("No se pudo descargar la plantilla");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plan-cuentas-plantilla.csv";
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = apiErrorMessage(e, "No se pudo descargar la plantilla CSV");
  }
}

function openSampleCsvModal(): void {
  sampleCsvError.value = null;
  showSampleCsvModal.value = true;
}

async function confirmSampleCsv(): Promise<void> {
  if (!selectedId.value || importing.value) return;
  importing.value = true;
  sampleCsvError.value = null;
  error.value = null;
  msg.value = null;
  try {
    const res = await fetch("/fixtures/plan-cuentas-ejemplo.csv");
    if (!res.ok) throw new Error("No se pudo cargar el CSV de ejemplo");
    const csv = await res.text();
    const ok = await importCsv(csv);
    if (ok) showSampleCsvModal.value = false;
    else sampleCsvError.value = error.value ?? "No se pudo importar el CSV de ejemplo";
  } catch (e) {
    sampleCsvError.value = apiErrorMessage(e, "No se pudo importar el CSV de ejemplo");
  } finally {
    importing.value = false;
  }
}

async function importCsv(csv: string): Promise<boolean> {
  if (!selectedId.value) return false;
  error.value = null;
  try {
    const r = await api.importPlanCsv(selectedId.value, csv);
    msg.value = `Importados ${r.imported} rubros`;
    highlightStat.value = "total";
    explorerFiltroEstado.value = "";
    explorerVista.value = "tabla";
    await loadRubros();
    await loadVersions();
    await scrollToExplorerAfterRender();
    return true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error importando";
    return false;
  }
}

async function scrollToExplorerAfterRender(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  scrollToExplorer();
}

async function solicitarAprobacion(): Promise<void> {
  if (!selectedId.value) return;
  try {
    await api.solicitarAprobacionPlan(selectedId.value);
    msg.value = "Enviado a aprobación";
    await loadVersions();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error";
  }
}

async function aprobar(): Promise<void> {
  if (!selectedId.value) return;
  try {
    await api.aprobarPlan(selectedId.value, "Aprobado en Sprint 1");
    msg.value = "Versión aprobada y marcada como vigente";
    await loadVersions();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error";
  }
}

onMounted(loadVersions);
</script>

<style scoped>
.version-strip {
  margin-bottom: 0.85rem;
  overflow: hidden;
  padding: 0;
}

.version-strip__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.38rem 0.75rem;
  min-height: 2rem;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.version-strip[open] .version-strip__summary {
  padding: 0.65rem 1rem;
  min-height: 0;
}

.version-strip__summary::-webkit-details-marker {
  display: none;
}

.version-strip__summary::before {
  content: "▸";
  flex-shrink: 0;
  margin-right: 0.1rem;
  font-size: 0.72rem;
  color: var(--ink-faint);
  transition: transform 0.15s;
}

.version-strip[open] .version-strip__summary::before {
  font-size: 0.85rem;
  transform: rotate(90deg);
}

.version-strip__summary-main {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  overflow: hidden;
}

.version-strip[open] .version-strip__summary-main {
  flex-wrap: wrap;
  overflow: visible;
}

.version-strip__title {
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--brand-ink);
  white-space: nowrap;
}

.version-strip[open] .version-strip__title {
  font-size: 0.95rem;
}

.version-strip__current {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.version-strip[open] .version-strip__current {
  flex-wrap: wrap;
  overflow: visible;
  font-size: 0.82rem;
}

.version-strip__summary .estado-badge {
  font-size: 0.58rem;
  padding: 0.08rem 0.28rem;
}

.version-strip[open] .version-strip__summary .estado-badge {
  font-size: 0.62rem;
  padding: 0.12rem 0.35rem;
}

.version-strip__hint {
  font-size: 0.82rem;
  color: var(--ink-faint);
}

.version-strip__count {
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.1rem 0.38rem;
  border-radius: 999px;
  background: var(--panel-2);
  color: var(--ink-soft);
  line-height: 1.2;
}

.version-strip__body {
  padding: 0 1rem 0.85rem;
  border-top: 1px solid var(--line);
}

.version-tabs {
  display: flex;
  gap: 0.35rem;
  overflow-x: auto;
  padding: 0.75rem 0 0.15rem;
  margin: 0 -0.25rem;
  scrollbar-width: thin;
}

.version-tab {
  flex: 1 1 0;
  min-width: 9.5rem;
  max-width: 16rem;
  text-align: left;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
  cursor: pointer;
  display: grid;
  gap: 0.3rem;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s, transform 0.12s;
}

.version-tab:hover {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand) 5%, var(--panel-2));
}

.version-tab--active {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 10%, var(--panel));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 14%, transparent);
}

.version-tab--vigente {
  border-bottom: 3px solid var(--ok);
}

.version-tab__label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
}

.version-tab__meta {
  font-size: 0.78rem;
  color: var(--ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.version-tab__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.estado-badge {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.12rem 0.35rem;
  border-radius: 4px;
}

.estado-badge--borrador {
  background: var(--neutral-bg);
  color: var(--neutral-fg);
}

.estado-badge--pendiente_aprobacion {
  background: var(--warn-bg);
  color: var(--warn);
}

.estado-badge--aprobado {
  background: var(--ok-bg);
  color: var(--ok);
}

.estado-badge--vigente {
  background: var(--ok-bg);
  color: var(--ok);
}

.estado-badge--obsoleto {
  background: var(--bad-bg);
  color: var(--bad);
}

.content {
  width: 100%;
  min-width: 0;
}

.main {
  display: grid;
  gap: 0.85rem;
  min-width: 0;
}

.hero {
  padding: 1.1rem 1.15rem;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--brand) 10%, var(--panel)) 0%,
    var(--panel) 55%
  );
}

.hero__top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
}

.hero__aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.55rem;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.hero__label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-faint);
}

.hero h2 {
  margin: 0.15rem 0 0;
  font-size: 1.35rem;
  color: var(--brand-ink);
}

.hero__meta {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.hero__sep {
  margin: 0 0.35rem;
  color: var(--ink-faint);
}

.hero__ref-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}

.hero__ref {
  color: var(--ink-faint);
}

.hero__ref--btn {
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  cursor: pointer;
  text-decoration: underline dotted transparent;
  transition: color 0.15s, text-decoration-color 0.15s;
}

.hero__ref--btn:hover,
.hero__ref--btn:focus-visible {
  color: var(--brand-ink);
  text-decoration-color: currentColor;
  outline: none;
}

.hero__ref-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink-faint);
  font-size: 0.82rem;
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s;
}

.hero__ref-info:hover,
.hero__ref-info:focus-visible {
  color: var(--brand-ink);
  outline: none;
}

.hero__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: flex-start;
}

.stat-pill {
  display: grid;
  gap: 0.1rem;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  min-width: 4.5rem;
  text-align: left;
  font: inherit;
}

.stat-pill--btn {
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
}

.stat-pill--btn:hover {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
}

.stat-pill--btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent);
}

.stat-pill--active {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 16%, transparent);
}

.stat-pill span {
  font-size: 0.68rem;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stat-pill strong {
  font-size: 1.05rem;
  color: var(--ink);
}

.stat-pill--sec {
  border-color: color-mix(in srgb, var(--c) 25%, var(--line));
  background: var(--bg);
}

.stat-pill--sec span {
  color: var(--c);
}

.stat-pill--sec strong {
  color: var(--c);
}

.block-title {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
  color: var(--brand-ink);
}

.import-card {
  padding-top: 0.85rem;
}

.import-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.import-card__head .block-title {
  margin-bottom: 0.2rem;
}

.import-card__intro {
  margin: 0;
  font-size: 0.84rem;
  color: var(--ink-soft);
  line-height: 1.45;
  max-width: 36rem;
}

.import-card__template {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.import-card__demo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.65rem 1rem;
  margin-bottom: 0.75rem;
  padding: 0.7rem 0.85rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--brand) 22%, var(--line));
  background: color-mix(in srgb, var(--brand) 6%, var(--panel-2));
}

.import-card__demo-copy {
  flex: 1;
  min-width: 14rem;
}

.import-card__demo-copy strong {
  display: block;
  font-size: 0.86rem;
  color: var(--brand-ink);
  margin-bottom: 0.25rem;
}

.import-card__demo-copy p {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.import-card__demo-rubros {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.65rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.75rem;
  color: var(--ink-faint);
}

.import-card__demo-rubros li {
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
  background: var(--panel);
  border: 1px solid var(--line);
}

.import-card__demo-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  align-self: center;
}

.sample-csv-modal__lead {
  margin: 0;
  font-size: 0.92rem;
  color: var(--ink-soft);
  line-height: 1.5;
}

.sample-csv-modal__box {
  margin-top: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--line);
}

.sample-csv-modal__box-title {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ink);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.sample-csv-modal__list {
  margin: 0;
  padding-left: 1.15rem;
  font-size: 0.86rem;
  color: var(--ink-soft);
  line-height: 1.55;
}

.sample-csv-modal__list li + li {
  margin-top: 0.3rem;
}

.sample-csv-modal__preview {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.84rem;
  color: var(--ink-soft);
  font-family: ui-monospace, monospace;
}

.sample-csv-modal__note {
  margin: 0.85rem 0 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  background: var(--warn-bg);
  border: 1px solid color-mix(in srgb, var(--warn) 25%, var(--line));
  font-size: 0.82rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.explorer-card {
  padding: 0.85rem 1rem 1rem;
}

.explorer-head {
  margin-bottom: 0.75rem;
}

.banner-msg {
  margin: 0;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--brand) 10%, var(--panel));
  color: var(--brand-ink);
  font-size: 0.875rem;
}

.historial-card summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--ink);
  padding: 0.25rem 0;
}

.historial-list {
  margin: 0.75rem 0 0;
  padding-left: 0;
  list-style: none;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.historial-list li {
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--line);
}

.historial-date {
  color: var(--ink-faint);
  margin-right: 0.35rem;
}

.empty-main {
  text-align: center;
  padding: 3rem 1.5rem;
  color: var(--ink-soft);
}

.empty-main__ico {
  font-size: 2rem;
  opacity: 0.35;
  margin-bottom: 0.75rem;
}

.hint {
  color: var(--ink-soft);
  font-size: 0.875rem;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.modal-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
}

.btn-sm {
  padding: 0.35rem 0.65rem;
  font-size: 0.82rem;
}
</style>
