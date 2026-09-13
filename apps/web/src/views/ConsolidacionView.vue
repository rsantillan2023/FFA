<template>
  <div>
    <PageHeader
      page-key="consolidacion"
      :subtitle="pasoActual === 4 && result ? result.nombre : 'Arme el análisis del grupo en 4 pasos'"
      :back-link="{ to: '/repositorio', label: '← Archivo de fichas aprobadas' }"
    />

    <section v-if="historial.length || cargandoHistorial" class="card historial">
      <header class="historial__head">
        <div>
          <h2>Análisis guardados</h2>
          <p class="lead">Grupos consolidados que quedaron registrados al finalizar el paso 3.</p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" :disabled="cargandoHistorial" @click="cargarHistorial">
          {{ cargandoHistorial ? "Actualizando…" : "Actualizar" }}
        </button>
      </header>

      <p v-if="historialError" class="error-msg">{{ historialError }}</p>
      <p v-else-if="cargandoHistorial && !historial.length" class="hint">Cargando historial…</p>

      <table v-if="historial.length" class="historial-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Empresas</th>
            <th>Fichas</th>
            <th>Patrimonio total</th>
            <th>Guardado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in historial" :key="g.id">
            <td>{{ g.nombre }}</td>
            <td>{{ g.empresasCount }}</td>
            <td>{{ g.periodosCount }}</td>
            <td>{{ fmt(g.patrimonioTotal) }}</td>
            <td>{{ fmtFecha(g.creadoAt) }}</td>
            <td>
              <button class="btn btn-ghost btn-sm" type="button" @click="abrirGrupoGuardado(g.id)">
                Ver resultado
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <nav class="steps" aria-label="Pasos para consolidar un grupo">
      <button
        v-for="(paso, index) in PASOS"
        :key="paso.id"
        type="button"
        class="step"
        :class="{
          'step--active': pasoActual === paso.id,
          'step--done': pasoActual > paso.id,
          'step--disabled': !puedeIrAPaso(paso.id),
        }"
        :disabled="!puedeIrAPaso(paso.id)"
        @click="irAPaso(paso.id)"
      >
        <span class="step__num">{{ index + 1 }}</span>
        <span class="step__body">
          <strong>{{ paso.titulo }}</strong>
          <small>{{ paso.detalle }}</small>
        </span>
      </button>
    </nav>

    <!-- Paso 1: Nombre -->
    <section v-show="pasoActual === 1" class="card paso">
      <h2>1. Nombre del análisis de grupo</h2>
      <p class="lead">
        Elegí un nombre que identifique el holding o conjunto de empresas (ej. «Grupo Salud 2025»).
      </p>
      <label class="label" for="cons-nombre">Nombre descriptivo</label>
      <input
        id="cons-nombre"
        v-model="nombre"
        class="input input--wide"
        placeholder="Grupo holding 2024-2025"
      />
      <div class="paso__actions">
        <button class="btn btn-primary" type="button" :disabled="!nombre.trim()" @click="irAPaso(2)">
          Siguiente: elegir fichas
        </button>
      </div>
    </section>

    <!-- Paso 2: Elegir fichas -->
    <section v-show="pasoActual === 2" class="card paso">
      <h2>2. Elegir fichas aprobadas del archivo</h2>
      <p class="lead">
        Marque entre <strong>2 y 12 fichas</strong> de empresas distintas o relacionadas. Todas deben usar el
        mismo plan de cuentas.
      </p>

      <div class="filter-row">
        <input
          v-model="busqueda"
          class="input input--wide"
          type="search"
          placeholder="Buscar por RUT, empresa o número de caso…"
          @input="debouncedBuscar"
        />
        <button class="btn btn-ghost" type="button" :disabled="cargandoFichas" @click="cargarFichas">
          {{ cargandoFichas ? "Cargando…" : "Actualizar" }}
        </button>
      </div>

      <p class="seleccion-resumen">
        <strong>{{ seleccionadas.length }}</strong> de 12 fichas seleccionadas
        <span v-if="seleccionadas.length < 2"> — faltan al menos 2 para consolidar</span>
      </p>

      <div v-if="cargandoFichas" class="hint">Cargando fichas del archivo…</div>

      <ul v-else-if="fichasDisponibles.length" class="ficha-list">
        <li v-for="f in fichasDisponibles" :key="f.fichaId">
          <label class="ficha-item" :class="{ 'ficha-item--selected': estaSeleccionada(f.fichaId) }">
            <input
              type="checkbox"
              :checked="estaSeleccionada(f.fichaId)"
              :disabled="!estaSeleccionada(f.fichaId) && seleccionadas.length >= 12"
              @change="toggleFicha(f)"
            />
            <span class="ficha-item__main">
              <strong>{{ f.contribuyenteNombre ?? "Sin empresa" }}</strong>
              <span class="ficha-item__meta">
                {{ f.contribuyenteRut ?? "—" }} · Ejercicio {{ f.ejercicio ?? "—" }} · {{ f.numero }}
              </span>
            </span>
            <SemaforoIndicator :value="f.semaforo" />
          </label>
        </li>
      </ul>
      <p v-else class="hint hint--warn">No hay fichas aprobadas que coincidan. Probá otra búsqueda o cargá casos en el archivo.</p>

      <div class="paso__actions">
        <button class="btn btn-ghost" type="button" @click="irAPaso(1)">← Volver</button>
        <button class="btn btn-primary" type="button" :disabled="seleccionadas.length < 2" @click="irAPaso(3)">
          Revisar selección ({{ seleccionadas.length }})
        </button>
      </div>
    </section>

    <!-- Paso 3: Revisar -->
    <section v-show="pasoActual === 3" class="card paso">
      <h2>3. Revisar antes de consolidar</h2>
      <p class="lead">
        Análisis: <strong>{{ nombre }}</strong> · {{ seleccionadas.length }} ficha(s) ·
        {{ empresasUnicas }} empresa(s)
      </p>

      <table v-if="seleccionadas.length" class="review-table">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>RUT</th>
            <th>Ejercicio</th>
            <th>Caso</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in seleccionadas" :key="f.fichaId">
            <td>{{ f.contribuyenteNombre ?? "—" }}</td>
            <td>{{ f.contribuyenteRut ?? "—" }}</td>
            <td>{{ f.ejercicio ?? "—" }}</td>
            <td>{{ f.numero }}</td>
            <td>
              <button type="button" class="btn btn-ghost btn-sm" @click="quitarFicha(f.fichaId)">Quitar</button>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="error" class="error-msg">{{ error }}</p>

      <div class="paso__actions">
        <button class="btn btn-ghost" type="button" @click="irAPaso(2)">← Agregar o quitar fichas</button>
        <button class="btn btn-primary" type="button" :disabled="loading || seleccionadas.length < 2" @click="ejecutarConsolidacion">
          {{ loading ? "Consolidando…" : "Consolidar grupo" }}
        </button>
      </div>
    </section>

    <!-- Paso 4: Resultado -->
    <section v-if="pasoActual === 4 && result" class="paso">
      <div class="card">
        <header class="result-head">
          <div>
            <h2>4. Resultado consolidado</h2>
            <p class="lead">{{ result.nombre }}</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" @click="nuevoAnalisis">Nuevo análisis</button>
        </header>

        <p v-if="guardadoOk" class="hint hint--ok">Análisis guardado en el historial de grupos consolidados.</p>

        <p class="result-meta">
          {{ result.empresasCount }} empresa(s) · {{ result.periodosCount }} ficha(s) · Plan
          {{ result.planCuentasVersionId?.slice(-6) ?? "—" }}
        </p>

        <div class="grid-4">
          <div class="stat">
            <span>AC total</span>
            <strong>{{ fmt(result.totales.activoCorriente) }}</strong>
          </div>
          <div class="stat">
            <span>PC total</span>
            <strong>{{ fmt(result.totales.pasivoCorriente) }}</strong>
          </div>
          <div class="stat">
            <span>Patrimonio</span>
            <strong>{{ fmt(result.totales.patrimonio) }}</strong>
          </div>
          <div class="stat">
            <span>Utilidad</span>
            <strong>{{ fmt(result.totales.utilidad) }}</strong>
          </div>
        </div>

        <h3>Trazabilidad por empresa</h3>
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Ejercicio</th>
              <th>AC</th>
              <th>Patrimonio</th>
              <th>Utilidad</th>
              <th>Caso</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in result.items" :key="item.fichaId">
              <td>{{ item.contribuyenteNombre ?? "—" }}</td>
              <td>{{ item.ejercicio ?? "—" }}</td>
              <td>{{ fmt(item.activoCorriente) }}</td>
              <td>{{ fmt(item.patrimonio) }}</td>
              <td>{{ fmt(item.utilidad) }}</td>
              <td>
                <RouterLink :to="`/casos/${item.casoId}/expediente`" class="link">
                  Ver expediente
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>

        <h3 v-if="Object.keys(result.indicadoresAgregados).length">Indicadores promedio del grupo</h3>
        <ul v-if="Object.keys(result.indicadoresAgregados).length" class="ind-list">
          <li v-for="(val, code) in result.indicadoresAgregados" :key="code">
            <strong>{{ code }}</strong>: {{ val != null ? val.toFixed(2) : "N/C" }}
          </li>
        </ul>
      </div>

      <div class="paso__actions">
        <button class="btn btn-ghost" type="button" @click="irAPaso(3)">← Modificar selección</button>
        <button class="btn btn-primary" type="button" @click="nuevoAnalisis">Armar otro grupo</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type {
  ConsolidacionGrupoDto,
  ConsolidacionGrupoListItemDto,
  RepositorioItemDto,
} from "@ffa/shared";
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "../api/client";
import PageHeader from "../components/PageHeader.vue";
import SemaforoIndicator from "../components/SemaforoIndicator.vue";

