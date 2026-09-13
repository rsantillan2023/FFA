<template>
  <div>
    <PageHeader
      page-key="ia-uso"
      :back-link="{ to: '/admin', label: '← Centro de configuración' }"
    >
      <template #actions>
        <button class="btn btn-ghost btn-sm" type="button" @click="load">Actualizar</button>
      </template>
    </PageHeader>

    <p v-if="err" class="banner-msg banner-msg--err">{{ err }}</p>

    <section v-if="resumen" class="card provider-note">
      <p>
        Proveedor principal:
        <strong>{{ extractionProviderLabel(extractionProvider) }}</strong>.
        Anthropic (Claude) solo aparece aquí cuando se usa como respaldo automático
        (si OpenAI falla) o si lo elegís como proveedor principal en
        <RouterLink to="/admin/operacion">Operación</RouterLink>.
      </p>
      <div class="provider-chips">
        <button
          type="button"
          class="chip"
          :class="{ 'chip--active': filtros.proveedor === '' }"
          @click="setProveedor('')"
        >
          Todos ({{ resumen.totalLlamadas }})
        </button>
        <button
          v-for="p in resumen.porProveedor"
          :key="p.proveedor"
          type="button"
          class="chip"
          :class="[
            `chip--${p.proveedor}`,
            { 'chip--active': filtros.proveedor === p.proveedor },
          ]"
          @click="setProveedor(p.proveedor)"
        >
          {{ proveedorLabel(p.proveedor) }} ({{ p.llamadas }})
        </button>
        <span v-if="!anthropicEnResumen" class="chip chip--empty">Anthropic (0)</span>
      </div>
    </section>

    <section class="card filters">
      <h2>Filtros</h2>
      <div class="filters__grid">
        <div>
          <label class="label" for="filtro-desde">Desde</label>
          <input id="filtro-desde" v-model="filtros.desde" class="input" type="date" />
        </div>
        <div>
          <label class="label" for="filtro-hasta">Hasta</label>
          <input id="filtro-hasta" v-model="filtros.hasta" class="input" type="date" />
        </div>
        <div>
          <label class="label" for="filtro-proveedor">Proveedor</label>
          <select id="filtro-proveedor" v-model="filtros.proveedor" class="input">
            <option value="">Todos</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
        <div>
          <label class="label" for="filtro-funcion">Función</label>
          <select id="filtro-funcion" v-model="filtros.funcion" class="input">
            <option value="">Todas</option>
            <option value="extract_vision">Extracción visión</option>
            <option value="extract_metadata">Extracción metadatos</option>
            <option value="informe_narrativa">Informe narrativa</option>
          </select>
        </div>
        <div class="filters__actions">
          <button class="btn btn-primary btn-sm" type="button" @click="load">Aplicar</button>
          <button class="btn btn-ghost btn-sm" type="button" @click="limpiarFiltros">Limpiar</button>
        </div>
      </div>
    </section>

    <section v-if="resumen" class="kpi-grid">
      <article class="card kpi">
        <span class="kpi__label">Llamadas totales</span>
        <strong class="kpi__value">{{ resumen.totalLlamadas }}</strong>
        <span class="kpi__sub">{{ resumen.exitosas }} OK · {{ resumen.fallidas }} error</span>
      </article>
      <article class="card kpi">
        <span class="kpi__label">Tokens entrada</span>
        <strong class="kpi__value">{{ fmtNum(resumen.tokensEntrada) }}</strong>
      </article>
      <article class="card kpi">
        <span class="kpi__label">Tokens salida</span>
        <strong class="kpi__value">{{ fmtNum(resumen.tokensSalida) }}</strong>
      </article>
      <article class="card kpi kpi--cost">
        <span class="kpi__label">Coste estimado (USD)</span>
        <strong class="kpi__value">${{ fmtCoste(resumen.costeUsdEstimado) }}</strong>
        <span class="kpi__sub">Valores orientativos según tarifas públicas</span>
      </article>
    </section>

    <div v-if="resumen" class="charts-grid">
      <section class="card">
        <h2>Por función</h2>
        <div v-if="resumen.porFuncion.length" class="bar-list">
          <div v-for="f in resumen.porFuncion" :key="f.funcion" class="bar-row">
            <div class="bar-row__head">
              <span>{{ funcionLabel(f.funcion) }}</span>
              <span class="bar-row__meta">{{ f.llamadas }} · ${{ fmtCoste(f.costeUsdEstimado) }}</span>
            </div>
            <div class="bar-track">
              <div
                class="bar-fill bar-fill--func"
                :style="{ width: barWidth(f.costeUsdEstimado, maxCosteFuncion) }"
              ></div>
            </div>
          </div>
        </div>
        <p v-else class="empty">Sin datos en el período.</p>
      </section>

      <section class="card">
        <h2>Por proveedor</h2>
        <div v-if="resumen.porProveedor.length" class="bar-list">
          <div v-for="p in resumen.porProveedor" :key="p.proveedor" class="bar-row">
            <div class="bar-row__head">
              <span>{{ proveedorLabel(p.proveedor) }}</span>
              <span class="bar-row__meta">{{ p.llamadas }} · ${{ fmtCoste(p.costeUsdEstimado) }}</span>
            </div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :class="p.proveedor === 'anthropic' ? 'bar-fill--anthropic' : 'bar-fill--prov'"
                :style="{ width: barWidth(p.costeUsdEstimado, maxCosteProveedor) }"
              ></div>
            </div>
          </div>
        </div>
        <p v-else class="empty">Sin datos en el período.</p>
      </section>

      <section v-if="resumen.porDia.length" class="card chart-dia">
        <h2>Coste diario (últimos 30 días)</h2>
        <div class="dia-chart">
          <div v-for="d in resumen.porDia" :key="d.dia" class="dia-col" :title="`${d.dia}: $${fmtCoste(d.costeUsdEstimado)}`">
            <div
              class="dia-bar"
              :style="{ height: barHeight(d.costeUsdEstimado, maxCosteDia) }"
            ></div>
            <span class="dia-label">{{ d.dia.slice(5) }}</span>
          </div>
        </div>
      </section>
    </div>

    <section class="card">
      <header class="section-head">
        <h2>Registro de llamadas</h2>
        <span class="hint">{{ llamadas.length }} filas</span>
      </header>
      <div class="table-wrap">
        <table v-if="llamadas.length">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Quién</th>
              <th>Función</th>
              <th>Proveedor / modelo</th>
              <th>Tokens in/out</th>
              <th>Coste USD</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="l in llamadas"
              :key="l.id"
              :class="{
                'row--err': !l.exito,
                'row--anthropic': l.proveedor === 'anthropic',
              }"
            >
              <td class="mono">{{ formatAt(l.at) }}</td>
              <td>
                <span v-if="l.actorTipo === 'sistema'" class="badge badge--sys">Sistema</span>
                <span v-else>{{ l.actorNombre ?? l.actorEmail ?? l.actorId ?? "—" }}</span>
              </td>
              <td>{{ funcionLabel(l.funcion) }}</td>
              <td>
                <span class="prov" :class="`prov--${l.proveedor}`">{{ proveedorLabel(l.proveedor) }}</span>
                <span v-if="l.detalle?.esRespaldoAnthropic" class="badge badge--fallback">Respaldo</span>
                <code class="model">{{ l.modelo }}</code>
              </td>
              <td class="mono">{{ fmtNum(l.tokensEntrada) }} / {{ fmtNum(l.tokensSalida) }}</td>
              <td class="mono">${{ fmtCoste(l.costeUsdEstimado) }}</td>
              <td>
                <span v-if="l.exito" class="badge badge--ok">OK</span>
                <span v-else class="badge badge--err" :title="l.error">Error</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">No hay llamadas registradas todavía.</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { IaLlamadaDto, IaLlamadaResumenDto } from "@ffa/shared";
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../../api/client";
import { apiErrorMessage } from "../../utils/apiError";
import PageHeader from "../../components/PageHeader.vue";
import { extractionProviderLabel } from "../../constants/extractionProviders";

