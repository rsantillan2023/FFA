<template>
  <div class="explorer">
    <div class="toolbar">
      <div class="toolbar__search">
        <i class="fas fa-search toolbar__ico" aria-hidden="true"></i>
        <input
          v-model="busqueda"
          class="input"
          type="search"
          placeholder="Buscar código, nombre o alias…"
          aria-label="Buscar rubros"
        />
      </div>

      <select v-model="filtroEstado" class="input input--filter" aria-label="Filtrar por sección">
        <option value="">Todas las secciones</option>
        <option v-for="(meta, key) in ESTADO_FINANCIERO_META" :key="key" :value="key">
          {{ meta.label }}
        </option>
      </select>

      <select v-model="filtroCorriente" class="input input--filter" aria-label="Filtrar corriente">
        <option value="">Corriente / no corriente</option>
        <option value="si">Solo corriente</option>
        <option value="no">Solo no corriente</option>
      </select>

      <div class="vista-toggle" role="group" aria-label="Formato de visualización">
        <button
          v-for="modo in VISTAS"
          :key="modo.id"
          type="button"
          class="vista-btn"
          :class="{ 'vista-btn--active': vista === modo.id }"
          :title="modo.detalle"
          @click="vista = modo.id"
        >
          <i :class="modo.icon" aria-hidden="true"></i>
          {{ modo.label }}
        </button>
      </div>
    </div>

    <p v-if="hayFiltros" class="filtro-resumen">
      Mostrando <strong>{{ statsFiltrados.total }}</strong> de {{ stats.total }} rubros
      <button type="button" class="link-btn" @click="limpiarFiltros">Limpiar filtros</button>
    </p>

    <!-- Vista árbol -->
    <div v-if="vista === 'arbol' && rubrosFiltrados.length" class="panel panel--tree">
      <PlanRubroTree :rubros="rubrosFiltrados" :busqueda="busqueda.trim()" />
    </div>

    <!-- Vista tabla -->
    <div v-else-if="vista === 'tabla' && planosFiltrados.length" class="panel panel--table-wrap">
      <table class="rubro-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Denominación</th>
            <th>Sección</th>
            <th>Corriente</th>
            <th>Signo</th>
            <th>Padre</th>
            <th>Alias</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in planosFiltrados" :key="r.id" :style="{ '--depth': r.depth }">
            <td class="col-codigo">
              <span class="depth-pad" :style="{ width: `${r.depth * 1.1}rem` }"></span>
              <code>{{ r.codigo }}</code>
            </td>
            <td class="col-nombre">{{ r.nombre }}</td>
            <td>
              <span class="chip" :style="chipStyle(r.estadoFinanciero)">
                {{ estadoLabel(r.estadoFinanciero) }}
              </span>
            </td>
            <td>{{ corrienteLabel(r.corriente) }}</td>
            <td>
              <span v-if="r.convencionSigno === 'invertido'" class="signo-tag">Invertido</span>
              <span v-else class="signo-tag signo-tag--normal">Normal</span>
            </td>
            <td>{{ r.padreCodigo ?? "—" }}</td>
            <td class="col-alias">{{ r.aliases?.join(" · ") || "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Vista por secciones (balance / ER) -->
    <div v-else-if="vista === 'secciones'" class="panel panel--sections">
      <div
        v-for="sec in SECCIONES_ORDEN"
        :key="sec"
        class="seccion-card"
        :style="{ '--sec-color': ESTADO_FINANCIERO_META[sec]?.color, '--sec-bg': ESTADO_FINANCIERO_META[sec]?.bg }"
      >
        <header class="seccion-head" @click="toggleSeccion(sec)">
          <div class="seccion-head__title">
            <i :class="ESTADO_FINANCIERO_META[sec]?.icon" aria-hidden="true"></i>
            <strong>{{ ESTADO_FINANCIERO_META[sec]?.label }}</strong>
            <span class="seccion-count">{{ secciones[sec]?.length ?? 0 }} rubro(s)</span>
          </div>
          <i
            class="fas fa-chevron-down seccion-chevron"
            :class="{ 'seccion-chevron--open': seccionesAbiertas.has(sec) }"
            aria-hidden="true"
          ></i>
        </header>
        <div v-show="seccionesAbiertas.has(sec)" class="seccion-body">
          <table v-if="secciones[sec]?.length" class="rubro-table rubro-table--compact">
            <thead>
              <tr>
                <th>Código</th>
                <th>Denominación</th>
                <th>Nivel</th>
                <th>Corriente</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in flattenSection(secciones[sec] ?? [])" :key="r.id">
                <td><code>{{ r.codigo }}</code></td>
                <td>
                  <span class="depth-indent" :style="{ paddingLeft: `${r.depth * 0.85}rem` }">{{ r.nombre }}</span>
                </td>
                <td>{{ r.depth + 1 }}</td>
                <td>{{ corrienteLabel(r.corriente) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="seccion-empty">Sin rubros en esta sección con los filtros actuales.</p>
        </div>
      </div>
    </div>

    <p v-if="!rubros.length" class="empty">
      <i class="fas fa-sitemap empty__ico" aria-hidden="true"></i>
      Sin rubros en esta versión. Importe un CSV o use el asistente para cargar el plan.
    </p>
    <p v-else-if="statsFiltrados.total === 0" class="empty">Ningún rubro coincide con la búsqueda o filtros.</p>
  </div>
</template>

<script setup lang="ts">
import type { RubroInstitucionalDto } from "@ffa/shared";
import { EstadoFinanciero } from "@ffa/shared";
import { computed, ref, watch } from "vue";
import PlanRubroTree from "./PlanRubroTree.vue";
import {
  ESTADO_FINANCIERO_META,
  filterRubroTree,
  flattenRubros,
  planStats,
  rubrosPorSeccion,
  type PlanVistaModo,
  type RubroPlano,
} from "../utils/planCuentasDisplay";

const props = defineProps<{
  rubros: RubroInstitucionalDto[];
  filtroEstado?: string;
  vista?: PlanVistaModo;
}>();

const emit = defineEmits<{
  "update:filtroEstado": [value: string];
  "update:vista": [value: PlanVistaModo];
}>();

const VISTAS: { id: PlanVistaModo; label: string; icon: string; detalle: string }[] = [
  { id: "arbol", label: "Árbol", icon: "fas fa-sitemap", detalle: "Jerarquía padre → hijo" },
  { id: "tabla", label: "Tabla", icon: "fas fa-table", detalle: "Listado plano tipo ERP" },
  { id: "secciones", label: "Secciones", icon: "fas fa-columns", detalle: "Activo, pasivo, patrimonio y resultados" },
];

const SECCIONES_ORDEN = [
  EstadoFinanciero.ACTIVO,
  EstadoFinanciero.PASIVO,
  EstadoFinanciero.PATRIMONIO,
  EstadoFinanciero.RESULTADOS,
];

const busqueda = ref("");
const filtroCorriente = ref<"" | "si" | "no">("");
const filtroEstadoLocal = ref("");
const vistaLocal = ref<PlanVistaModo>("arbol");
const seccionesAbiertas = ref(new Set<string>(SECCIONES_ORDEN));

const filtroEstado = computed({
  get: () => (props.filtroEstado !== undefined ? props.filtroEstado : filtroEstadoLocal.value),
  set: (value: string) => {
    if (props.filtroEstado !== undefined) emit("update:filtroEstado", value);
    else filtroEstadoLocal.value = value;
  },
});

const vista = computed({
  get: () => (props.vista !== undefined ? props.vista : vistaLocal.value),
  set: (value: PlanVistaModo) => {
    if (props.vista !== undefined) emit("update:vista", value);
    else vistaLocal.value = value;
  },
});

const stats = computed(() => planStats(props.rubros));

const rubrosFiltrados = computed(() =>
  filterRubroTree(props.rubros, busqueda.value, filtroEstado.value || undefined, filtroCorriente.value || undefined)
);

const planosFiltrados = computed((): RubroPlano[] =>
  flattenRubros(rubrosFiltrados.value).filter((r) =>
    !filtroEstado.value || r.estadoFinanciero === filtroEstado.value
  )
);

const statsFiltrados = computed(() => planStats(rubrosFiltrados.value));

const secciones = computed(() =>
  rubrosPorSeccion(props.rubros, busqueda.value, filtroEstado.value || undefined, filtroCorriente.value || undefined)
);

const hayFiltros = computed(
  () => Boolean(busqueda.value.trim() || filtroEstado.value || filtroCorriente.value)
);

watch(
  () => props.rubros,
  () => {
    seccionesAbiertas.value = new Set(SECCIONES_ORDEN);
  }
);

watch(filtroEstado, (estado) => {
  if (estado) seccionesAbiertas.value = new Set([estado]);
});

function flattenSection(rubros: RubroInstitucionalDto[]): RubroPlano[] {
  return flattenRubros(rubros);
}

function estadoLabel(estado: string): string {
  return ESTADO_FINANCIERO_META[estado]?.label ?? estado;
}

function chipStyle(estado: string): Record<string, string> {
  const m = ESTADO_FINANCIERO_META[estado];
  if (!m) return {};
  return { color: m.color, backgroundColor: m.bg };
}

function corrienteLabel(v?: boolean): string {
  if (v === true) return "Corriente";
  if (v === false) return "No corriente";
  return "—";
}

function toggleSeccion(sec: string): void {
  const next = new Set(seccionesAbiertas.value);
  if (next.has(sec)) next.delete(sec);
  else next.add(sec);
  seccionesAbiertas.value = next;
}

function limpiarFiltros(): void {
  busqueda.value = "";
  filtroEstado.value = "";
  filtroCorriente.value = "";
}
</script>

<style scoped>
.explorer {
  display: grid;
  gap: 0.85rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  padding: 0.75rem;
  border-radius: 10px;
  background: var(--panel-2);
  border: 1px solid var(--line);
}

.toolbar__search {
  position: relative;
  flex: 1;
  min-width: min(100%, 220px);
}

.toolbar__ico {
  position: absolute;
  left: 0.65rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink-faint);
  font-size: 0.85rem;
  pointer-events: none;
}

.toolbar__search .input {
  width: 100%;
  padding-left: 2rem;
}

.input--filter {
  min-width: 9.5rem;
  max-width: 11rem;
}

.vista-toggle {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--panel);
}

.vista-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.65rem;
  border: none;
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  border-right: 1px solid var(--line);
}

.vista-btn:last-child {
  border-right: none;
}

.vista-btn--active {
  background: var(--brand);
  color: #fff;
}

.filtro-resumen {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.link-btn {
  margin-left: 0.5rem;
  border: none;
  background: none;
  color: var(--brand);
  cursor: pointer;
  font-size: inherit;
  text-decoration: underline;
}

.panel {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  overflow: hidden;
}

.panel--tree {
  padding: 0.65rem 0.85rem;
  max-height: min(62vh, 720px);
  overflow: auto;
}

.panel--table-wrap {
  max-height: min(62vh, 720px);
  overflow: auto;
}

.rubro-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.rubro-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--panel-2);
}

