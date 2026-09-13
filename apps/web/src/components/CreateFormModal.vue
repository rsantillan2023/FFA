<template>
  <Teleport to="body">
    <div v-if="modelValue" class="create-modal-backdrop" @click.self="tryClose">
      <div
        class="create-modal"
        :class="{
          'create-modal--assist': hasAssist,
          'create-modal--xl': xl && !hasAssist,
          'create-modal--wide': wide && !hasAssist && !xl,
        }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.stop
      >
        <header class="create-modal__head">
          <div>
            <h2 :id="titleId" class="create-modal__title">{{ title }}</h2>
            <p v-if="subtitle" class="create-modal__subtitle">{{ subtitle }}</p>
          </div>
          <button
            v-if="!persistent"
            type="button"
            class="create-modal__close"
            aria-label="Cerrar"
            @click="tryClose"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </header>

        <CreateStepProgress v-if="hasAssist" />

        <div class="create-modal__body" :class="{ 'create-modal__body--split': hasAssist }">
          <aside v-if="hasAssist" class="create-modal__assist">
            <CreateAssistPanel :show-steps="false" sidebar @focus-field="emit('focus-field', $event)" />
          </aside>

          <div v-else-if="$slots.assist" class="create-modal__assist-slot">
            <slot name="assist" />
          </div>

          <div class="create-modal__main">
            <slot />
          </div>
        </div>

        <footer v-if="$slots.footer" class="create-modal__foot">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, useId, watch } from "vue";
import { CREATE_ASSIST_KEY } from "../composables/createAssistContext";
import { useCreateAssist } from "../composables/useCreateAssist";
import type { CreateAssistFlowId } from "../constants/createAssist";
import CreateAssistPanel from "./CreateAssistPanel.vue";
import CreateStepProgress from "./CreateStepProgress.vue";

const props = defineProps<{
  modelValue: boolean;
  title: string;
  subtitle?: string;
  wide?: boolean;
  /** Más ancho que `wide` — útil para paneles con mucho contenido (p. ej. validaciones). */
  xl?: boolean;
  /** No permite cerrar con Escape, clic fuera ni la X. */
  persistent?: boolean;
  assistFlowId?: CreateAssistFlowId;
  assistContext?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "focus-field": [field: string];
}>();

const titleId = useId();
const hasAssist = computed(() => Boolean(props.assistFlowId));

const contextRef = computed(() => props.assistContext ?? {});

const assistState = useCreateAssist({
  flowId: (props.assistFlowId ?? "cargar-ficha") as CreateAssistFlowId,
  context: contextRef,
  onFocusField: (field) => emit("focus-field", field),
});

provide(CREATE_ASSIST_KEY, assistState);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) assistState.reset();
  },
);

function tryClose(): void {
  if (props.persistent) return;
  emit("update:modelValue", false);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.modelValue) tryClose();
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.create-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
}

.create-modal {
  width: min(480px, 100%);
  max-height: min(92vh, 900px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  border-radius: 14px;
  background: var(--panel);
  box-shadow: 0 24px 48px rgb(15 23 42 / 22%);
  overflow: hidden;
}

.create-modal--wide {
  width: min(640px, 100%);
}

.create-modal--xl {
  width: min(920px, 96vw);
  max-height: min(94vh, 960px);
}

.create-modal--assist {
  width: min(1080px, 96vw);
  grid-template-rows: auto auto 1fr auto;
}

.create-modal__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 1.15rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--brand) 5%, var(--panel));
}

.create-modal__title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--brand-ink);
}

.create-modal__subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.4;
}

.create-modal__close {
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

.create-modal__close:hover {
  color: var(--ink);
  border-color: var(--line-2);
}

.create-modal__body {
  overflow-y: auto;
  padding: 1rem 1.15rem;
  min-height: 0;
}

.create-modal__body--split {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 1rem;
  padding: 1rem;
  align-items: start;
}

.create-modal__assist {
  position: sticky;
  top: 0;
}

.create-modal__assist-slot {
  grid-column: 1 / -1;
}

.create-modal__main {
  min-width: 0;
}

.create-modal__main :deep(.modal-form) {
  display: grid;
  gap: 0.75rem;
}

.create-modal__main :deep(.modal-form__actions) {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.35rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
}

.create-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.85rem 1.15rem;
  border-top: 1px solid var(--line);
  background: var(--panel-2);
}

@media (max-width: 860px) {
  .create-modal__body--split {
    grid-template-columns: 1fr;
  }

  .create-modal__assist {
    position: static;
  }
}
</style>
