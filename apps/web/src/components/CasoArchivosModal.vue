<template>
  <CreateFormModal
    :model-value="modelValue"
    xl
    :title="titulo"
    :subtitle="subtitle"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="archivos-modal">
      <p v-if="loading" class="archivos-modal__loading">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        Cargando archivos…
      </p>
      <p v-else-if="error" class="error-msg">{{ error }}</p>
      <p v-else-if="!archivos.length" class="archivos-modal__empty">
        Este expediente no tiene archivos almacenados.
      </p>
      <div v-else class="archivos-modal__layout">
        <aside class="archivos-modal__list-wrap">
          <p class="archivos-modal__list-title">{{ archivos.length }} archivo(s)</p>
          <ul class="archivos-modal__list">
            <li v-for="item in archivos" :key="item.id">
              <button
                type="button"
                class="archivos-modal__item"
                :class="{ 'archivos-modal__item--active': item.id === seleccionadoId }"
                @click="seleccionar(item)"
              >
                <i :class="item.icono" aria-hidden="true"></i>
                <span class="archivos-modal__item-text">
                  <span class="archivos-modal__item-name">{{ item.nombre }}</span>
                  <span class="archivos-modal__item-meta">{{ item.meta }}</span>
                </span>
              </button>
            </li>
          </ul>
        </aside>
        <section class="archivos-modal__preview">
          <DocumentoOrigenModal
            v-if="previewUrl && previewMime"
            :key="previewUrl"
            embedded
            :model-value="true"
            :document-url="previewUrl"
            :mime-type="previewMime"
            :line-label="previewLabel"
          />
          <p v-else class="archivos-modal__preview-empty">Seleccioná un archivo para previsualizarlo.</p>
        </section>
      </div>
    </div>
    <template #footer>
      <button class="btn btn-ghost" type="button" @click="emit('update:modelValue', false)">
        Cerrar
      </button>
      <a
        v-if="previewUrl && seleccionado"
        class="btn btn-primary"
        :href="previewUrl"
        target="_blank"
        rel="noopener noreferrer"
        @click.prevent="abrirEnPestana"
      >
        Abrir en pestaña
      </a>
    </template>
  </CreateFormModal>
</template>

<script setup lang="ts">
import type { DocumentoFuenteDto } from "@ffa/shared";
import { computed, ref, watch } from "vue";
import {
  api,
  casoDocumentoDerivadoUrl,
  casoDocumentoFileUrl,
  getToken,
} from "../api/client";
import { apiErrorMessage } from "../utils/apiError";
import CreateFormModal from "./CreateFormModal.vue";
import DocumentoOrigenModal from "./DocumentoOrigenModal.vue";

export interface ArchivoExpedienteItem {
  id: string;
  documentoId: string;
  nombre: string;
  meta: string;
  mimeType: string;
  url: string;
  icono: string;
  tipo: "original" | "derivado";
}

