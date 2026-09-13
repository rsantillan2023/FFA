<template>
  <ul class="tree">
    <li v-for="rubro in rubros" :key="rubro.id">
      <div class="node">
        <code>{{ rubro.codigo }}</code>
        <span>{{ rubro.nombre }}</span>
        <small>{{ rubro.estadoFinanciero }}</small>
        <small v-if="rubro.convencionSigno === 'invertido'" class="signo">signo inv.</small>
        <small v-if="rubro.aliases?.length" class="alias">{{ rubro.aliases.join(" · ") }}</small>
      </div>
      <RubroTree v-if="rubro.hijos?.length" :rubros="rubro.hijos" />
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { RubroInstitucionalDto } from "@ffa/shared";

defineOptions({ name: "RubroTree" });

defineProps<{ rubros: RubroInstitucionalDto[] }>();
</script>

<style scoped>
.tree {
  list-style: none;
  margin: 0;
  padding-left: 1rem;
}

.node {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.25rem 0;
}

code {
  background: var(--neutral-bg);
  color: var(--neutral-fg);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.8rem;
}

small {
  color: var(--ink-soft);
  text-transform: uppercase;
  font-size: 0.7rem;
}

.signo {
  color: var(--warn);
}

.alias {
  text-transform: none;
  font-style: italic;
}
</style>
