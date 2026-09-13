<template>
  <ul class="tree" :class="{ 'tree--root': depth === 0 }">
    <li v-for="rubro in rubros" :key="rubro.id" class="tree-node">
      <div
        class="tree-row"
        :class="{ 'tree-row--match': resalta(rubro) }"
        :style="{ '--sec-color': meta(rubro.estadoFinanciero).color, '--sec-bg': meta(rubro.estadoFinanciero).bg }"
      >
        <button
          v-if="rubro.hijos?.length"
          type="button"
          class="tree-toggle"
          :aria-expanded="expanded.has(rubro.id)"
          @click="toggle(rubro.id)"
        >
          <i
            class="fas fa-chevron-right"
            :class="{ 'tree-toggle__open': expanded.has(rubro.id) }"
            aria-hidden="true"
          ></i>
        </button>
        <span v-else class="tree-toggle tree-toggle--leaf"></span>

        <span class="tree-code">{{ rubro.codigo }}</span>
        <span class="tree-name">{{ rubro.nombre }}</span>

        <span class="tree-chip">{{ meta(rubro.estadoFinanciero).label }}</span>
        <span v-if="rubro.corriente === true" class="tree-meta">Cte.</span>
        <span v-else-if="rubro.corriente === false" class="tree-meta">No cte.</span>
        <span v-if="rubro.convencionSigno === 'invertido'" class="tree-sign">Inv.</span>
        <span v-if="rubro.aliases?.length" class="tree-alias" :title="rubro.aliases.join(', ')">
          {{ rubro.aliases[0] }}{{ rubro.aliases.length > 1 ? ` +${rubro.aliases.length - 1}` : "" }}
        </span>
      </div>

      <PlanRubroTree
        v-if="rubro.hijos?.length && expanded.has(rubro.id)"
        :rubros="rubro.hijos"
        :busqueda="busqueda"
        :depth="depth + 1"
        :default-expanded="defaultExpanded"
      />
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { RubroInstitucionalDto } from "@ffa/shared";
import { onMounted, ref, watch } from "vue";
import { ESTADO_FINANCIERO_META } from "../utils/planCuentasDisplay";

defineOptions({ name: "PlanRubroTree" });

const props = withDefaults(
  defineProps<{
    rubros: RubroInstitucionalDto[];
    busqueda?: string;
    depth?: number;
    defaultExpanded?: boolean;
  }>(),
  {
    busqueda: "",
    depth: 0,
    defaultExpanded: true,
  }
);

const expanded = ref(new Set<string>());

function meta(estado: string) {
  return ESTADO_FINANCIERO_META[estado] ?? { label: estado, color: "#64748b", bg: "#f1f5f9", icon: "" };
}

function resalta(rubro: RubroInstitucionalDto): boolean {
  const q = props.busqueda.trim().toLowerCase();
  if (!q) return false;
  return [rubro.codigo, rubro.nombre, ...(rubro.aliases ?? [])].join(" ").toLowerCase().includes(q);
}

function toggle(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function expandAll(rubros: RubroInstitucionalDto[]): void {
  const ids = new Set(expanded.value);
  const walk = (list: RubroInstitucionalDto[]): void => {
    for (const r of list) {
      if (r.hijos?.length) {
        ids.add(r.id);
        walk(r.hijos);
      }
    }
  };
  walk(rubros);
  expanded.value = ids;
}

onMounted(() => {
  if (props.defaultExpanded || props.busqueda.trim()) expandAll(props.rubros);
});

watch(
  () => [props.rubros, props.busqueda] as const,
  () => {
    if (props.busqueda.trim() || props.defaultExpanded) expandAll(props.rubros);
  }
);
</script>

<style scoped>
.tree {
  list-style: none;
  margin: 0;
  padding: 0 0 0 0.35rem;
  border-left: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}

.tree--root {
  border-left: none;
  padding-left: 0;
}

.tree-node {
  margin: 0.15rem 0;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  padding: 0.35rem 0.5rem;
  border-radius: 8px;
  transition: background 0.12s;
}

.tree-row:hover {
  background: color-mix(in srgb, var(--sec-bg) 55%, var(--panel));
}

.tree-row--match {
  background: color-mix(in srgb, var(--brand) 12%, var(--panel));
  box-shadow: inset 3px 0 0 var(--brand);
}

.tree-toggle {
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.tree-toggle--leaf {
  cursor: default;
}

.tree-toggle__open {
  transform: rotate(90deg);
}

.tree-code {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--brand-ink);
  min-width: 3.5rem;
}

.tree-name {
  flex: 1;
  min-width: 8rem;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--ink);
}

.tree-chip {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  color: var(--sec-color);
  background: var(--sec-bg);
}

.tree-meta,
.tree-sign {
  font-size: 0.68rem;
  color: var(--ink-faint);
}

.tree-sign {
  color: #b45309;
  font-weight: 600;
}

.tree-alias {
  font-size: 0.72rem;
  color: var(--ink-soft);
  font-style: italic;
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