const llamadas = ref<IaLlamadaDto[]>([]);
const extractionProvider = ref("openai");
const resumen = ref<IaLlamadaResumenDto | null>(null);
const err = ref("");

const filtros = reactive({
  desde: "",
  hasta: "",
  proveedor: "",
  funcion: "",
});

const maxCosteFuncion = computed(() =>
  Math.max(...(resumen.value?.porFuncion.map((f) => f.costeUsdEstimado) ?? [0]), 0.000001)
);
const maxCosteProveedor = computed(() =>
  Math.max(...(resumen.value?.porProveedor.map((p) => p.costeUsdEstimado) ?? [0]), 0.000001)
);
const maxCosteDia = computed(() =>
  Math.max(...(resumen.value?.porDia.map((d) => d.costeUsdEstimado) ?? [0]), 0.000001)
);

const anthropicEnResumen = computed(() =>
  resumen.value?.porProveedor.some((p) => p.proveedor === "anthropic")
);

function queryParams(): Record<string, string> {
  const q: Record<string, string> = { limit: "200" };
  if (filtros.desde) q.desde = filtros.desde;
  if (filtros.hasta) q.hasta = `${filtros.hasta}T23:59:59`;
  if (filtros.proveedor) q.proveedor = filtros.proveedor;
  if (filtros.funcion) q.funcion = filtros.funcion;
  return q;
}