const props = defineProps<{
  modelValue: boolean;
  casoId?: string;
  casoNumero?: string;
  casoReferencia?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const loading = ref(false);
const error = ref("");
const archivos = ref<ArchivoExpedienteItem[]>([]);
const seleccionadoId = ref<string | null>(null);

const titulo = computed(() =>
  props.casoNumero ? `Archivos · ${props.casoNumero}` : "Archivos del expediente"
);

const subtitle = computed(() => props.casoReferencia?.trim() || undefined);

const seleccionado = computed(() =>
  archivos.value.find((a) => a.id === seleccionadoId.value)
);

const previewUrl = computed(() => seleccionado.value?.url ?? "");
const previewMime = computed(() => seleccionado.value?.mimeType ?? "");
const previewLabel = computed(() => {
  const s = seleccionado.value;
  if (!s) return undefined;
  return s.tipo === "derivado" ? `Derivado — ${s.nombre}` : s.nombre;
});

function mimeDerivado(nombre: string): string {
  if (/\.jpe?g$/i.test(nombre)) return "image/jpeg";
  if (/\.webp$/i.test(nombre)) return "image/webp";
  return "image/png";
}

function formatTamano(bytes?: number): string {
  if (bytes == null || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildArchivos(casoId: string, docs: DocumentoFuenteDto[]): ArchivoExpedienteItem[] {
  const out: ArchivoExpedienteItem[] = [];
  for (const doc of docs) {
    out.push({
      id: `orig-${doc.id}`,
      documentoId: doc.id,
      nombre: doc.nombreOriginal,
      meta: ["Original", formatTamano(doc.tamanoBytes), doc.mimeType.split("/").pop()]
        .filter(Boolean)
        .join(" · "),
      mimeType: doc.mimeType,
      url: casoDocumentoFileUrl(casoId, doc.id),
      icono: doc.mimeType === "application/pdf" ? "fas fa-file-pdf" : "fas fa-file-image",
      tipo: "original",
    });

    for (const pag of doc.derivados?.paginas ?? []) {
      out.push({
        id: `deriv-${doc.id}-${pag.nombre}`,
        documentoId: doc.id,
        nombre: pag.nombre,
        meta: `Derivado · preproceso · ${doc.nombreOriginal}`,
        mimeType: mimeDerivado(pag.nombre),
        url: casoDocumentoDerivadoUrl(casoId, doc.id, pag.nombre),
        icono: "fas fa-image",
        tipo: "derivado",
      });
    }
  }
  return out;
}

function seleccionar(item: ArchivoExpedienteItem): void {
  seleccionadoId.value = item.id;
}

async function cargarArchivos(): Promise<void> {
  if (!props.casoId) return;
  loading.value = true;
  error.value = "";
  archivos.value = [];
  seleccionadoId.value = null;
  try {
    const detalle = await api.getCaso(props.casoId);
    const items = buildArchivos(props.casoId, detalle.documentos ?? []);
    archivos.value = items;
    if (items[0]) seleccionadoId.value = items[0].id;
  } catch (e) {
    error.value = apiErrorMessage(e, "No se pudieron cargar los archivos");
  } finally {
    loading.value = false;
  }
}

async function abrirEnPestana(): Promise<void> {
  if (!previewUrl.value) return;
  const token = getToken();
  const res = await fetch(previewUrl.value, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

watch(
  () => [props.modelValue, props.casoId] as const,
  ([open, id]) => {
    if (open && id) void cargarArchivos();
  },
  { immediate: true }
);
</script>

<style scoped>
.archivos-modal {
  min-height: 420px;
}

.archivos-modal__loading,
.archivos-modal__empty {
  margin: 0;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.archivos-modal__layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 0.85rem;
  min-height: 420px;
}

@media (max-width: 768px) {
  .archivos-modal__layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
}

.archivos-modal__list-wrap {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.archivos-modal__list-title {
  margin: 0;
  padding: 0.55rem 0.75rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
}

.archivos-modal__list {
  list-style: none;
  margin: 0;
  padding: 0.35rem;
  overflow-y: auto;
  max-height: 480px;
}

.archivos-modal__item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.5rem 0.55rem;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--ink);
}

.archivos-modal__item i {
  margin-top: 0.15rem;
  color: var(--brand);
  width: 1rem;
  flex-shrink: 0;
}

.archivos-modal__item--active {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
}

.archivos-modal__item-text {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  min-width: 0;
}

.archivos-modal__item-name {
  font-size: 0.82rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archivos-modal__item-meta {
  font-size: 0.68rem;
  color: var(--ink-soft);
  line-height: 1.35;
}

.archivos-modal__preview {
  min-height: 420px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.archivos-modal__preview :deep(.doc-embed) {
  flex: 1;
  min-height: 420px;
}

.archivos-modal__preview-empty {
  margin: auto;
  padding: 2rem;
  color: var(--ink-soft);
  font-size: 0.88rem;
}
</style>
