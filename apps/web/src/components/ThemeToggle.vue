<template>
  <button
    type="button"
    class="theme-toggle"
    :title="tooltip"
    :aria-label="tooltip"
    @click="toggle()"
  >
    <i :class="isDark ? 'fas fa-sun' : 'fas fa-moon'" aria-hidden="true"></i>
  </button>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useThemeStore } from "../stores/theme";

const theme = useThemeStore();
const { resolved } = storeToRefs(theme);

const isDark = computed(() => resolved.value === "dark");
const tooltip = computed(() =>
  isDark.value ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
);

function toggle(): void {
  theme.toggle();
}
</script>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  border-radius: 0.5rem;
  padding: 0;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.theme-toggle:hover {
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.theme-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, currentColor 45%, transparent);
  outline-offset: 2px;
}
</style>
