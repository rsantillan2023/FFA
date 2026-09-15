<template>
  <div>
    <PageHeader page-key="flujo" />

    <section class="card block">
      <header class="block-head">
        <div class="block-head__text">
          <h2>{{ procesoExtendido ? "Proceso extendido SOOFT FINYX" : "Recorrido estándar de una ficha (7 etapas)" }}</h2>
          <p class="lead">
            {{
              procesoExtendido
                ? "Camino feliz de la ficha más maestros institucionales y módulos de análisis posterior (comparación, consolidación, operación)."
                : "Cada expediente recorre estas etapas en orden, alineadas con el pipeline automático (AA.1–AA.8). Hacé clic en un nodo para ver el detalle."
            }}
          </p>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm proceso-toggle"
          :aria-expanded="procesoExtendido"
          @click="procesoExtendido = !procesoExtendido"
        >
          <i :class="procesoExtendido ? 'fas fa-compress-alt' : 'fas fa-expand-alt'" aria-hidden="true"></i>
          {{ procesoExtendido ? "Ver camino feliz (7 etapas)" : "Proceso extendido" }}
        </button>
      </header>

      <WorkflowDiagram
        :steps="diagramSteps"
        :selected-id="selectedId"
        :class="{ 'workflow-diagram--extended-view': procesoExtendido }"
        interactive
        @select="openStepModal"
      />

      <p v-if="!procesoExtendido" class="extend-hint">
        ¿Necesitás ver comparación, consolidación o maestros?
        <button type="button" class="link-btn" @click="procesoExtendido = true">Mostrar proceso extendido</button>
      </p>
    </section>

    <WorkflowStepModal
      v-if="stepModalOpen && selectedStep"
      v-model="stepModalOpen"
      :step="selectedStep"
    />

    <section class="card block">
      <h2>Buscar y abrir un expediente</h2>
      <p class="lead">
        Elija un caso de la lista o filtre por empresa, RUT, etapa o estado. No necesita conocer el número interno.
      </p>

      <div class="filters">
        <div class="filter-field filter-field--wide">
          <label class="label" for="flujo-buscar">Buscar</label>
          <input
            id="flujo-buscar"
            v-model="filtroTexto"
            class="input"
            placeholder="Empresa, RUT o número de caso…"
            type="search"
          />
        </div>
        <div class="filter-field">
          <label class="label" for="flujo-etapa">Etapa del proceso</label>
          <select id="flujo-etapa" v-model="filtroEtapa" class="input">
            <option value="">Todas las etapas</option>
            <option v-for="s in WORKFLOW_MACRO_STEPS" :key="s.id" :value="s.id">
              {{ s.orden }}. {{ s.titulo }}
            </option>
            <option value="interrumpido">Interrumpido (error / rechazo)</option>
          </select>
        </div>
        <div class="filter-field">
          <label class="label" for="flujo-estado">Estado operativo</label>
          <select id="flujo-estado" v-model="filtroEstado" class="input">
            <option value="">Todos</option>
            <option v-for="(label, key) in ESTADO_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <div class="filter-field">
          <label class="label" for="flujo-semaforo">Semáforo</label>
          <select id="flujo-semaforo" v-model="filtroSemaforo" class="input">
            <option value="">Todos</option>
            <option value="verde">Alta confianza</option>
            <option value="amarillo">Media — revisar</option>
            <option value="rojo">Baja — alerta</option>
          </select>
        </div>
        <button class="btn btn-ghost" type="button" :disabled="loading" @click="loadCasos">
          {{ loading ? "Cargando…" : "Actualizar" }}
        </button>
      </div>

      <p v-if="loadError" class="error-msg">{{ loadError }}</p>

      <div v-if="loading && !items.length" class="empty">Cargando expedientes…</div>

      <div v-else-if="!items.length" class="empty">
        No hay fichas cargadas en el sistema. Puede crear una desde la bandeja de fichas.
      </div>

      <template v-else>
        <p class="result-hint">
          {{ casosFiltrados.length }} de {{ items.length }} expediente(s)
          <span v-if="filtroTexto || filtroEtapa || filtroEstado || filtroSemaforo"> — filtros activos</span>
        </p>

        <div class="table-wrap">
          <table v-if="casosFiltrados.length">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>RUT</th>
                <th>Ejercicio</th>
                <th>Etapa actual</th>
                <th>Estado</th>
                <th>Semáforo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in casosFiltrados" :key="c.id">
                <td>
                  <strong>{{ contribLabel(c.contribuyenteId).nombre }}</strong>
                  <span class="numero-caso">{{ c.numero }}</span>
                </td>
                <td>{{ contribLabel(c.contribuyenteId).rut || "—" }}</td>
                <td>{{ c.periodoEjercicio ?? "—" }}</td>
                <td>{{ macroEtapaLabelForEstado(c.estado) }}</td>
                <td>
                  <span class="badge" :class="c.estado">{{ estadoLabel(c.estado) }}</span>
                </td>
                <td>
                  <SemaforoIndicator :value="c.semaforo" />
                </td>
                <td class="actions-cell">
                  <RouterLink
                    :to="{ name: 'caso-expediente', params: { id: c.id }, query: { from: 'flujo' } }"
                    class="btn btn-primary btn-sm"
                  >
                    Ver expediente
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="empty">Ningún expediente coincide con los filtros. Pruebe otro criterio.</p>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { CasoEstado, type CasoDto } from "@ffa/shared";
import { computed, onMounted, ref } from "vue";
import { useCloseOnRouteLeave } from "../composables/useCloseOnRouteLeave";
import { RouterLink } from "vue-router";
import { api } from "../api/client";
import { CASO_ESTADO_LABELS, casoEstadoLabel } from "../utils/casoEstadoDisplay";
import PageHeader from "../components/PageHeader.vue";
import SemaforoIndicator from "../components/SemaforoIndicator.vue";
import WorkflowDiagram from "../components/WorkflowDiagram.vue";
import WorkflowStepModal from "../components/WorkflowStepModal.vue";
import {
  findWorkflowStep,
  macroEtapaIdForEstado,
  macroEtapaLabelForEstado,
  workflowStepsExtended,
  workflowStepsGeneral,
  WORKFLOW_MACRO_STEPS,
} from "../constants/workflow";

