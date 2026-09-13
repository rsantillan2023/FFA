<template>
  <Teleport to="body">
    <div v-if="modelValue && step" class="workflow-modal-backdrop" @click.self="close">
      <div
        class="workflow-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @click.stop
      >
        <header class="workflow-modal__head">
          <div class="workflow-modal__brand">
            <span class="workflow-modal__orden">Etapa {{ step.orden }}</span>
            <span class="workflow-modal__icon" aria-hidden="true">
              <i :class="step.icon"></i>
            </span>
            <h2 :id="titleId" class="workflow-modal__title">{{ step.titulo }}</h2>
          </div>
          <button type="button" class="workflow-modal__close" aria-label="Cerrar" @click="close">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </header>

        <div class="workflow-modal__body">
          <p class="workflow-modal__desc">{{ step.descripcion }}</p>

          <section class="workflow-modal__section">
            <h3 class="workflow-modal__section-title">Subetapas técnicas</h3>
            <ol class="workflow-modal__list">
              <li v-for="(sub, i) in step.subetapas" :key="i">
                <span class="workflow-modal__list-num">{{ i + 1 }}</span>
                <span>{{ sub }}</span>
              </li>
            </ol>
          </section>
        </div>

        <footer class="workflow-modal__foot">
          <button type="button" class="btn btn-ghost" @click="close">Cerrar</button>
          <RouterLink
            v-if="stepRoute"
            :to="stepRoute"
            class="btn btn-primary"
            @click="close"
          >
            Ir a {{ step.routeLabel ?? "módulo" }}
          </RouterLink>
          <p v-else-if="step.routeName && !stepRoute" class="workflow-modal__route-hint">
            Abrí un expediente desde la tabla inferior para acceder a esta etapa con un caso concreto.
          </p>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, useId } from "vue";
import { RouterLink } from "vue-router";
import { workflowRouteFor, type WorkflowMacroStep } from "../constants/workflow";

const props = defineProps<{
  modelValue: boolean;
  step: WorkflowMacroStep | null | undefined;
  casoId?: string;
}>();

const stepRoute = computed(() =>
  props.step ? workflowRouteFor(props.step, props.casoId) : null,
);

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
.workflow-modal-backdrop {
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

.workflow-modal {
  width: min(480px, 100%);
  max-height: min(88vh, 640px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}

.workflow-modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0.85rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--brand-soft) 45%, var(--panel));
}

.workflow-modal__brand {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 0.65rem;
  row-gap: 0.25rem;
  align-items: center;
}

.workflow-modal__orden {
  grid-column: 1 / -1;
  display: inline-flex;
  width: fit-content;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.workflow-modal__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 12px;
  background: var(--panel);
  color: var(--brand);
  font-size: 1rem;
  box-shadow: var(--sh);
}

.workflow-modal__title {
  margin: 0;
  font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--ink);
}

.workflow-modal__close {
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
  flex-shrink: 0;
}

.workflow-modal__close:hover {
  background: var(--line);
  color: var(--ink);
}

.workflow-modal__body {
  padding: 1rem 1.1rem;
  overflow-y: auto;
}

.workflow-modal__desc {
  margin: 0;
  color: var(--ink);
  font-size: 0.9rem;
  line-height: 1.55;
}

.workflow-modal__section {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
}

.workflow-modal__section-title {
  margin: 0 0 0.65rem;
  color: var(--brand-ink);
  font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.workflow-modal__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.workflow-modal__list li {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--canvas) 65%, var(--panel));
  color: var(--ink-soft);
  font-size: 0.84rem;
  line-height: 1.4;
}

.workflow-modal__list-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: 0.65rem;
  font-weight: 700;
  flex-shrink: 0;
}

.workflow-modal__foot {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--line);
}

.workflow-modal__foot .btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.workflow-modal__route-hint {
  margin: 0;
  flex: 1 1 100%;
  font-size: 0.78rem;
  color: var(--ink-faint);
  line-height: 1.4;
}
</style>
