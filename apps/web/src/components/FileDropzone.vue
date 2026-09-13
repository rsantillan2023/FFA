<template>
  <div class="file-dropzone-wrap">
    <div
      class="file-dropzone"
      :class="{
        'file-dropzone--over': dragOver,
        'file-dropzone--busy': busy,
        'file-dropzone--disabled': disabled,
        'file-dropzone--compact': compact,
        'file-dropzone--has-files': files.length > 0,
      }"
      role="button"
      tabindex="0"
      :aria-disabled="disabled || busy"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="onDragEnter"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <input
        ref="inputRef"
        type="file"
        class="file-dropzone__input"
        :accept="accept"
        :multiple="multiple"
        :disabled="disabled || busy"
        @change="onInputChange"
      />

      <div class="file-dropzone__icon" aria-hidden="true">
        <i :class="busy ? 'fas fa-spinner fa-spin' : 'fas fa-cloud-upload-alt'"></i>
      </div>

      <div class="file-dropzone__copy">
        <strong>{{ busy ? busyLabel : title }}</strong>
        <small v-if="hint">{{ hint }}</small>
      </div>

      <span v-if="!compact" class="file-dropzone__cta">
        <i class="fas fa-folder-open" aria-hidden="true"></i>
        Elegir archivos
      </span>
    </div>

    <ul v-if="files.length && showList" class="file-dropzone__list">
      <li v-for="(file, index) in files" :key="fileKey(file, index)" class="file-dropzone__item">
        <span class="file-dropzone__item-icon" aria-hidden="true">
          <i :class="fileIcon(file.name)"></i>
        </span>
        <span class="file-dropzone__item-meta">
          <strong>{{ file.name }}</strong>
          <small>{{ formatSize(file.size) }}</small>
        </span>
        <button
          type="button"
          class="file-dropzone__remove"
          :disabled="disabled || busy"
          :aria-label="`Quitar ${file.name}`"
          @click.stop="removeAt(index)"
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: File[];
    accept?: string;
    multiple?: boolean;
    busy?: boolean;
    disabled?: boolean;
    compact?: boolean;
    showList?: boolean;
    title?: string;
    hint?: string;
    busyLabel?: string;
  }>(),
  {
    modelValue: () => [],
    accept: "",
    multiple: true,
    busy: false,
    disabled: false,
    compact: false,
    showList: true,
    title: "Arrastrá archivos acá o hacé clic para elegir",
    hint: "",
    busyLabel: "Subiendo…",
  },
);

const emit = defineEmits<{
  "update:modelValue": [files: File[]];
  change: [files: File[]];
}>();

const files = computed(() => props.modelValue ?? []);

const inputRef = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
let dragDepth = 0;

function setFiles(next: File[]): void {
  emit("update:modelValue", next);
  emit("change", next);
}

function openPicker(): void {
  if (props.disabled || props.busy) return;
  inputRef.value?.click();
}

function addFiles(list: FileList | File[]): void {
  const incoming = Array.from(list);
  if (!incoming.length) return;

  if (props.multiple) {
    const merged = [...files.value];
    for (const file of incoming) {
      const dup = merged.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
      if (!dup) merged.push(file);
    }
    setFiles(merged);
  } else {
    setFiles([incoming[0]]);
  }
}

function onInputChange(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  if (input.files?.length) addFiles(input.files);
  input.value = "";
}

function onDragEnter(): void {
  if (props.disabled || props.busy) return;
  dragDepth += 1;
  dragOver.value = true;
}

function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dragOver.value = false;
}

function onDrop(ev: DragEvent): void {
  dragDepth = 0;
  dragOver.value = false;
  if (props.disabled || props.busy) return;
  if (ev.dataTransfer?.files?.length) addFiles(ev.dataTransfer.files);
}

function removeAt(index: number): void {
  const next = [...files.value];
  next.splice(index, 1);
  setFiles(next);
}

function fileKey(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "fas fa-file-pdf";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "fas fa-file-image";
  if (ext === "csv") return "fas fa-file-csv";
  return "fas fa-file-alt";
}

defineExpose({ openPicker, clear: () => setFiles([]) });
</script>

<style scoped>
.file-dropzone-wrap {
  display: grid;
  gap: 0.65rem;
}

.file-dropzone {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.55rem;
  padding: 1.35rem 1rem;
  border: 1.5px dashed var(--line-2);
  border-radius: var(--btn-r, 0.5rem);
  background: color-mix(in srgb, var(--brand) 6%, var(--panel));
  color: var(--ink);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.file-dropzone:hover:not(.file-dropzone--disabled):not(.file-dropzone--busy) {
  border-color: color-mix(in srgb, var(--brand) 45%, var(--line-2));
  background: color-mix(in srgb, var(--brand) 10%, var(--panel));
}

.file-dropzone:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--brand) 45%, transparent);
  outline-offset: 2px;
}

.file-dropzone--over {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 14%, var(--panel));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 14%, transparent);
  transform: scale(1.005);
}

.file-dropzone--busy {
  opacity: 0.72;
  pointer-events: none;
  cursor: wait;
}

.file-dropzone--disabled {
  opacity: 0.55;
  pointer-events: none;
  cursor: not-allowed;
}

.file-dropzone--compact {
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  justify-items: start;
  align-items: center;
  column-gap: 0.85rem;
  row-gap: 0.2rem;
  padding: 0.85rem 1rem;
  text-align: left;
}

.file-dropzone--compact .file-dropzone__icon {
  grid-row: 1 / span 2;
  width: 2.5rem;
  height: 2.5rem;
  font-size: 1rem;
}

.file-dropzone--compact .file-dropzone__copy {
  align-items: flex-start;
}

.file-dropzone__input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.file-dropzone__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 16%, var(--panel));
  color: var(--brand-ink);
  font-size: 1.25rem;
  box-shadow: 0 8px 22px color-mix(in srgb, var(--brand) 18%, transparent);
}

.file-dropzone__copy {
  display: grid;
  gap: 0.2rem;
}

.file-dropzone__copy strong {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink);
}

.file-dropzone__copy small {
  font-size: 0.72rem;
  color: var(--ink-soft);
  line-height: 1.35;
}

.file-dropzone__cta {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.15rem;
  padding: 0.35rem 0.75rem;
  border-radius: var(--btn-r, 0.5rem);
  background: var(--brand);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--brand) 32%, transparent);
}

.file-dropzone__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
}

.file-dropzone__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: var(--btn-r, 0.5rem);
  background: var(--panel);
}

.file-dropzone__item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.45rem;
  background: color-mix(in srgb, var(--brand) 10%, var(--panel-2));
  color: var(--brand-ink);
  font-size: 0.9rem;
}

.file-dropzone__item-meta {
  min-width: 0;
  display: grid;
  gap: 0.1rem;
}

.file-dropzone__item-meta strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink);
}

.file-dropzone__item-meta small {
  font-size: 0.68rem;
  color: var(--ink-faint);
}

.file-dropzone__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--line-2);
  border-radius: var(--btn-r, 0.5rem);
  background: var(--panel-2);
  color: var(--ink-soft);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.file-dropzone__remove:hover:not(:disabled) {
  background: var(--bad-bg);
  border-color: color-mix(in srgb, var(--bad) 35%, var(--line-2));
  color: var(--bad);
}
</style>
