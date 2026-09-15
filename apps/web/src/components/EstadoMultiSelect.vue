<template>
  <div ref="rootRef" class="estado-ms">
    <label v-if="label" class="estado-ms__label" :for="triggerId">{{ label }}</label>
    <div class="estado-ms__control">
      <button
        :id="triggerId"
        type="button"
        class="estado-ms__trigger"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click.stop="toggleOpen"
      >
        <span class="estado-ms__summary">{{ resumen }}</span>
        <i
          class="fas fa-chevron-down estado-ms__chev"
          :class="{ 'estado-ms__chev--open': open }"
          aria-hidden="true"
        ></i>
      </button>
      <div
        v-if="open"
        class="estado-ms__panel"
        role="listbox"
        aria-multiselectable="true"
        @click.stop
      >
      <label class="estado-ms__option estado-ms__option--todos">
        <input
          type="checkbox"
          :checked="!modelValue.length"
          @change="seleccionarTodos"
        />
        <span>Todos los estados</span>
      </label>
      <div class="estado-ms__sep" role="separator"></div>
      <label v-for="(lbl, key) in labels" :key="key" class="estado-ms__option">
        <input
          type="checkbox"
          :checked="modelValue.includes(key)"
          @change="toggle(key)"
        />
        <span>{{ lbl }}</span>
      </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  modelValue: string[];
  labels: Record<string, string>;
  label?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
  change: [];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const triggerId = `estado-ms-${Math.random().toString(36).slice(2, 9)}`;

const resumen = computed(() => {
  const n = props.modelValue.length;
  if (n === 0) return "Todos los estados";
  if (n === 1) {
    const k = props.modelValue[0]!;
    return props.labels[k] ?? k;
  }
  return `${n} estados seleccionados`;
});

function emitChange(next: string[]): void {
  emit("update:modelValue", next);
  emit("change");
}

function toggle(key: string): void {
  const set = new Set(props.modelValue);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  emitChange([...set]);
}

function seleccionarTodos(): void {
  emitChange([]);
}

function toggleOpen(): void {
  open.value = !open.value;
}

function onDocumentClick(e: MouseEvent): void {
  const el = rootRef.value;
  if (!open.value || !el) return;
  if (!el.contains(e.target as Node)) open.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") open.value = false;
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<style scoped>
.estado-ms {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
}

.estado-ms__label {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-soft);
  white-space: nowrap;
}

.estado-ms__control {
  position: relative;
  min-width: 10rem;
}

.estado-ms__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  min-width: 10rem;
  max-width: 16rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ink);
  font-size: 0.82rem;
  text-align: left;
  cursor: pointer;
}

.estado-ms__trigger:hover {
  border-color: var(--line-2);
  background: var(--panel-2);
}

.estado-ms__summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.estado-ms__chev {
  flex-shrink: 0;
  font-size: 0.65rem;
  color: var(--ink-soft);
  transition: transform 0.15s ease;
}

.estado-ms__chev--open {
  transform: rotate(180deg);
}

.estado-ms__panel {
  position: absolute;
  z-index: 40;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  max-width: 18rem;
  max-height: 16rem;
  overflow-y: auto;
  padding: 0.35rem 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  box-shadow:
    0 10px 24px rgba(15, 23, 42, 0.12),
    0 2px 6px rgba(15, 23, 42, 0.06);
}

.estado-ms__option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.65rem;
  font-size: 0.8rem;
  color: var(--ink);
  cursor: pointer;
}

.estado-ms__option:hover {
  background: var(--panel-2);
}

.estado-ms__option input {
  flex-shrink: 0;
  margin: 0;
  cursor: pointer;
}

.estado-ms__option--todos {
  font-weight: 600;
}

.estado-ms__sep {
  height: 1px;
  margin: 0.25rem 0.5rem;
  background: var(--line);
}
</style>
