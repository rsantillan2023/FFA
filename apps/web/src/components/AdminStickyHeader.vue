<template>
  <header ref="headerEl" class="admin-sticky-header">
    <div class="admin-sticky-header__titles">
      <h1 tabindex="-1">{{ title }}</h1>
      <p v-if="subtitle" class="admin-sticky-header__subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="admin-sticky-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{
  title: string;
  subtitle?: string;
}>();

const headerEl = ref<HTMLElement | null>(null);
let observer: ResizeObserver | null = null;
let parentEl: HTMLElement | null = null;

function publishHeight(): void {
  if (!headerEl.value || !parentEl) return;
  parentEl.style.setProperty("--admin-sticky-header-height", `${Math.ceil(headerEl.value.offsetHeight)}px`);
}

onMounted(async () => {
  await nextTick();
  parentEl = headerEl.value?.parentElement ?? null;
  publishHeight();
  if (typeof ResizeObserver !== "undefined" && headerEl.value) {
    observer = new ResizeObserver(publishHeight);
    observer.observe(headerEl.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  parentEl?.style.removeProperty("--admin-sticky-header-height");
});
</script>

<style scoped>
.admin-sticky-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem 1rem;
  width: 100%;
  margin: -0.5rem 0 0.75rem;
  padding: 0.75rem 1rem;
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--brand, #6b5bf0) 72%, white);
  border-radius: 12px;
  background: var(--brand, #6b5bf0);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--brand, #6b5bf0) 30%, transparent);
}

.admin-sticky-header__titles {
  min-width: 0;
}

.admin-sticky-header h1 {
  margin: 0;
  color: #fff;
  font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
  outline: none;
}

.admin-sticky-header__subtitle {
  width: 100%;
  margin: 0.12rem 0 0;
  color: rgba(255, 255, 255, 0.9);
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  font-size: 0.72rem;
  font-weight: 400;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
}

.admin-sticky-header__actions {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: flex-end;
  gap: 0.4rem;
  margin-left: auto;
}

@media (max-width: 760px) {
  .admin-sticky-header {
    grid-template-columns: minmax(0, 1fr);
    padding: 0.7rem 0.75rem;
  }

  .admin-sticky-header__actions {
    grid-column: 1;
    grid-row: 3;
    width: 100%;
  }
}
</style>