.rubro-table th {
  text-align: left;
  padding: 0.55rem 0.65rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
  border-bottom: 2px solid var(--line);
}

.rubro-table td {
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}

.rubro-table tbody tr:hover {
  background: color-mix(in srgb, var(--brand) 4%, var(--panel));
}

.col-codigo {
  display: flex;
  align-items: center;
  gap: 0;
  white-space: nowrap;
}

.depth-pad {
  display: inline-block;
  flex-shrink: 0;
}

.col-codigo code {
  background: color-mix(in srgb, var(--brand) 10%, var(--panel-2));
  color: var(--brand-ink);
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
  font-size: 0.78rem;
  font-weight: 600;
}

.col-nombre {
  font-weight: 500;
  color: var(--ink);
}

.col-alias {
  color: var(--ink-soft);
  font-size: 0.78rem;
  max-width: 14rem;
}

.chip {
  display: inline-block;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.signo-tag {
  font-size: 0.72rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: #fef3c7;
  color: #92400e;
}

.signo-tag--normal {
  background: var(--panel-2);
  color: var(--ink-soft);
}

.panel--sections {
  display: grid;
  gap: 0.65rem;
  padding: 0.65rem;
  background: var(--panel-2);
  border: none;
}

.seccion-card {
  border: 1px solid color-mix(in srgb, var(--sec-color) 25%, var(--line));
  border-radius: 10px;
  background: var(--panel);
  overflow: hidden;
}

.seccion-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
  background: var(--sec-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--sec-color) 15%, var(--line));
}

.seccion-head__title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--sec-color);
}

.seccion-count {
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 0.85;
}

.seccion-chevron {
  color: var(--sec-color);
  transition: transform 0.2s;
}

.seccion-chevron--open {
  transform: rotate(180deg);
}

.seccion-body {
  padding: 0.5rem;
}

.rubro-table--compact th,
.rubro-table--compact td {
  padding: 0.35rem 0.5rem;
}

.depth-indent {
  display: block;
}

.seccion-empty {
  margin: 0.5rem;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.empty {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--ink-soft);
  border: 1px dashed var(--line-2);
  border-radius: 10px;
  background: var(--panel-2);
}

.empty__ico {
  display: block;
  font-size: 1.75rem;
  margin-bottom: 0.5rem;
  opacity: 0.45;
}
</style>
