<template>
  <article class="tile" :class="tone ? `tile--${tone}` : undefined">
    <div class="tile__top">
      <span class="tile__icon" :class="tone ? `tile__icon--${tone}` : undefined" aria-hidden="true">
        <i :class="icon"></i>
      </span>
      <div
        v-if="pct != null"
        class="tile__ring"
        role="img"
        :aria-label="`${label}: ${pct} por ciento`"
        :style="{ '--pct': Math.min(100, Math.max(0, pct)) }"
      >
        <span class="tile__ring-inner">{{ pct }}%</span>
      </div>
    </div>
    <p class="tile__label">{{ label }}</p>
    <p class="tile__value">{{ value }}</p>
    <p v-if="hint" class="tile__hint">{{ hint }}</p>
    <div v-if="pct != null && showBar" class="tile__bar" aria-hidden="true">
      <span class="tile__bar-fill" :style="{ width: `${Math.min(100, Math.max(0, pct))}%` }"></span>
    </div>
  </article>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    icon: string;
    label: string;
    value: string;
    hint?: string;
    pct?: number | null;
    showBar?: boolean;
    tone?: "brand" | "teal" | "amber" | "violet" | "rose" | "slate" | "ok" | "warn";
  }>(),
  {
    showBar: false,
    tone: "brand",
  },
);
</script>

<style scoped>
.tile {
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--panel);
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.tile__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}

.tile__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 10px;
  font-size: 0.95rem;
  flex-shrink: 0;
}

.tile__icon--brand {
  background: color-mix(in srgb, var(--brand) 14%, var(--panel));
  color: var(--brand);
}

.tile__icon--teal {
  background: rgb(13 148 136 / 12%);
  color: #0d9488;
}

.tile__icon--amber {
  background: rgb(245 158 11 / 14%);
  color: #d97706;
}

.tile__icon--violet {
  background: rgb(124 58 237 / 12%);
  color: #7c3aed;
}

.tile__icon--rose {
  background: rgb(225 29 72 / 10%);
  color: #e11d48;
}

.tile__icon--slate {
  background: rgb(100 116 139 / 12%);
  color: #64748b;
}

.tile__icon--ok {
  background: rgb(22 163 74 / 12%);
  color: #16a34a;
}

.tile__icon--warn {
  background: rgb(234 88 12 / 12%);
  color: #ea580c;
}

.tile__ring {
  width: 2.65rem;
  height: 2.65rem;
  border-radius: 50%;
  background: conic-gradient(
    var(--ring-color, var(--brand)) calc(var(--pct) * 1%),
    color-mix(in srgb, var(--line) 80%, transparent) 0
  );
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.tile--teal .tile__ring {
  --ring-color: #0d9488;
}

.tile--amber .tile__ring {
  --ring-color: #d97706;
}

.tile--violet .tile__ring {
  --ring-color: #7c3aed;
}

.tile--ok .tile__ring {
  --ring-color: #16a34a;
}

.tile__ring-inner {
  width: 1.95rem;
  height: 1.95rem;
  border-radius: 50%;
  background: var(--panel);
  display: grid;
  place-items: center;
  font-size: 0.58rem;
  font-weight: 700;
  color: var(--ink);
}

.tile__label {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--ink-soft);
}

.tile__value {
  margin: 0.25rem 0 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.2;
}

.tile__hint {
  margin: 0.3rem 0 0;
  font-size: 0.65rem;
  line-height: 1.35;
  color: var(--ink-faint);
}

.tile__bar {
  margin-top: auto;
  padding-top: 0.55rem;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--line) 70%, transparent);
  overflow: hidden;
}

.tile__bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ring-color, var(--brand));
  transition: width 0.35s ease;
}
</style>
