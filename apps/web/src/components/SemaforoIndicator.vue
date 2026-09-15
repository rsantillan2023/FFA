<template>
  <span
    v-if="value"
    class="semaforo-ind"
    :class="[`semaforo-ind--${value}`, { 'semaforo-ind--lg': size === 'lg' }]"
    :title="tooltip"
    role="img"
    :aria-label="tooltip"
  >
    <span class="semaforo-ind__housing" aria-hidden="true">
      <span class="semaforo-ind__lamp semaforo-ind__lamp--rojo" :class="{ on: value === 'rojo' }" />
      <span class="semaforo-ind__lamp semaforo-ind__lamp--amarillo" :class="{ on: value === 'amarillo' }" />
      <span class="semaforo-ind__lamp semaforo-ind__lamp--verde" :class="{ on: value === 'verde' }" />
    </span>
    <span v-if="showLabel" class="semaforo-ind__label">{{ shortLabel }}</span>
  </span>
  <span v-else class="semaforo-ind__empty" aria-hidden="true">—</span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    value?: string | null;
    size?: "sm" | "lg";
    showLabel?: boolean;
    /** Tooltip personalizado (p. ej. confianza + validación). */
    hint?: string;
  }>(),
  { size: "sm", showLabel: false }
);

const LABELS: Record<string, string> = {
  verde: "Confianza alta",
  amarillo: "Revisar con atención",
  rojo: "Alerta — requiere revisión",
};

const SHORT: Record<string, string> = {
  verde: "Alto",
  amarillo: "Medio",
  rojo: "Bajo",
};

const tooltip = computed(() => {
  if (props.hint?.trim()) return props.hint.trim();
  return props.value ? (LABELS[props.value] ?? props.value) : "";
});
const shortLabel = computed(() => (props.value ? (SHORT[props.value] ?? props.value) : ""));
</script>

<style scoped>
.semaforo-ind {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  vertical-align: middle;
}

.semaforo-ind__housing {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 3px;
  padding: 2px 4px;
  border-radius: 999px;
  background: transparent;
  border: none;
  box-shadow: none;
}

.semaforo-ind--lg .semaforo-ind__housing {
  gap: 4px;
  padding: 3px 5px;
}

.semaforo-ind__lamp {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  box-sizing: border-box;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--ink-soft, #94a3b8) 70%, var(--line));
  opacity: 0.85;
  transition: opacity 0.15s, box-shadow 0.15s, transform 0.15s, border-color 0.15s;
}

.semaforo-ind--lg .semaforo-ind__lamp {
  width: 9px;
  height: 9px;
}

.semaforo-ind__lamp.on {
  opacity: 1;
  transform: scale(1.08);
  border-color: transparent;
}

.semaforo-ind__lamp--rojo.on {
  background: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.65);
}

.semaforo-ind__lamp--amarillo.on {
  background: #eab308;
  box-shadow: 0 0 6px rgba(234, 179, 8, 0.6);
}

.semaforo-ind__lamp--verde.on {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
}

.semaforo-ind__label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--ink-soft);
}

.semaforo-ind--verde .semaforo-ind__label {
  color: var(--ok);
}

.semaforo-ind--amarillo .semaforo-ind__label {
  color: var(--warn);
}

.semaforo-ind--rojo .semaforo-ind__label {
  color: var(--bad);
}

.semaforo-ind__empty {
  color: var(--ink-faint);
}
</style>
