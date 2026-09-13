<template>
  <div>
    <PageHeader page-key="repositorio" />

    <div class="card filters">
      <input v-model="busqueda" class="input" placeholder="RUT o razón social" />
      <input v-model="ejercicio" class="input" type="number" placeholder="Ejercicio" />
      <button class="btn btn-primary" type="button" @click="load">Buscar</button>
      <p v-if="loadError" class="error-msg">{{ loadError }}</p>
      <a class="btn btn-ghost" :href="exportUrl" target="_blank" rel="noopener">Export CSV</a>
      <RouterLink to="/consolidacion" class="btn btn-ghost">Consolidar grupo</RouterLink>
    </div>

    <div v-if="gruposGuardados.length || cargandoGrupos" class="card grupos-card">
      <header class="grupos-card__head">
        <div>
          <h2>Grupos consolidados guardados</h2>
          <p class="grupos-card__hint">Análisis de cartera ya calculados y persistidos.</p>
        </div>
        <RouterLink to="/consolidacion" class="link">Ver todos →</RouterLink>
      </header>
      <p v-if="gruposError" class="error-msg">{{ gruposError }}</p>
      <ul v-else-if="gruposGuardados.length" class="grupos-list">
        <li v-for="g in gruposGuardados" :key="g.id">
          <RouterLink :to="`/consolidacion?grupoId=${g.id}`" class="grupos-list__link">
            <strong>{{ g.nombre }}</strong>
            <span>{{ g.empresasCount }} empresa(s) · Patrimonio {{ fmtNum(g.patrimonioTotal) }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-else-if="!cargandoGrupos" class="empty">Aún no hay grupos guardados. Use «Consolidar grupo» para crear uno.</p>
    </div>

    <div class="card">
      <table v-if="items.length">
        <thead>
          <tr>
            <th>Caso</th>
            <th>Contribuyente</th>
            <th>Ejercicio</th>
            <th title="Nivel de confianza del procesamiento">Confianza</th>
            <th>Ficha</th>
            <th>Documento</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in items" :key="r.casoId">
            <td>{{ r.numero }}</td>
            <td>{{ r.contribuyenteNombre ?? "—" }}</td>
            <td>{{ r.ejercicio ?? "—" }}</td>
            <td class="td-semaforo">
              <SemaforoIndicator :value="r.semaforo" />
            </td>
            <td>v{{ r.fichaVersion ?? "—" }}</td>
            <td>
              <span v-if="r.documentoNombre" :title="r.documentoId">{{ r.documentoNombre }}</span>
              <span v-else>—</span>
            </td>
            <td class="actions-cell">
              <button class="btn btn-ghost btn-sm" type="button" @click="verDetalle(r.casoId)">
                Detalle
              </button>
              <RouterLink
                :to="{ name: 'caso-expediente', params: { id: r.casoId }, query: { from: 'repositorio' } }"
                class="btn btn-ghost btn-sm"
              >
                Expediente
              </RouterLink>
              <RouterLink
                v-if="r.contribuyenteId && r.fichaId"
                :to="`/comparacion?contribuyenteId=${r.contribuyenteId}&fichaId=${r.fichaId}`"
                class="btn btn-ghost btn-sm"
              >
                Comparar
              </RouterLink>
              <RouterLink
                v-if="r.estado === 'informe_generado' || r.estado === 'aprobado'"
                :to="`/casos/${r.casoId}/informe`"
                class="btn btn-primary btn-sm"
              >
                Informe
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loading" class="empty">Sin registros aprobados</p>
      <p v-if="loading">Cargando…</p>
      <p class="total">{{ total }} registro(s)</p>
    </div>

    <CasoDetalleModal
      v-model="showDetalleModal"
      expediente-from="repositorio"
      :loading="detalleLoading"
      :error="detalleError"
      :detalle="detalle"
      :lineas="lineas"
      :lineas-loading="detalleLineasLoading"
      :progreso="detalleProgreso"
      :pipeline-etapas="pipelineEtapas"
      @update:model-value="onDetalleModalChange"
    />
  </div>
</template>

<script setup lang="ts">
import type {
  ConsolidacionGrupoListItemDto,
  LineaContableDto,
  PipelineEtapaDto,
  RepositorioItemDto,
} from "@ffa/shared";
import type { CasoProgresoDto } from "@ffa/shared";
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api, type CasoDetalleDto } from "../api/client";
import CasoDetalleModal from "../components/CasoDetalleModal.vue";
import SemaforoIndicator from "../components/SemaforoIndicator.vue";
import PageHeader from "../components/PageHeader.vue";
import { useCloseOnRouteLeave } from "../composables/useCloseOnRouteLeave";
import { apiErrorMessage } from "../utils/apiError";

