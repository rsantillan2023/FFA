<template>
  <section class="section card">
    <header class="section__head">
      <span class="section__icon" :class="`section__icon--${tone}`" aria-hidden="true">
        <i :class="icon"></i>
      </span>
      <div>
        <h2 class="section__title">{{ title }}</h2>
        <p v-if="subtitle" class="section__subtitle">{{ subtitle }}</p>
      </div>
    </header>
    <div class="section__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    icon: string;
    subtitle?: string;
    tone?: "brand" | "teal" | "amber" | "violet" | "slate" | "ok";
  }>(),
  { tone: "brand" },
);
</script>

<style scoped>
.section {
  padding: 1rem 1.1rem;
}

.section__head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.section__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 12px;
  font-size: 1rem;
  flex-shrink: 0;
}

.section__icon--brand {
  background: var(--brand-soft);
  color: var(--brand);
}

.section__icon--teal {
  background: rgb(13 148 136 / 12%);
  color: #0d9488;
}

.section__icon--amber {
  background: rgb(245 158 11 / 14%);
  color: #d97706;
}

.section__icon--violet {
  background: rgb(124 58 237 / 12%);
  color: #7c3aed;
}

.section__icon--slate {
  background: rgb(100 116 139 / 12%);
  color: #64748b;
}

.section__icon--ok {
  background: rgb(22 163 74 / 12%);
  color: #16a34a;
}

.section__title {
  margin: 0;
  font-size: 1rem;
  color: var(--brand-ink);
}

.section__subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--ink-soft);
  max-width: 52ch;
}

.section__body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section__body :deep(.tile-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
  gap: 0.6rem;
}
</style>
