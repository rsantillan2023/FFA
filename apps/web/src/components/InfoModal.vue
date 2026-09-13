<template>
  <Teleport to="body">
    <div v-if="modelValue" class="info-modal-backdrop" @click.self="close">
      <div
        class="info-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.stop
      >
        <header class="info-modal__head">
          <div class="info-modal__icon-wrap" aria-hidden="true">
            <i class="fas fa-info-circle"></i>
          </div>
          <h2 :id="titleId" class="info-modal__title">{{ title }}</h2>
          <button type="button" class="info-modal__close" aria-label="Cerrar" @click="close">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </header>

        <div class="info-modal__body">
          <p class="info-modal__summary">{{ summary }}</p>

          <p v-if="whenToUse" class="info-modal__when">
            <strong>¿Cuándo usarla?</strong>
            {{ whenToUse }}
          </p>

          <ul v-if="bullets?.length" class="info-modal__list">
            <li v-for="(item, i) in bullets" :key="i">{{ item }}</li>
          </ul>

          <div v-for="(section, si) in sections ?? []" :key="si" class="info-modal__section">
            <h3 class="info-modal__section-title">{{ section.title }}</h3>
            <ul class="info-modal__list">
              <li v-for="(item, i) in section.bullets" :key="i">{{ item }}</li>
            </ul>
          </div>

          <slot />
        </div>

        <footer class="info-modal__foot">
          <button type="button" class="btn btn-primary" @click="close">Entendido</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useId } from "vue";

const props = defineProps<{
  modelValue: boolean;
  title: string;
  summary: string;
  whenToUse?: string;
  bullets?: string[];
  sections?: { title: string; bullets: string[] }[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const titleId = useId();

function close(): void {
  emit("update:modelValue", false);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape" && props.modelValue) close();
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.info-modal-backdrop {
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

.info-modal {
  width: min(560px, 100%);
  max-height: min(88vh, 720px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}

.info-modal__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 0.65rem;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--brand-soft) 40%, var(--panel));
}

.info-modal__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 1rem;
}

.info-modal__title {
  margin: 0.1rem 0 0;
  color: var(--ink);
  font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
}

.info-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-faint);
  cursor: pointer;
}

.info-modal__close:hover {
  background: var(--line);
  color: var(--ink);
}

.info-modal__body {
  padding: 1rem 1.1rem;
  overflow-y: auto;
}

.info-modal__summary {
  margin: 0;
  color: var(--ink);
  font-size: 0.875rem;
  line-height: 1.55;
}

.info-modal__when {
  margin: 0.85rem 0 0;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: var(--brand-soft);
  color: var(--ink);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.info-modal__when strong {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--brand-ink);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.info-modal__list {
  margin: 0.85rem 0 0;
  padding-left: 1.15rem;
  color: var(--ink-soft);
  font-size: 0.8125rem;
  line-height: 1.55;
}

.info-modal__list li + li {
  margin-top: 0.35rem;
}

.info-modal__section {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
}

.info-modal__section-title {
  margin: 0 0 0.45rem;
  color: var(--brand-ink);
  font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.info-modal__foot {
  display: flex;
  justify-content: flex-end;
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--line);
}
</style>
