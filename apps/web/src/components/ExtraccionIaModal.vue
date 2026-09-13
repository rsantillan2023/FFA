<template>
  <Teleport to="body">
    <div v-if="modelValue" class="eia-backdrop" @click.self="close">
      <div
        class="eia-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eia-modal-title"
        @click.stop
      >
        <header class="eia-modal__head">
          <div>
            <h2 id="eia-modal-title" class="eia-modal__title">Texto extraído por IA</h2>
            <p v-if="subtitle" class="eia-modal__subtitle">{{ subtitle }}</p>
          </div>
          <button type="button" class="eia-modal__close" aria-label="Cerrar" @click="close">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </header>

        <div class="eia-modal__body">
          <p v-if="loading" class="eia-modal__loading">
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            Cargando extracción…
          </p>
          <p v-else-if="error" class="error-msg">{{ error }}</p>
          <template v-else-if="data">
            <p v-if="data.origen === 'reconstruido'" class="eia-modal__note">
              Vista reconstruida desde lo almacenado. Para ver el JSON crudo completo, reprocesá el
              expediente después de actualizar el sistema.
            </p>

            <nav v-if="parsed?.json" class="eia-tabs" role="tablist" aria-label="Vista de extracción">
              <button
                type="button"
                class="eia-tabs__btn"
                :class="{ 'eia-tabs__btn--active': activeTab === 'resumen' }"
                role="tab"
                :aria-selected="activeTab === 'resumen'"
                @click="activeTab = 'resumen'"
              >
                <i class="fas fa-list-ul" aria-hidden="true"></i>
                Resumen
              </button>
              <button
                type="button"
                class="eia-tabs__btn"
                :class="{ 'eia-tabs__btn--active': activeTab === 'json-formateado' }"
                role="tab"
                :aria-selected="activeTab === 'json-formateado'"
                @click="activeTab = 'json-formateado'"
              >
                <i class="fas fa-table-columns" aria-hidden="true"></i>
                JSON formateado
              </button>
              <button
                type="button"
                class="eia-tabs__btn"
                :class="{ 'eia-tabs__btn--active': activeTab === 'json' }"
                role="tab"
                :aria-selected="activeTab === 'json'"
                @click="activeTab = 'json'"
              >
                <i class="fas fa-code" aria-hidden="true"></i>
                JSON crudo
              </button>
            </nav>

            <div v-show="activeTab === 'resumen'" class="eia-resumen">
              <p v-for="(linea, i) in parsed?.preamble" :key="`pre-${i}`" class="eia-preamble">
                {{ linea }}
              </p>

              <article
                v-for="(seccion, i) in parsed?.secciones"
                :key="`sec-${i}`"
                class="eia-seccion"
              >
                <h3 class="eia-seccion__title">{{ seccion.titulo }}</h3>

                <table
                  v-if="seccionEsTabular(seccion.titulo) && lineasTabulares(seccion.lineas).length"
                  class="eia-table"
                >
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th class="eia-table__monto">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(fila, j) in lineasTabulares(seccion.lineas)" :key="j">
                      <td>{{ fila.concepto }}</td>
                      <td class="eia-table__monto">{{ fila.monto }}</td>
                    </tr>
                  </tbody>
                </table>

                <pre v-else-if="seccion.titulo.toLowerCase().includes('transcripción')" class="eia-transcripcion">{{
                  seccion.lineas.join("\n")
                }}</pre>

                <ul v-else class="eia-lista">
                  <li v-for="(linea, j) in seccion.lineas" :key="j">{{ linea }}</li>
                </ul>
              </article>
            </div>

            <div v-show="activeTab === 'json-formateado' && parsed?.json" class="eia-json-wrap">
              <ExtraccionJsonFormateado :json="parsed.json" />
            </div>

            <div v-show="activeTab === 'json' && parsed?.json" class="eia-json-wrap">
              <pre class="eia-json" v-html="jsonHighlighted"></pre>
            </div>
          </template>
        </div>

        <footer class="eia-modal__foot">
          <button
            v-if="copyText"
            class="btn btn-ghost"
            type="button"
            @click="copiar"
          >
            {{
              copiado
                ? "Copiado"
                : activeTab === "json" && parsed?.json
                  ? "Copiar JSON"
                  : activeTab === "json-formateado" && parsed?.json
                    ? "Copiar JSON"
                    : "Copiar texto"
            }}
          </button>
          <button class="btn btn-primary" type="button" @click="close">Cerrar</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { ExtraccionIaTextoDto } from "@ffa/shared";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { api } from "../api/client";
import { apiErrorMessage } from "../utils/apiError";
import ExtraccionJsonFormateado from "./ExtraccionJsonFormateado.vue";
import {
  highlightJson,
  parseExtraccionTexto,
  parseLineaTabular,
  seccionEsTabular,
  type ExtraccionSeccion,
} from "../utils/parseExtraccionTexto";

type ExtraccionTab = "resumen" | "json-formateado" | "json";

