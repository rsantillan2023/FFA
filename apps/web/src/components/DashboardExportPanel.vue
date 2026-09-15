<template>
  <section class="export-panel card" :class="{ 'export-panel--collapsed': !expanded }">
    <button
      type="button"
      class="export-panel__toggle"
      :aria-expanded="expanded"
      aria-controls="export-panel-body"
      @click="expanded = !expanded"
    >
      <header class="export-panel__head">
        <div class="export-panel__brand">
          <span class="export-panel__icon" aria-hidden="true">
            <i class="fas fa-chart-line"></i>
          </span>
          <div class="export-panel__titles">
            <h2>Resumen para compartir</h2>
            <p v-if="expanded" class="export-panel__lead">
              Números del tablero listos para una reunión, un correo interno o Excel. Sin códigos técnicos.
            </p>
          </div>
        </div>
        <div class="export-panel__head-end">
          <time v-if="expanded" class="export-panel__fecha" :datetime="kpis.generadoAt">
            Actualizado {{ fechaLegible }}
          </time>
          <i
            class="fas fa-chevron-down export-panel__chevron"
            :class="{ 'export-panel__chevron--open': expanded }"
            aria-hidden="true"
          ></i>
        </div>
      </header>
    </button>

    <div v-show="expanded" id="export-panel-body" class="export-panel__body">
    <div class="export-panel__preview">
      <div v-for="group in groupedRows" :key="group.id" class="export-group">
        <h3 class="export-group__title">{{ group.label }}</h3>
        <div class="export-group__grid">
          <article v-for="row in group.rows" :key="row.id" class="export-metric">
            <p class="export-metric__label">{{ row.label }}</p>
            <p class="export-metric__value">{{ row.value }}</p>
            <p v-if="row.hint" class="export-metric__hint">{{ row.hint }}</p>
          </article>
        </div>
      </div>
    </div>

    <div class="export-panel__actions">
      <button class="btn btn-primary" type="button" :disabled="busy" @click="emit('download-csv')">
        <i class="fas fa-file-excel" aria-hidden="true"></i>
        Descargar para Excel
      </button>
      <button class="btn btn-ghost" type="button" :disabled="busy" @click="emit('download-json')">
        <i class="fas fa-file-code" aria-hidden="true"></i>
        JSON completo
      </button>
      <button class="btn btn-ghost" type="button" :disabled="busy" @click="onCopy">
        <i class="fas fa-copy" aria-hidden="true"></i>
        {{ copied ? "Copiado" : "Copiar resumen" }}
      </button>
    </div>

    <p v-if="message" class="export-panel__msg" :class="messageOk ? 'export-panel__msg--ok' : 'export-panel__msg--err'">
      {{ message }}
    </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { KpisDto } from "@ffa/shared";
import { computed, ref } from "vue";
import {
  buildDashboardExportRows,
  buildDashboardResumenTexto,
  EXPORT_GROUP_LABELS,
  type DashboardExportRow,
} from "../utils/dashboardExport";

const props = defineProps<{
  kpis: KpisDto;
  busy?: boolean;
  message?: string;
  messageOk?: boolean;
}>();

const emit = defineEmits<{
  "download-csv": [];
  "download-json": [];
}>();

const expanded = ref(false);
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const rows = computed(() => buildDashboardExportRows(props.kpis));

const groupedRows = computed(() => {
  const order: DashboardExportRow["group"][] = ["operacion", "tiempos", "calidad", "aprendizaje"];
  return order
    .map((id) => ({
      id,
      label: EXPORT_GROUP_LABELS[id],
      rows: rows.value.filter((r) => r.group === id),
    }))
    .filter((g) => g.rows.length);
});

const fechaLegible = computed(() =>
  new Date(props.kpis.generadoAt).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }),
);

async function onCopy(): Promise<void> {
  const text = buildDashboardResumenTexto(props.kpis);
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
    }, 2200);
  } catch {
    /* el padre puede mostrar error si hace falta */
  }
}
</script>

<style scoped>
.export-panel {
  padding: 1rem 1.15rem;
  border-color: color-mix(in srgb, var(--brand) 22%, var(--line));
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--brand-soft) 50%, var(--panel)) 0%,
    var(--panel) 55%
  );
}

.export-panel--collapsed {
  padding: 0.55rem 0.85rem;
  margin-bottom: 1rem;
  background: var(--panel);
}

.export-panel__toggle {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.export-panel__toggle:hover h2 {
  color: var(--brand);
}

.export-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
}

.export-panel--collapsed .export-panel__head {
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.5rem;
}

.export-panel--collapsed .export-panel__brand {
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 0.55rem;
}

.export-panel--collapsed .export-panel__titles {
  min-width: 0;
}

.export-panel--collapsed h2 {
  font-size: 0.875rem;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.export-panel--collapsed .export-panel__icon {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 8px;
  font-size: 0.78rem;
}

.export-panel--collapsed .export-panel__head-end {
  margin-left: auto;
}

.export-panel__head-end {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-shrink: 0;
}

.export-panel__chevron {
  font-size: 0.75rem;
  color: var(--ink-soft);
  transition: transform 0.2s ease, color 0.15s ease;
}

.export-panel__chevron--open {
  transform: rotate(180deg);
  color: var(--brand);
}

.export-panel__body {
  margin-top: 1rem;
}

.export-panel__brand {
  display: flex;
  gap: 0.75rem;
  min-width: 0;
}

.export-panel__titles {
  min-width: 0;
}

.export-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 12px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 1rem;
  flex-shrink: 0;
}

.export-panel h2 {
  margin: 0;
  font-size: 1rem;
  color: var(--brand-ink);
}

.export-panel__lead {
  margin: 0.3rem 0 0;
  max-width: 42rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--ink-soft);
}

.export-panel__fecha {
  font-size: 0.72rem;
  color: var(--ink-faint);
  white-space: nowrap;
}

.export-panel__preview {
  display: grid;
  gap: 1rem;
  margin-bottom: 1rem;
}

.export-group__title {
  margin: 0 0 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--brand-ink);
}

.export-group__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.55rem;
}

.export-metric {
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}

.export-metric__label {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--ink-soft);
}

.export-metric__value {
  margin: 0.2rem 0 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink);
}

.export-metric__hint {
  margin: 0.2rem 0 0;
  font-size: 0.65rem;
  color: var(--ink-faint);
}

.export-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.export-panel__actions .btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.export-panel__msg {
  margin: 0.65rem 0 0;
  font-size: 0.8rem;
}

.export-panel__msg--ok {
  color: var(--ok);
}

.export-panel__msg--err {
  color: var(--bad);
}
</style>