async function load(): Promise<void> {
  err.value = "";
  try {
    const q = queryParams();
    const [list, sum, cfg] = await Promise.all([
      api.getIaLlamadas(q),
      api.getIaLlamadasResumen(q),
      api.getConfig().catch(() => null),
    ]);
    llamadas.value = list;
    resumen.value = sum;
    if (cfg?.extractionProvider) extractionProvider.value = cfg.extractionProvider;
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo cargar el uso de IA");
  }
}

function limpiarFiltros(): void {
  filtros.desde = "";
  filtros.hasta = "";
  filtros.proveedor = "";
  filtros.funcion = "";
  void load();
}

function setProveedor(proveedor: string): void {
  filtros.proveedor = proveedor;
  void load();
}

function fmtNum(n: number): string {
  return n.toLocaleString("es-CL");
}

function fmtCoste(n: number): string {
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function funcionLabel(f: string): string {
  const map: Record<string, string> = {
    extract_vision: "Extracción visión",
    extract_metadata: "Extracción metadatos",
    informe_narrativa: "Informe narrativa",
  };
  return map[f] ?? f;
}

function proveedorLabel(p: string): string {
  return p === "openai" ? "OpenAI" : p === "anthropic" ? "Anthropic" : p;
}

function barWidth(value: number, max: number): string {
  return `${Math.max(4, (value / max) * 100)}%`;
}

function barHeight(value: number, max: number): string {
  return `${Math.max(4, (value / max) * 100)}%`;
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.provider-note {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.provider-note p {
  margin: 0;
  color: var(--muted, #666);
  font-size: 0.9rem;
}

.provider-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chip {
  border: 1px solid var(--border, #e5e7eb);
  background: var(--surface-2, #f9fafb);
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.chip--active {
  border-color: var(--primary, #2563eb);
  background: #eff6ff;
  color: #1d4ed8;
  font-weight: 600;
}

.chip--openai {
  border-color: #bae6fd;
}

.chip--anthropic {
  border-color: #ddd6fe;
}

.chip--empty {
  cursor: default;
  opacity: 0.65;
}

.filters__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
  align-items: end;
}

.filters__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin: 1rem 0;
}

.kpi {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.kpi__label {
  font-size: 0.85rem;
  color: var(--muted, #666);
}

.kpi__value {
  font-size: 1.5rem;
}

.kpi__sub {
  font-size: 0.8rem;
  color: var(--muted, #666);
}

.kpi--cost .kpi__value {
  color: var(--primary, #2563eb);
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.bar-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.bar-row__head {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.bar-row__meta {
  color: var(--muted, #666);
  font-size: 0.8rem;
}

.bar-track {
  height: 8px;
  background: var(--surface-2, #eee);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
}

.bar-fill--func {
  background: #6366f1;
}

.bar-fill--prov {
  background: #0ea5e9;
}

.bar-fill--anthropic {
  background: #8b5cf6;
}

.chart-dia {
  grid-column: 1 / -1;
}

.dia-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 120px;
  padding-top: 0.5rem;
}

.dia-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  min-width: 0;
}

.dia-bar {
  width: 100%;
  max-width: 24px;
  margin-top: auto;
  background: #10b981;
  border-radius: 3px 3px 0 0;
  min-height: 2px;
}

.dia-label {
  font-size: 0.65rem;
  color: var(--muted, #666);
  margin-top: 4px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.75rem;
}

.hint {
  font-size: 0.85rem;
  color: var(--muted, #666);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th,
td {
  padding: 0.5rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.82rem;
}

.model {
  display: block;
  font-size: 0.75rem;
  color: var(--muted, #666);
}

.badge {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge--ok {
  background: #dcfce7;
  color: #166534;
}

.badge--err {
  background: #fee2e2;
  color: #991b1b;
}

.badge--sys {
  background: #e0e7ff;
  color: #3730a3;
}

.row--err {
  background: #fef2f2;
}

.row--anthropic {
  background: #faf5ff;
}

.prov--anthropic {
  color: #6d28d9;
  font-weight: 600;
}

.prov--openai {
  color: #0369a1;
  font-weight: 600;
}

.badge--fallback {
  background: #ede9fe;
  color: #5b21b6;
  margin-left: 0.25rem;
}

.empty {
  color: var(--muted, #666);
  padding: 1rem 0;
}

.banner-msg {
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.banner-msg--err {
  background: #fee2e2;
  color: #991b1b;
}
</style>