const props = defineProps<{
  modelValue: boolean;
  casoId: string;
  documentoNombre?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const loading = ref(false);
const error = ref("");
const data = ref<ExtraccionIaTextoDto | null>(null);
const activeTab = ref<ExtraccionTab>("resumen");
const copiado = ref(false);
let copiadoTimer: ReturnType<typeof setTimeout> | undefined;

const subtitle = computed(() => {
  if (!data.value) return props.documentoNombre ?? "";
  return `${data.value.documentoNombre} · ${data.value.lineasCount} línea(s)`;
});

const parsed = computed(() => (data.value?.texto ? parseExtraccionTexto(data.value.texto) : null));

const jsonHighlighted = computed(() =>
  parsed.value?.json ? highlightJson(parsed.value.json) : ""
);

const copyText = computed(() => {
  if (!data.value?.texto) return "";
  if (
    (activeTab.value === "json" || activeTab.value === "json-formateado") &&
    parsed.value?.json
  ) {
    return parsed.value.json;
  }
  return data.value.texto;
});

function lineasTabulares(lineas: ExtraccionSeccion["lineas"]) {
  return lineas
    .map((linea) => parseLineaTabular(linea))
    .filter((fila): fila is NonNullable<typeof fila> => fila != null);
}

function close(): void {
  emit("update:modelValue", false);
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  data.value = null;
  activeTab.value = "resumen";
  copiado.value = false;
  try {
    data.value = await api.getExtraccionIa(props.casoId);
  } catch (e) {
    error.value = apiErrorMessage(e, "No se pudo cargar la extracción");
  } finally {
    loading.value = false;
  }
}

async function copiar(): Promise<void> {
  const texto = copyText.value;
  if (!texto) return;
  try {
    await navigator.clipboard.writeText(texto);
    copiado.value = true;
    if (copiadoTimer) clearTimeout(copiadoTimer);
    copiadoTimer = setTimeout(() => {
      copiado.value = false;
    }, 2000);
  } catch {
    error.value = "No se pudo copiar al portapapeles";
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.modelValue) close();
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) void load();
  }
);

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  if (copiadoTimer) clearTimeout(copiadoTimer);
});
</script>

<style scoped>
.eia-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  background: rgba(15, 23, 42, 0.62);
  backdrop-filter: blur(4px);
}

.eia-modal {
  width: min(96vw, 1080px);
  height: min(92vh, 880px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  border-radius: 14px;
  background: var(--panel);
  box-shadow: 0 24px 48px rgb(15 23 42 / 28%);
  overflow: hidden;
}

.eia-modal__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.9rem 1.15rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--brand) 5%, var(--panel));
}

.eia-modal__title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--brand-ink);
}

.eia-modal__subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.4;
}

.eia-modal__close {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--ink-soft);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.eia-modal__close:hover {
  color: var(--ink);
  border-color: var(--line-2);
}

.eia-modal__body {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0.85rem 1.15rem;
  gap: 0.75rem;
}

.eia-modal__loading {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.eia-modal__note {
  margin: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--warn) 10%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--warn) 30%, var(--line));
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--ink-soft);
  flex-shrink: 0;
}

.eia-tabs {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
  padding: 0.2rem;
  border-radius: 10px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  width: fit-content;
}

.eia-tabs__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.eia-tabs__btn:hover {
  color: var(--ink);
  background: color-mix(in srgb, var(--ink) 4%, var(--panel));
}

.eia-tabs__btn--active {
  background: var(--panel);
  color: var(--brand-ink, var(--brand));
  box-shadow: 0 1px 3px rgb(15 23 42 / 10%);
}

.eia-resumen,
.eia-json-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 0.25rem;
}

.eia-preamble {
  margin: 0 0 0.75rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--brand) 6%, var(--panel-2));
  border: 1px solid color-mix(in srgb, var(--brand) 20%, var(--line));
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--ink);
}

.eia-seccion {
  margin-bottom: 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
  overflow: hidden;
}

.eia-seccion__title {
  margin: 0;
  padding: 0.55rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--brand-ink, var(--brand));
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
  border-bottom: 1px solid var(--line);
}

.eia-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.eia-table th,
.eia-table td {
  padding: 0.45rem 0.85rem;
  text-align: left;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}

.eia-table th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink-faint);
  background: var(--panel);
}

.eia-table tbody tr:last-child td {
  border-bottom: 0;
}

.eia-table tbody tr:hover td {
  background: color-mix(in srgb, var(--brand) 4%, var(--panel));
}

.eia-table__monto {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
  width: 8rem;
}

.eia-lista {
  margin: 0;
  padding: 0.55rem 0.85rem 0.55rem 1.75rem;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--ink);
}

.eia-lista li + li {
  margin-top: 0.25rem;
}

.eia-transcripcion {
  margin: 0;
  padding: 0.75rem 0.85rem;
  font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
  font-size: 0.76rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ink-soft);
  background: color-mix(in srgb, var(--ink) 3%, var(--panel));
}

.eia-json {
  margin: 0;
  padding: 1rem 1.1rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: #1e293b;
  color: #e2e8f0;
  font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.eia-json :deep(.json-hl__key) {
  color: #7dd3fc;
}

.eia-json :deep(.json-hl__str) {
  color: #86efac;
}

.eia-json :deep(.json-hl__num) {
  color: #fcd34d;
}

.eia-json :deep(.json-hl__bool) {
  color: #f472b6;
}

.eia-json :deep(.json-hl__null) {
  color: #94a3b8;
}

.eia-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.85rem 1.15rem;
  border-top: 1px solid var(--line);
  background: var(--panel-2);
}
</style>
