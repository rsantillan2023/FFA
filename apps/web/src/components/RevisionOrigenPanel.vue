<template>
  <details class="revision-origen" :open="openByDefault">
    <summary class="revision-origen__summary">
      <i class="fas fa-diagram-project" aria-hidden="true"></i>
      Origen de datos
      <span class="revision-origen__pill">{{ resumen.total }} líneas</span>
    </summary>
    <div class="revision-origen__body">
      <div class="revision-origen__grid">
        <article class="revision-origen__stat revision-origen__stat--ia">
          <span class="revision-origen__label">IA revisión</span>
          <strong>{{ resumen.ia }}</strong>
        </article>
        <article class="revision-origen__stat revision-origen__stat--manual">
          <span class="revision-origen__label">Manual</span>
          <strong>{{ resumen.manual }}</strong>
        </article>
        <article class="revision-origen__stat">
          <span class="revision-origen__label">Extracción / otro</span>
          <strong>{{ resumen.extraccion }}</strong>
        </article>
        <article
          class="revision-origen__stat"
          :class="{ 'revision-origen__stat--warn': resumen.sinRubro > 0 }"
        >
          <span class="revision-origen__label">Sin rubro</span>
          <strong>{{ resumen.sinRubro }}</strong>
        </article>
        <article
          class="revision-origen__stat"
          :class="{ 'revision-origen__stat--warn': resumen.pendientes > 0 }"
        >
          <span class="revision-origen__label">Pendientes</span>
          <strong>{{ resumen.pendientes }}</strong>
        </article>
      </div>
      <p class="revision-origen__hint">
        Las líneas clasificadas por IA quedan en verde; el analista solo confirma excepciones o corrige manualmente.
      </p>
    </div>
  </details>
</template>

<script setup lang="ts">
import type { LineaContableDto } from "@ffa/shared";
import { computed } from "vue";
import { calcularOrigenLineas } from "../utils/revisionResumen";

const props = withDefaults(
  defineProps<{
    lineas: LineaContableDto[];
    openByDefault?: boolean;
  }>(),
  { openByDefault: true }
);

const resumen = computed(() => calcularOrigenLineas(props.lineas));
</script>

<style scoped>
.revision-origen {
  margin-bottom: 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-soft) 18%, var(--panel));
}

.revision-origen__summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--brand-ink);
  list-style: none;
}

.revision-origen__summary::-webkit-details-marker {
  display: none;
}

.revision-origen__pill {
  margin-left: auto;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--panel);
  color: var(--ink-soft);
}

.revision-origen__body {
  padding: 0 0.85rem 0.85rem;
}

.revision-origen__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: 0.5rem;
}

.revision-origen__stat {
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--panel);
}

.revision-origen__stat strong {
  display: block;
  font-size: 1.1rem;
  color: var(--brand-dark, var(--brand-ink));
}

.revision-origen__label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}

.revision-origen__stat--ia strong {
  color: var(--brand);
}

.revision-origen__stat--manual strong {
  color: var(--ink);
}

.revision-origen__stat--warn {
  border-color: color-mix(in srgb, var(--warn) 45%, var(--line));
  background: color-mix(in srgb, var(--warn) 8%, var(--panel));
}

.revision-origen__hint {
  margin: 0.55rem 0 0;
  font-size: 0.72rem;
  color: var(--ink-soft);
}
</style>