const items = ref<RepositorioItemDto[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref("");
const ejercicio = ref("");
const busqueda = ref("");
const gruposGuardados = ref<ConsolidacionGrupoListItemDto[]>([]);
const cargandoGrupos = ref(false);
const gruposError = ref("");
const showDetalleModal = ref(false);
const detalleLoading = ref(false);
const detalleError = ref<string | null>(null);
const detalle = ref<CasoDetalleDto | null>(null);
const lineas = ref<LineaContableDto[]>([]);
const detalleLineasLoading = ref(false);
const detalleProgreso = ref<CasoProgresoDto | null>(null);
const pipelineEtapas = ref<PipelineEtapaDto[]>([]);
useCloseOnRouteLeave(showDetalleModal);

function onDetalleModalChange(open: boolean): void {
  if (!open) {
    detalle.value = null;
    lineas.value = [];
    detalleError.value = null;
    pipelineEtapas.value = [];
    detalleProgreso.value = null;
  }
}

async function verDetalle(casoId: string): Promise<void> {
  showDetalleModal.value = true;
  detalleLoading.value = true;
  detalleLineasLoading.value = true;
  detalleError.value = null;
  lineas.value = [];
  detalle.value = null;
  pipelineEtapas.value = [];
  detalleProgreso.value = null;
  try {
    const [caso, etapas, casoLineas] = await Promise.all([
      api.getCaso(casoId),
      api.getPipelineEtapas(casoId).catch(() => []),
      api.getCasoLineas(casoId),
    ]);
    detalle.value = caso;
    pipelineEtapas.value = etapas;
    lineas.value = casoLineas;
  } catch (e) {
    detalleError.value = apiErrorMessage(e, "No se pudo abrir el detalle de la ficha");
  } finally {
    detalleLoading.value = false;
    detalleLineasLoading.value = false;
  }
}

function fmtNum(n?: number): string {
  return n != null ? n.toLocaleString("es-CL") : "—";
}

async function loadGruposGuardados(): Promise<void> {
  cargandoGrupos.value = true;
  gruposError.value = "";
  try {
    const res = await api.listConsolidaciones(1, 5);
    gruposGuardados.value = res.items;
  } catch (e) {
    gruposError.value = apiErrorMessage(e);
    gruposGuardados.value = [];
  } finally {
    cargandoGrupos.value = false;
  }
}

const exportUrl = computed(() =>
  api.getRepositorioExportUrl({
    q: busqueda.value || undefined,
    ejercicio: ejercicio.value ? Number(ejercicio.value) : undefined,
  })
);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const res = await api.getRepositorio({
      ejercicio: ejercicio.value ? Number(ejercicio.value) : undefined,
      q: busqueda.value || undefined,
    });
    items.value = res.items;
    total.value = res.total;
  } catch (e) {
    loadError.value = apiErrorMessage(e, "No se pudo buscar en el repositorio");
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
  void loadGruposGuardados();
});
</script>

<style scoped>
.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.filters .input {
  max-width: 180px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid var(--line);
}

.actions-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.td-semaforo {
  width: 1%;
  white-space: nowrap;
}

.actions-cell .btn-sm {
  text-decoration: none;
}

.empty,
.total {
  color: var(--ink-soft);
  font-size: 0.875rem;
}

a.btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.grupos-card {
  margin-bottom: 1rem;
}

.grupos-card__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.grupos-card__head h2 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  color: var(--brand-ink);
}

.grupos-card__hint {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.85rem;
}

.grupos-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.grupos-list__link {
  display: grid;
  gap: 0.15rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, background 0.15s;
}

.grupos-list__link:hover {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand) 5%, var(--panel));
}

.grupos-list__link span {
  font-size: 0.8rem;
  color: var(--ink-soft);
}
</style>
