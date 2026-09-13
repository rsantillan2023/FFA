<template>
  <div>
    <PageHeader
      page-key="comparacion"
      :subtitle="contribuyenteNombre ? `Empresa: ${contribuyenteNombre}` : 'Busque la empresa por RUT o razón social'"
      :back-link="{ to: '/repositorio', label: '← Archivo de fichas aprobadas' }"
    />

    <section class="card picker">
      <h3>Elegir contribuyente</h3>
      <p class="lead">
        No necesita el identificador interno del sistema. Escriba RUT o razón social, o elija de la lista de
        empresas con fichas en el archivo.
      </p>

      <div v-if="contribuyenteSeleccionado" class="seleccionado">
        <div class="seleccionado__info">
          <span class="seleccionado__label">Empresa seleccionada</span>
          <strong>{{ contribuyenteSeleccionado.razonSocial }}</strong>
          <span v-if="contribuyenteSeleccionado.rut" class="seleccionado__rut">{{ contribuyenteSeleccionado.rut }}</span>
          <span v-if="contribuyenteSeleccionado.fichasEnArchivo" class="seleccionado__meta">
            {{ contribuyenteSeleccionado.fichasEnArchivo }} ficha(s) aprobada(s) en archivo
          </span>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" @click="limpiarSeleccion">Cambiar empresa</button>
      </div>

      <template v-else>
        <label class="label" for="cmp-buscar">Buscar por RUT o razón social</label>
        <div class="filter-row">
          <input
            id="cmp-buscar"
            v-model="busqueda"
            class="input input--wide"
            type="search"
            placeholder="Ej. 76123456-7 o Tech Andina SpA"
            @input="debouncedBuscar"
          />
          <button class="btn btn-ghost" type="button" :disabled="buscando" @click="buscarContribuyentes">
            {{ buscando ? "Buscando…" : "Buscar" }}
          </button>
        </div>

        <p v-if="buscando" class="hint">Buscando empresas…</p>
        <p v-else-if="busqueda.trim() && !opciones.length" class="hint hint--warn">
          Sin resultados para «{{ busqueda.trim() }}». Pruebe con otro RUT o nombre.
        </p>

        <ul v-if="opciones.length" class="opciones">
          <li v-for="c in opciones" :key="c.id">
            <button type="button" class="opcion-btn" @click="seleccionarContribuyente(c)">
              <span class="opcion-btn__nombre">{{ c.razonSocial }}</span>
              <span class="opcion-btn__meta">
                <span v-if="c.rut">{{ c.rut }}</span>
                <span v-else>Sin RUT</span>
                <span v-if="c.fichasEnArchivo"> · {{ c.fichasEnArchivo }} ficha(s) en archivo</span>
              </span>
            </button>
          </li>
        </ul>
      </template>
    </section>

    <div v-if="contribuyenteId && historial.length" class="card">
      <h3>Línea de tiempo por ejercicio</h3>
      <p class="lead">Elija la ficha del ejercicio que quiere comparar contra el anterior.</p>
      <ul class="timeline">
        <li v-for="h in historial" :key="h.fichaId">
          <strong>Ejercicio {{ h.ejercicio ?? "—" }}</strong>
          <span class="timeline__caso">{{ h.numero }}</span>
          <SemaforoIndicator :value="h.semaforo" />
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            :class="{ 'btn--active': fichaActualId === h.fichaId }"
            @click="seleccionarActual(h.fichaId)"
          >
            {{ fichaActualId === h.fichaId ? "Seleccionada" : "Usar esta ficha" }}
          </button>
        </li>
      </ul>
    </div>

    <p v-else-if="contribuyenteId && !cargandoHistorial && historialCargado" class="card hint hint--warn">
      Esta empresa no tiene fichas aprobadas suficientes para comparar ejercicios. Revise el archivo o el directorio
      de contribuyentes.
    </p>

    <div v-if="fichaActualId" class="card">
      <h3>Comparación ejercicio actual vs anterior</h3>
      <p>
        Ficha: <strong>{{ fichaActualLabel }}</strong>
        <span v-if="comparacion?.ejercicioAnterior">
          · se compara con ejercicio <strong>{{ comparacion.ejercicioAnterior }}</strong>
        </span>
      </p>
      <button class="btn btn-primary" type="button" :disabled="comparando" @click="comparar">
        {{ comparando ? "Comparando…" : "Ejecutar comparación" }}
      </button>
    </div>

    <div v-if="comparacion?.deterioros.length" class="card alert">
      <h3>Deterioros detectados</h3>
      <ul>
        <li v-for="(d, i) in comparacion.deterioros" :key="i" :class="d.severidad">
          {{ d.mensaje }} ({{ d.severidad }})
        </li>
      </ul>
    </div>

    <div v-if="comparacion" class="grid-2">
      <div class="card">
        <h3>Balance</h3>
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Actual</th>
              <th>Anterior</th>
              <th>Var %</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in comparacion.balance" :key="m.concepto">
              <td>{{ m.concepto }}</td>
              <td>{{ fmt(m.actual) }}</td>
              <td>{{ fmt(m.anterior) }}</td>
              <td>{{ fmtPct(m.variacionPct) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="card">
        <h3>Indicadores</h3>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Actual</th>
              <th>Anterior</th>
              <th>Var %</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in comparacion.indicadores" :key="m.codigo">
              <td>{{ m.codigo }}</td>
              <td>{{ fmt(m.actual) }}</td>
              <td>{{ fmt(m.anterior) }}</td>
              <td>{{ fmtPct(m.variacionPct) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="criterios.length" class="card">
      <h3>Criterios históricos de clasificación</h3>
      <table>
        <thead>
          <tr>
            <th>Denominación</th>
            <th>Rubro</th>
            <th>Aprobado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in criterios" :key="c.id">
            <td>{{ c.denominacionOrigen }}</td>
            <td>{{ c.rubroCodigo ?? "—" }}</td>
            <td>{{ new Date(c.aprobadoAt).toLocaleDateString("es-CL") }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="error" class="error-msg">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import type {
  ComparacionEjerciciosDto,
  ContribuyenteDto,
  CriterioHistoricoDto,
  HistorialFichaDto,
} from "@ffa/shared";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api/client";
import PageHeader from "../components/PageHeader.vue";
import SemaforoIndicator from "../components/SemaforoIndicator.vue";

interface ContribuyenteOpcion {
  id: string;
  rut?: string;
  razonSocial: string;
  fichasEnArchivo?: number;
}

const route = useRoute();
const contribuyenteId = ref((route.query.contribuyenteId as string) ?? "");
const fichaActualId = ref((route.query.fichaId as string) ?? "");
const contribuyenteNombre = ref("");
const contribuyenteSeleccionado = ref<ContribuyenteOpcion | null>(null);
const busqueda = ref("");
const opciones = ref<ContribuyenteOpcion[]>([]);
const buscando = ref(false);
const cargandoHistorial = ref(false);
const historialCargado = ref(false);
const comparando = ref(false);
const historial = ref<HistorialFichaDto[]>([]);
const comparacion = ref<ComparacionEjerciciosDto | null>(null);
const criterios = ref<CriterioHistoricoDto[]>([]);
const error = ref("");

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

const fichaActualLabel = computed(() => {
  const h = historial.value.find((x) => x.fichaId === fichaActualId.value);
  if (h) return `${h.numero} (ejercicio ${h.ejercicio ?? "—"})`;
  return fichaActualId.value.slice(-8);
});

function fmt(n: number | null): string {
  return n != null ? n.toLocaleString("es-CL", { maximumFractionDigits: 2 }) : "—";
}

function fmtPct(n: number | null): string {
  return n != null ? `${n.toFixed(1)}%` : "—";
}

function mapContribuyente(c: ContribuyenteDto, fichasEnArchivo?: number): ContribuyenteOpcion {
  return {
    id: c.id,
    rut: c.rut,
    razonSocial: c.razonSocial,
    fichasEnArchivo,
  };
}

function dedupeFromRepositorio(items: Awaited<ReturnType<typeof api.getRepositorio>>["items"]): ContribuyenteOpcion[] {
  const map = new Map<string, ContribuyenteOpcion>();
  for (const item of items) {
    if (!item.contribuyenteId) continue;
    const prev = map.get(item.contribuyenteId);
    if (prev) {
      prev.fichasEnArchivo = (prev.fichasEnArchivo ?? 1) + 1;
      continue;
    }
    map.set(item.contribuyenteId, {
      id: item.contribuyenteId,
      rut: item.contribuyenteRut,
      razonSocial: item.contribuyenteNombre ?? "Sin razón social",
      fichasEnArchivo: 1,
    });
  }
  return [...map.values()].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es"));
}

async function buscarContribuyentes(): Promise<void> {
  buscando.value = true;
  error.value = "";
  try {
    const q = busqueda.value.trim();
    if (q) {
      const res = await api.listContribuyentes(q, 1, 30);
      opciones.value = res.items.map((c) => mapContribuyente(c));
    } else {
      const repo = await api.getRepositorio({ limit: 50 });
      opciones.value = dedupeFromRepositorio(repo.items);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al buscar";
    opciones.value = [];
  } finally {
    buscando.value = false;
  }
}

function debouncedBuscar(): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void buscarContribuyentes();
  }, 300);
}

async function resolverContribuyentePorId(id: string): Promise<ContribuyenteOpcion> {
  const repo = await api.getRepositorio({ contribuyenteId: id, limit: 10 });
  if (repo.items.length) {
    const first = repo.items[0]!;
    return {
      id,
      rut: first.contribuyenteRut,
      razonSocial: first.contribuyenteNombre ?? "Contribuyente",
      fichasEnArchivo: repo.total,
    };
  }
  return { id, razonSocial: "Contribuyente seleccionado" };
}

async function seleccionarContribuyente(c: ContribuyenteOpcion): Promise<void> {
  contribuyenteSeleccionado.value = c;
  contribuyenteId.value = c.id;
  contribuyenteNombre.value = c.razonSocial;
  comparacion.value = null;
  if (!fichaActualId.value) historial.value = [];
  await loadHistorial();
}

function limpiarSeleccion(): void {
  contribuyenteSeleccionado.value = null;
  contribuyenteId.value = "";
  contribuyenteNombre.value = "";
  fichaActualId.value = "";
  historial.value = [];
  comparacion.value = null;
  criterios.value = [];
  historialCargado.value = false;
  error.value = "";
  void buscarContribuyentes();
}

function seleccionarActual(id: string): void {
  fichaActualId.value = id;
  comparacion.value = null;
}

async function loadHistorial(): Promise<void> {
  if (!contribuyenteId.value.trim()) return;
  cargandoHistorial.value = true;
  error.value = "";
  historialCargado.value = false;
  try {
    historial.value = await api.getHistorialFichas(contribuyenteId.value);
    criterios.value = await api.getCriteriosHistoricos(contribuyenteId.value);
    if (historial.value.length) {
      const tieneFicha = historial.value.some((h) => h.fichaId === fichaActualId.value);
      if (!fichaActualId.value || !tieneFicha) {
        fichaActualId.value = historial.value[0]!.fichaId;
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error";
    historial.value = [];
    criterios.value = [];
  } finally {
    cargandoHistorial.value = false;
    historialCargado.value = true;
  }
}

async function comparar(): Promise<void> {
  if (!contribuyenteId.value || !fichaActualId.value) return;
  comparando.value = true;
  error.value = "";
  try {
    comparacion.value = await api.compararEjercicios(contribuyenteId.value, fichaActualId.value);
    contribuyenteNombre.value = comparacion.value.contribuyenteNombre ?? contribuyenteNombre.value;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error";
  } finally {
    comparando.value = false;
  }
}

onMounted(async () => {
  if (contribuyenteId.value) {
    const resolved = await resolverContribuyentePorId(contribuyenteId.value);
    contribuyenteSeleccionado.value = resolved;
    contribuyenteNombre.value = resolved.razonSocial;
    await loadHistorial();
    if (fichaActualId.value) await comparar();
    return;
  }
  await buscarContribuyentes();
});
</script>

<style scoped>
.picker h3 {
  margin: 0 0 0.35rem;
  color: var(--brand-ink);
}

.lead {
  margin: 0 0 0.85rem;
  color: var(--ink-soft);
  font-size: 0.9rem;
  line-height: 1.45;
}

.filter-row {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  flex-wrap: wrap;
}

.input--wide {
  flex: 1;
  min-width: min(100%, 280px);
}

.seleccionado {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--brand) 22%, var(--line));
}

.seleccionado__info {
  display: grid;
  gap: 0.15rem;
}

.seleccionado__label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}

.seleccionado__rut,
.seleccionado__meta {
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.opciones {
  list-style: none;
  margin: 0.85rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.opcion-btn {
  width: 100%;
  text-align: left;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  cursor: pointer;
  display: grid;
  gap: 0.15rem;
  transition: border-color 0.15s, background 0.15s;
}

.opcion-btn:hover {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand) 6%, var(--panel));
}

.opcion-btn__nombre {
  font-weight: 600;
  color: var(--ink);
}

.opcion-btn__meta {
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.hint {
  margin: 0.75rem 0 0;
  color: var(--ink-soft);
  font-size: 0.875rem;
}

.hint--warn {
  color: var(--warn, #b45309);
}

.timeline {
  list-style: none;
  padding: 0;
  margin: 0;
}

.timeline li {
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.timeline__caso {
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.btn-sm {
  padding: 0.25rem 0.55rem;
  font-size: 0.8rem;
  margin-left: auto;
}

.btn--active {
  border-color: var(--brand);
  color: var(--brand-ink);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 1rem;
}

@media (max-width: 900px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 0.4rem;
  font-size: 0.875rem;
}

.alert {
  border-left: 4px solid #f59e0b;
  margin-top: 1rem;
}

.alert .grave {
  color: var(--bad);
}

.alert .moderado {
  color: var(--warn);
}
</style>