interface FichaSeleccionada {
  fichaId: string;
  casoId: string;
  numero: string;
  contribuyenteNombre?: string;
  contribuyenteRut?: string;
  ejercicio?: number;
  semaforo?: string;
}

const PASOS = [
  { id: 1, titulo: "Nombre", detalle: "Identifique el grupo" },
  { id: 2, titulo: "Fichas", detalle: "Elija del archivo" },
  { id: 3, titulo: "Revisar", detalle: "Confirme selección" },
  { id: 4, titulo: "Resultado", detalle: "Totales del grupo" },
] as const;

const route = useRoute();
const pasoActual = ref(1);
const nombre = ref("Análisis de grupo");
const busqueda = ref("");
const fichasDisponibles = ref<FichaSeleccionada[]>([]);
const seleccionadas = ref<FichaSeleccionada[]>([]);
const cargandoFichas = ref(false);
const result = ref<ConsolidacionGrupoDto | null>(null);
const loading = ref(false);
const error = ref("");
const historial = ref<ConsolidacionGrupoListItemDto[]>([]);
const cargandoHistorial = ref(false);
const historialError = ref("");
const guardadoOk = ref(false);

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

const empresasUnicas = computed(
  () => new Set(seleccionadas.value.map((f) => f.contribuyenteNombre ?? f.numero)).size
);

