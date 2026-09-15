<template>
  <div
    class="workflow-diagram"
    :class="{ 'workflow-diagram--compact': compact, 'workflow-diagram--bare': bare }"
  >
    <div class="workflow-diagram__track" role="list" aria-label="Etapas del proceso">
      <div v-for="(step, index) in steps" :key="step.id" class="workflow-diagram__item">
        <article
          class="workflow-node"
          :class="[
            `workflow-node--${step.status}`,
            {
              'workflow-node--selected': selectedId === step.id,
              'workflow-node--interactive': interactive,
            },
          ]"
          role="listitem"
          tabindex="0"
          @click="emit('select', step.id)"
          @keydown.enter="emit('select', step.id)"
        >
          <div class="workflow-node__badge">{{ step.orden }}</div>
          <div class="workflow-node__icon" aria-hidden="true">
            <i :class="step.icon"></i>
          </div>
          <h3 class="workflow-node__title">{{ step.titulo }}</h3>
          <p v-if="!compact" class="workflow-node__desc">{{ step.descripcion }}</p>
          <p v-if="step.detalle" class="workflow-node__detalle">{{ step.detalle }}</p>
          <p v-if="step.fecha && showDates" class="workflow-node__fecha">
            {{ formatDate(step.fecha) }}
          </p>
          <span class="workflow-node__status-label">{{ statusLabel(step.status) }}</span>
          <RouterLink
            v-show="showLinks && linkFor(step) && step.status !== 'pending'"
            :to="linkFor(step)!"
            class="workflow-node__link"
            @click.stop
          >
            {{ step.routeLabel ?? "Ir" }}
          </RouterLink>
        </article>

        <div
          class="workflow-arrow"
          :class="[
            index < steps.length - 1
              ? `workflow-arrow--${arrowStatus(step, steps[index + 1]!)}`
              : 'workflow-arrow--pending',
            { 'workflow-arrow--hidden': index >= steps.length - 1 },
          ]"
          aria-hidden="true"
        >
          <i class="fas fa-arrow-right"></i>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import {
  workflowRouteFor,
  type WorkflowStepStatus,
  type WorkflowStepView,
} from "../constants/workflow";

const props = defineProps<{
  steps: WorkflowStepView[];
  compact?: boolean;
  /** Sin caja/borde alrededor de cada nodo — solo icono y texto. */
  bare?: boolean;
  showDates?: boolean;
  showLinks?: boolean;
  casoId?: string;
  selectedId?: string;
  interactive?: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();

function statusLabel(status: WorkflowStepStatus): string {
  if (status === "completed") return "Completada";
  if (status === "active") return "En curso";
  if (status === "error") return "Interrumpida";
  return "Pendiente";
}

function arrowStatus(from: WorkflowStepView, to: WorkflowStepView): string {
  if (from.status === "completed" && to.status !== "pending") return "done";
  if (from.status === "active" || to.status === "active") return "active";
  if (from.status === "error" || to.status === "error") return "error";
  return "pending";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function linkFor(step: WorkflowStepView): { name: string; params?: { id: string } } | null {
  return workflowRouteFor(step, props.casoId);
}
</script>

<style scoped>
.workflow-diagram {
  overflow-x: auto;
  padding-bottom: 0.5rem;
}

.workflow-diagram__track {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-width: min(100%, 960px);
}

.workflow-diagram__item {
  display: flex;
  flex: 1 1 0;
  align-items: stretch;
  min-width: 0;
}

.workflow-node {
  flex: 1 1 0;
  min-width: 9.5rem;
  max-width: 11.5rem;
  padding: 0.85rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  box-shadow: var(--sh);
  cursor: default;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.workflow-node--interactive {
  cursor: pointer;
}

.workflow-node--interactive:hover {
  border-color: color-mix(in srgb, var(--brand) 40%, var(--line));
  box-shadow: 0 2px 10px rgb(15 23 42 / 8%);
}

.workflow-node--interactive:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.workflow-node--selected {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 25%, transparent);
}

.workflow-node--completed {
  border-color: color-mix(in srgb, var(--ok) 45%, var(--line));
  background: color-mix(in srgb, var(--ok) 8%, var(--panel));
}

.workflow-node--active {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand-soft) 55%, var(--panel));
}

