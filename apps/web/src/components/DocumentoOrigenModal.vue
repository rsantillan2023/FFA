<template>
  <Teleport to="body">
    <div v-if="modelValue" class="doc-modal-backdrop" @click.self="close">
      <div class="doc-modal" role="dialog" aria-modal="true" aria-labelledby="doc-modal-title" @click.stop>
        <header class="doc-modal__head">
          <div>
            <h2 id="doc-modal-title" class="doc-modal__title">Documento origen</h2>
            <p v-if="lineLabel" class="doc-modal__subtitle">{{ lineLabel }}</p>
          </div>
          <div class="doc-modal__tools">
            <div v-if="totalPages > 1" class="pager">
              <button class="btn btn-ghost btn-sm" type="button" :disabled="page <= 1" @click="page--">
                ‹
              </button>
              <span>Pág. {{ page }} / {{ totalPages }}</span>
              <button
                class="btn btn-ghost btn-sm"
                type="button"
                :disabled="page >= totalPages"
                @click="page++"
              >
                ›
              </button>
            </div>
            <button type="button" class="doc-modal__close" aria-label="Cerrar" @click="close">×</button>
          </div>
        </header>
        <div ref="docContainer" class="doc-modal__body">
          <canvas v-show="isPdf" ref="pdfCanvas" class="doc-canvas" />
          <img v-show="!isPdf && imageUrl" :src="imageUrl ?? undefined" alt="Documento" class="doc-image" />
          <p v-show="loadingDoc" class="doc-modal__loading">Cargando documento…</p>
          <p v-show="!loadingDoc && !isPdf && !imageUrl" class="doc-modal__loading">Sin vista previa</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import * as pdfjsLib from "pdfjs-dist";
import { onMounted, onUnmounted, ref, watch } from "vue";
import { getToken } from "../api/client";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type Bbox = { x: number; y: number; w: number; h: number };

const props = defineProps<{
  modelValue: boolean;
  documentUrl: string;
  mimeType: string;
  initialPage?: number;
  highlightBbox?: Bbox | null;
  highlightPage?: number;
  lineLabel?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const page = ref(1);
const totalPages = ref(1);
const isPdf = ref(false);
const loadingDoc = ref(false);
const pdfCanvas = ref<HTMLCanvasElement | null>(null);
const docContainer = ref<HTMLElement | null>(null);
const imageUrl = ref<string | null>(null);
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
let isMounted = false;
let loadSeq = 0;
let imageObjectUrl: string | null = null;

function close(): void {
  emit("update:modelValue", false);
}

function revokeImageUrl(): void {
  if (imageObjectUrl) {
    URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = null;
  }
}

async function destroyPdfDoc(): Promise<void> {
  if (!pdfDoc) return;
  try {
    await pdfDoc.destroy();
  } catch {
    /* ignore */
  }
  pdfDoc = null;
}

async function loadDocument(): Promise<void> {
  const seq = ++loadSeq;
  loadingDoc.value = true;
  imageUrl.value = null;
  revokeImageUrl();
  isPdf.value = props.mimeType === "application/pdf";
  await destroyPdfDoc();
  page.value = props.initialPage && props.initialPage > 0 ? props.initialPage : 1;

  try {
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    if (isPdf.value) {
      const loadingTask = pdfjsLib.getDocument({
        url: props.documentUrl,
        httpHeaders: headers,
      });
      const doc = await loadingTask.promise;
      if (seq !== loadSeq || !isMounted) {
        await doc.destroy().catch(() => {});
        return;
      }
      pdfDoc = doc;
      totalPages.value = pdfDoc.numPages;
      if (page.value > totalPages.value) page.value = totalPages.value;
      await renderPdfPage(seq);
    } else if (props.mimeType.startsWith("image/")) {
      totalPages.value = 1;
      const res = await fetch(props.documentUrl, { headers });
      const blob = await res.blob();
      if (seq !== loadSeq || !isMounted) return;
      imageObjectUrl = URL.createObjectURL(blob);
      imageUrl.value = imageObjectUrl;
    }
  } catch {
    if (seq === loadSeq && isMounted) isPdf.value = false;
  } finally {
    if (seq === loadSeq && isMounted) loadingDoc.value = false;
  }
}

function drawBboxHighlight(
  ctx: CanvasRenderingContext2D,
  viewport: { width: number; height: number }
): void {
  const bbox = props.highlightBbox;
  const bboxPage = props.highlightPage ?? props.initialPage ?? page.value;
  if (!bbox || bboxPage !== page.value) return;
  const { x, y, w, h } = bbox;
  const rx = x <= 1 ? x * viewport.width : x;
  const ry = y <= 1 ? y * viewport.height : y;
  const rw = w <= 1 ? w * viewport.width : w;
  const rh = h <= 1 ? h * viewport.height : h;
  ctx.save();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 3;
  ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.restore();
}

async function renderPdfPage(seq = loadSeq): Promise<void> {
  if (!isMounted || seq !== loadSeq || !pdfDoc || !pdfCanvas.value) return;
  const pdfPage = await pdfDoc.getPage(page.value);
  if (!isMounted || seq !== loadSeq || !pdfCanvas.value) return;
  const viewport = pdfPage.getViewport({ scale: 1.35 });
  const canvas = pdfCanvas.value;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  if (!isMounted || seq !== loadSeq || !pdfCanvas.value) return;
  drawBboxHighlight(ctx, viewport);
}

watch(page, () => {
  if (isPdf.value && props.modelValue) void renderPdfPage();
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) void loadDocument();
    else {
      loadSeq++;
      revokeImageUrl();
      void destroyPdfDoc();
    }
  }
);

watch(
  () => [props.highlightBbox, props.highlightPage, props.initialPage] as const,
  () => {
    if (props.modelValue && isPdf.value) void renderPdfPage();
  }
);

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.modelValue) close();
}

onMounted(() => {
  isMounted = true;
  document.addEventListener("keydown", onKeydown);
  if (props.modelValue) void loadDocument();
});

onUnmounted(() => {
  isMounted = false;
  loadSeq++;
  document.removeEventListener("keydown", onKeydown);
  revokeImageUrl();
  void destroyPdfDoc();
});
</script>

<style scoped>
.doc-modal-backdrop {
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

.doc-modal {
  width: min(96vw, 1100px);
  height: min(92vh, 900px);
  display: grid;
  grid-template-rows: auto 1fr;
  border-radius: 14px;
  background: var(--panel);
  box-shadow: 0 24px 48px rgb(15 23 42 / 28%);
  overflow: hidden;
}

.doc-modal__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--brand) 5%, var(--panel));
}

.doc-modal__title {
  margin: 0;
  font-size: 1rem;
  color: var(--brand-ink);
}

.doc-modal__subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.doc-modal__tools {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.pager {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.82rem;
}

.doc-modal__close {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  color: var(--ink-soft);
}

.doc-modal__close:hover {
  background: var(--panel-2);
  color: var(--ink);
}

.doc-modal__body {
  overflow: auto;
  padding: 1rem;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: color-mix(in srgb, var(--ink) 4%, var(--panel-2));
}

.doc-canvas,
.doc-image {
  max-width: 100%;
  box-shadow: 0 4px 16px rgb(0 0 0 / 22%);
}

.doc-modal__loading {
  color: var(--ink-soft);
  padding: 2rem;
}
</style>