function fmt(n?: number): string {
  return n != null ? n.toLocaleString("es-CL") : "—";
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function cargarHistorial(): Promise<void> {
  cargandoHistorial.value = true;
  historialError.value = "";
  try {
    const res = await api.listConsolidaciones(1, 10);
    historial.value = res.items;
  } catch (e) {
    historialError.value = e instanceof Error ? e.message : "Error al cargar historial";
    historial.value = [];
  } finally {
    cargandoHistorial.value = false;
  }
}

async function abrirGrupoGuardado(id: string): Promise<void> {
  error.value = "";
  guardadoOk.value = false;
  loading.value = true;
  try {
    const grupo = await api.getConsolidacionGrupo(id);
    result.value = grupo;
    nombre.value = grupo.nombre;
    pasoActual.value = 4;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "No se pudo abrir el análisis guardado";
  } finally {
    loading.value = false;
  }
}

function mapRepositorioItem(r: RepositorioItemDto): FichaSeleccionada | null {
  if (!r.fichaId) return null;
  return {
    fichaId: r.fichaId,
    casoId: r.casoId,
    numero: r.numero,
    contribuyenteNombre: r.contribuyenteNombre,
    contribuyenteRut: r.contribuyenteRut,
    ejercicio: r.ejercicio,
    semaforo: r.semaforo,
  };
}

function estaSeleccionada(fichaId: string): boolean {
  return seleccionadas.value.some((f) => f.fichaId === fichaId);
}

function toggleFicha(f: FichaSeleccionada): void {
  if (estaSeleccionada(f.fichaId)) {
    seleccionadas.value = seleccionadas.value.filter((x) => x.fichaId !== f.fichaId);
  } else if (seleccionadas.value.length < 12) {
    seleccionadas.value = [...seleccionadas.value, f];
  }
}

function quitarFicha(fichaId: string): void {
  seleccionadas.value = seleccionadas.value.filter((f) => f.fichaId !== fichaId);
  if (seleccionadas.value.length < 2) pasoActual.value = 2;
}

function puedeIrAPaso(paso: number): boolean {
  if (paso === 1) return true;
  if (paso === 2) return Boolean(nombre.value.trim());
  if (paso === 3) return seleccionadas.value.length >= 2;
  if (paso === 4) return Boolean(result.value);
  return false;
}

function irAPaso(paso: number): void {
  if (!puedeIrAPaso(paso)) return;
  pasoActual.value = paso;
  error.value = "";
}

async function cargarFichas(): Promise<void> {
  cargandoFichas.value = true;
  error.value = "";
  try {
    const res = await api.getRepositorio({
      q: busqueda.value.trim() || undefined,
      limit: 50,
    });
    fichasDisponibles.value = res.items
      .map(mapRepositorioItem)
      .filter((f): f is FichaSeleccionada => f != null);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al cargar fichas";
    fichasDisponibles.value = [];
  } finally {
    cargandoFichas.value = false;
  }
}

function debouncedBuscar(): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void cargarFichas();
  }, 300);
}