.workflow-node--error {
  border-color: color-mix(in srgb, var(--warn) 55%, var(--line));
  background: color-mix(in srgb, var(--warn) 10%, var(--panel));
}

.workflow-node--pending {
  opacity: 0.82;
}

.workflow-node__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  margin-bottom: 0.35rem;
  border-radius: 999px;
  background: var(--line);
  color: var(--ink-soft);
  font-size: 0.68rem;
  font-weight: 700;
}

.workflow-node--active .workflow-node__badge,
.workflow-node--completed .workflow-node__badge {
  background: var(--brand);
  color: #fff;
}

.workflow-node__icon {
  margin-bottom: 0.35rem;
  color: var(--brand);
  font-size: 1rem;
}

.workflow-node__title {
  margin: 0;
  font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--ink);
}

.workflow-node__desc {
  margin: 0.35rem 0 0;
  font-size: 0.68rem;
  line-height: 1.4;
  color: var(--ink-faint);
}

.workflow-node__detalle {
  margin: 0.45rem 0 0;
  padding: 0.35rem 0.45rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--canvas) 70%, var(--panel));
  font-size: 0.65rem;
  line-height: 1.35;
  color: var(--ink-soft);
}

.workflow-node__fecha {
  margin: 0.3rem 0 0;
  font-size: 0.62rem;
  color: var(--ink-faint);
}

.workflow-node__status-label {
  display: inline-block;
  margin-top: 0.45rem;
  padding: 0.12rem 0.4rem;
  border-radius: 999px;
  background: var(--line);
  font-size: 0.58rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.workflow-node--active .workflow-node__status-label {
  background: var(--brand-soft);
  color: var(--brand-ink);
}

.workflow-node--completed .workflow-node__status-label {
  background: color-mix(in srgb, var(--ok) 18%, var(--panel));
  color: var(--ok);
}

.workflow-node__link {
  display: inline-block;
  margin-top: 0.4rem;
  font-size: 0.65rem;
  color: var(--brand);
  text-decoration: none;
}

.workflow-node__link:hover {
  text-decoration: underline;
}

.workflow-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 1.75rem;
  color: var(--line-2);
  font-size: 0.75rem;
}

.workflow-arrow--done {
  color: var(--ok);
}

.workflow-arrow--active {
  color: var(--brand);
}

.workflow-arrow--error {
  color: var(--warn);
}

.workflow-arrow--hidden {
  visibility: hidden;
  pointer-events: none;
}

.workflow-diagram--compact .workflow-node {
  min-width: 7.5rem;
  max-width: 9rem;
  padding: 0.65rem 0.55rem;
}

.workflow-diagram--bare .workflow-node {
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  padding: 0.35rem 0.25rem;
}

.workflow-diagram--bare .workflow-node--interactive:hover {
  border: none;
  box-shadow: none;
  background: transparent;
}

.workflow-diagram--bare .workflow-node--interactive:hover .workflow-node__title {
  color: var(--brand);
}

.workflow-diagram--bare .workflow-node--selected {
  border: none;
  box-shadow: none;
  background: transparent;
}

.workflow-diagram--bare .workflow-node--selected .workflow-node__title {
  color: var(--brand-ink);
}

.workflow-diagram--bare .workflow-node--completed,
.workflow-diagram--bare .workflow-node--active,
.workflow-diagram--bare .workflow-node--error,
.workflow-diagram--bare .workflow-node--pending {
  border: none;
  background: transparent;
  box-shadow: none;
}

.workflow-diagram--bare .workflow-node__detalle {
  background: transparent;
  padding: 0.25rem 0 0;
}

@media (max-width: 900px) {
  .workflow-diagram__track {
    flex-direction: column;
    align-items: stretch;
    min-width: 100%;
  }

  .workflow-diagram__item {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .workflow-node {
    max-width: none;
  }

  .workflow-arrow {
    flex: 0 0 auto;
    padding: 0.15rem 0;
    transform: rotate(90deg);
  }
}
</style>