const procesoExtendido = ref(false);
const stepsBase = workflowStepsGeneral();
const stepsExtended = workflowStepsExtended();
const diagramSteps = computed(() => (procesoExtendido.value ? stepsExtended : stepsBase));
const selectedId = ref(WORKFLOW_MACRO_STEPS[0]?.id ?? "carga");
const stepModalOpen = ref(false);
const items = ref<CasoDto[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const filtroTexto = ref("");
const filtroEtapa = ref("");
const filtroEstado = ref("");
const filtroSemaforo = ref("");
const contribMap = ref<Map<string, { nombre: string; rut?: string }>>(new Map());

const ESTADO_LABELS = CASO_ESTADO_LABELS;

const selectedStep = computed(() => findWorkflowStep(selectedId.value));

useCloseOnRouteLeave(stepModalOpen);

function openStepModal(id: string): void {
  selectedId.value = id;
  stepModalOpen.value = true;
}

function estadoLabel(estado: string): string {
  return casoEstadoLabel(estado);
}

function contribLabel(contribuyenteId?: string): { nombre: string; rut?: string } {
  if (!contribuyenteId) return { nombre: "Sin contribuyente" };
  return contribMap.value.get(contribuyenteId) ?? { nombre: "Contribuyente desconocido" };
}

function matchesTexto(c: CasoDto, q: string): boolean {
  const contrib = contribLabel(c.contribuyenteId);
  const haystack = [contrib.nombre, contrib.rut ?? "", c.numero, c.observaciones ?? ""]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

const casosFiltrados = computed(() => {
  const q = filtroTexto.value.trim().toLowerCase();
  return items.value.filter((c) => {
    if (q && !matchesTexto(c, q)) return false;
    if (filtroEtapa.value && macroEtapaIdForEstado(c.estado) !== filtroEtapa.value) return false;
    if (filtroEstado.value && c.estado !== filtroEstado.value) return false;
    if (filtroSemaforo.value && c.semaforo !== filtroSemaforo.value) return false;
    return true;
  });
});

async function loadContribuyentes(): Promise<void> {
  const res = await api.listContribuyentes(undefined, 1, 100);
  const map = new Map<string, { nombre: string; rut?: string }>();
  for (const c of res.items) {
    map.set(c.id, { nombre: c.razonSocial, rut: c.rut });
  }
  contribMap.value = map;
}

async function loadCasos(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    await loadContribuyentes();
    const res = await api.listCasos({}, 1, 50);
    items.value = res.items;
  } catch {
    loadError.value = "No se pudieron cargar los expedientes. Verifique que la API esté activa.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadCasos();
});
</script>

<style scoped>
.block {
  margin-bottom: 1rem;
}

.block-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-bottom: 1rem;
}

.block-head__text {
  flex: 1 1 280px;
  min-width: 0;
}

.block-head h2 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  color: var(--brand-ink);
}

.lead {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.85rem;
  max-width: 68ch;
}

.proceso-toggle {
  flex-shrink: 0;
  white-space: nowrap;
}

.extend-hint {
  margin: 0.85rem 0 0;
  font-size: 0.8rem;
  color: var(--ink-faint);
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--brand);
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
}

.link-btn:hover {
  color: var(--brand-ink);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 160px;
}

.filter-field--wide {
  flex: 1 1 240px;
  min-width: 220px;
}

.filter-field .input {
  width: 100%;
}

.result-hint {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: var(--ink-soft);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 0.55rem 0.4rem;
  vertical-align: middle;
}

th {
  font-size: 0.75rem;
  color: var(--ink-soft);
  font-weight: 600;
}

.numero-caso {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.72rem;
  color: var(--ink-faint);
  font-weight: 400;
}

.muted {
  color: var(--ink-faint);
}

.actions-cell {
  white-space: nowrap;
  text-align: right;
}

.empty {
  color: var(--ink-soft);
  font-size: 0.85rem;
  padding: 0.5rem 0;
}

.btn-sm {
  padding: 0.3rem 0.65rem;
  font-size: 0.8rem;
}
</style>