async function ejecutarConsolidacion(): Promise<void> {
  error.value = "";
  const ids = seleccionadas.value.map((f) => f.fichaId);
  if (ids.length < 2) {
    error.value = "Seleccione al menos 2 fichas";
    return;
  }
  loading.value = true;
  guardadoOk.value = false;
  try {
    result.value = await api.consolidarGrupo(nombre.value.trim(), ids);
    pasoActual.value = 4;
    guardadoOk.value = true;
    await cargarHistorial();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error al consolidar";
  } finally {
    loading.value = false;
  }
}

function nuevoAnalisis(): void {
  pasoActual.value = 1;
  result.value = null;
  seleccionadas.value = [];
  nombre.value = "Análisis de grupo";
  error.value = "";
  guardadoOk.value = false;
  void cargarFichas();
}

async function abrirDesdeQuery(): Promise<void> {
  const grupoId = (route.query.grupoId as string)?.trim();
  if (grupoId) {
    await abrirGrupoGuardado(grupoId);
    return;
  }
  await preseleccionarDesdeQuery();
}

async function preseleccionarDesdeQuery(): Promise<void> {
  const raw = (route.query.fichaIds as string) ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) return;

  await cargarFichas();
  const map = new Map(fichasDisponibles.value.map((f) => [f.fichaId, f]));
  seleccionadas.value = ids.map((id) => map.get(id)).filter((f): f is FichaSeleccionada => f != null);

  if (seleccionadas.value.length >= 2) {
    pasoActual.value = 3;
    await ejecutarConsolidacion();
  } else if (seleccionadas.value.length) {
    pasoActual.value = 2;
  }
}

onMounted(async () => {
  await Promise.all([cargarFichas(), cargarHistorial()]);
  await abrirDesdeQuery();
});
</script>

<style scoped>
.steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
  margin-bottom: 1rem;
}

@media (max-width: 900px) {
  .steps {
    grid-template-columns: 1fr 1fr;
  }
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.step:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
}

.step--active {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 12%, transparent);
}

.step--done .step__num {
  background: var(--ok, #059669);
}

.step--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.step__num {
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--brand);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}

.step__body {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.step__body strong {
  font-size: 0.85rem;
  color: var(--ink);
}

.step__body small {
  font-size: 0.72rem;
  color: var(--ink-soft);
  line-height: 1.3;
}

.paso h2 {
  margin: 0 0 0.35rem;
  color: var(--brand-ink);
  font-size: 1.05rem;
}

.lead {
  margin: 0 0 1rem;
  color: var(--ink-soft);
  font-size: 0.9rem;
  line-height: 1.45;
}

.input--wide {
  width: 100%;
  max-width: 420px;
}

.filter-row {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.filter-row .input--wide {
  flex: 1;
  min-width: min(100%, 260px);
  max-width: none;
}

.seleccion-resumen {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: var(--ink-soft);
}

.ficha-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
  max-height: 420px;
  overflow-y: auto;
}

.ficha-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  background: var(--panel);
  transition: border-color 0.15s, background 0.15s;
}

.ficha-item:hover {
  border-color: color-mix(in srgb, var(--brand) 30%, var(--line));
}

.ficha-item--selected {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 6%, var(--panel));
}

.ficha-item__main {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.ficha-item__main strong {
  font-size: 0.88rem;
}

.ficha-item__meta {
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.review-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.review-table th,
.review-table td {
  text-align: left;
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--line);
}

.paso__actions {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}

.hint {
  color: var(--ink-soft);
  font-size: 0.875rem;
}

.hint--warn {
  color: var(--warn, #b45309);
}

.hint--ok {
  color: var(--ok, #047857);
  margin-bottom: 0.75rem;
}

.historial {
  margin-bottom: 1rem;
}

.historial__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.historial__head h2 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  color: var(--brand-ink);
}

.historial-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.historial-table th,
.historial-table td {
  text-align: left;
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--line);
}

.result-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.result-meta {
  color: var(--ink-soft);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin: 1rem 0;
}

@media (max-width: 768px) {
  .grid-4 {
    grid-template-columns: 1fr 1fr;
  }
}

.stat {
  background: var(--panel-2);
  border: 1px solid var(--line);
  padding: 0.75rem;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat span {
  font-size: 0.8rem;
  color: var(--ink-soft);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

th,
td {
  text-align: left;
  padding: 0.4rem;
  border-bottom: 1px solid var(--line);
}

.ind-list {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
}

.link {
  color: var(--brand);
  text-decoration: none;
  font-size: 0.85rem;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}
</style>
