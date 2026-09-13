<template>
  <Teleport to="body">
    <div v-if="modelValue" class="pipeline-modal-backdrop" @click.self="close">
      <div
        class="pipeline-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.stop
      >
        <header class="pipeline-modal__head">
          <div class="pipeline-modal__head-text">
            <span v-if="detalle" class="pipeline-modal__badge" :class="`pipeline-modal__badge--${detalle.estado}`">
              {{ estadoLabel(detalle.estado) }}
            </span>
            <h2 :id="titleId" class="pipeline-modal__title">
              {{ detalle?.titulo ?? "Detalle del paso" }}
            </h2>
          </div>
          <button type="button" class="pipeline-modal__close" aria-label="Cerrar" @click="close">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </header>

        <div class="pipeline-modal__body">
          <div v-if="loading" class="pipeline-modal__loading">Cargando detalle…</div>
          <div v-else-if="error" class="error-msg">{{ error }}</div>
          <template v-else-if="detalle">
            <p class="pipeline-modal__summary">{{ detalle.resumen }}</p>

            <dl v-if="detalle.items.length" class="pipeline-modal__items">
              <template v-for="(item, i) in detalle.items" :key="i">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </template>
            </dl>

            <div v-for="(tabla, ti) in detalle.tablas ?? []" :key="ti" class="pipeline-modal__table-wrap">
              <h3 class="pipeline-modal__section-title">{{ tabla.titulo }}</h3>
              <div class="table-scroll">
                <table class="pipeline-modal__table">
                  <thead>
                    <tr>
                      <th v-for="(col, ci) in tabla.columnas" :key="ci">{{ col }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(fila, fi) in tabla.filas" :key="fi">
                      <td v-for="(celda, ci) in fila" :key="ci">{{ celda }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="detalle.logs?.length" class="pipeline-modal__logs">
              <h3 class="pipeline-modal__section-title">Registro del procesamiento</h3>
              <ul>
                <li v-for="(log, li) in detalle.logs" :key="li">
                  <time v-if="log.at">{{ formatLogDate(log.at) }}</time>
                  <span v-if="log.etapa" class="log-etapa">{{ log.etapa }}</span>
                  <span>{{ log.mensaje }}</span>
                </li>
              </ul>
            </div>
          </template>
        </div>

        <footer class="pipeline-modal__foot">
          <template v-if="detalle?.enlaces?.length">
            <RouterLink
              v-for="(link, li) in detalle.enlaces.filter((l) => !l.external)"
              :key="`in-${li}`"
              class="btn btn-ghost btn-sm"
              :to="link.to"
              @click="close"
            >
              {{ link.label }}
            </RouterLink>
            <button
              v-for="(link, li) in detalle.enlaces.filter((l) => l.external)"
              :key="`ex-${li}`"
              type="button"
              class="btn btn-ghost btn-sm"
              @click="abrirEnlaceExterno(link.to)"
            >
              {{ link.label }}
            </button>
          </template>
          <button type="button" class="btn btn-primary" @click="close">Cerrar</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { PipelineEtapaDetalleDto } from "@ffa/shared";
import { onMounted, onUnmounted, useId } from "vue";
import { RouterLink } from "vue-router";
import { getToken } from "../api/client";

const props = defineProps<{
  modelValue: boolean;
  loading?: boolean;
  error?: string | null;
  detalle?: PipelineEtapaDetalleDto | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const titleId = useId();

function close(): void {
  emit("update:modelValue", false);
}

function estadoLabel(estado: PipelineEtapaDetalleDto["estado"]): string {
  if (estado === "listo") return "Listo";
  if (estado === "en_curso") return "En curso";
  return "Pendiente";
}

function formatLogDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function abrirEnlaceExterno(to: string): Promise<void> {
  const token = getToken();
  try {
    const res = await fetch(to, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("No se pudo abrir el recurso");
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    window.open(obj, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(obj), 60_000);
  } catch {
    window.open(to, "_blank", "noopener");
  }
  close();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.modelValue) close();
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.pipeline-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.45);
}

.pipeline-modal {
  width: min(640px, 100%);
  max-height: min(88vh, 820px);
  display: flex;
  flex-direction: column;
  background: var(--panel, #fff);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}

.pipeline-modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid var(--line, #e2e8f0);
}

.pipeline-modal__head-text {
  min-width: 0;
}

.pipeline-modal__badge {
  display: inline-block;
  margin-bottom: 0.35rem;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.pipeline-modal__badge--listo {
  background: color-mix(in srgb, var(--ok, #16a34a) 15%, transparent);
  color: var(--ok, #16a34a);
}

.pipeline-modal__badge--en_curso {
  background: var(--brand-soft, #ccfbf1);
  color: var(--brand-ink, #134e4a);
}

.pipeline-modal__badge--pendiente {
  background: var(--line, #e2e8f0);
  color: var(--ink-soft, #64748b);
}

.pipeline-modal__title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--brand-ink, #134e4a);
}

.pipeline-modal__close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--ink-faint, #94a3b8);
  cursor: pointer;
  padding: 0.25rem;
  font-size: 1.1rem;
}

.pipeline-modal__body {
  flex: 1;
  overflow: auto;
  padding: 1rem 1.15rem;
}

.pipeline-modal__loading {
  color: var(--ink-soft);
  font-size: 0.875rem;
}

.pipeline-modal__summary {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--ink);
}

.pipeline-modal__items {
  display: grid;
  grid-template-columns: minmax(120px, 38%) 1fr;
  gap: 0.35rem 0.75rem;
  margin: 0 0 1rem;
  font-size: 0.82rem;
}

.pipeline-modal__items dt {
  margin: 0;
  color: var(--ink-soft);
  font-weight: 500;
}

.pipeline-modal__items dd {
  margin: 0;
  color: var(--ink);
  word-break: break-word;
}

.pipeline-modal__section-title {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.pipeline-modal__table-wrap {
  margin-bottom: 1rem;
}

.table-scroll {
  overflow: auto;
  max-height: 220px;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.pipeline-modal__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.pipeline-modal__table th,
.pipeline-modal__table td {
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.pipeline-modal__table th {
  position: sticky;
  top: 0;
  background: var(--bg-soft, #f8fafc);
  font-weight: 600;
  color: var(--ink-soft);
}

.pipeline-modal__logs ul {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.78rem;
}

.pipeline-modal__logs li {
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--line);
  line-height: 1.4;
  color: var(--ink-soft);
}

.pipeline-modal__logs time {
  display: block;
  font-size: 0.68rem;
  color: var(--ink-faint);
}

.log-etapa {
  display: inline-block;
  margin-right: 0.35rem;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  background: var(--line);
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
}

.pipeline-modal__foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.85rem 1.15rem;
  border-top: 1px solid var(--line);
}
</style>
