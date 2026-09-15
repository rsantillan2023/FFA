<template>
  <aside
    v-if="banner"
    class="prov-banner"
    :class="banner.tipo === 'warning' ? 'prov-banner--warn' : 'prov-banner--info'"
    role="status"
  >
    <i
      :class="banner.tipo === 'warning' ? 'fas fa-triangle-exclamation' : 'fas fa-circle-info'"
      aria-hidden="true"
    ></i>
    <div class="prov-banner__body">
      <p class="prov-banner__title">
        {{ banner.tipo === "warning" ? "Fallback heurístico" : "Información de procesamiento" }}
      </p>
      <p class="prov-banner__text">{{ banner.mensaje }}</p>
      <ul v-if="metricas.length" class="prov-banner__metrics">
        <li v-for="m in metricas" :key="m">{{ m }}</li>
      </ul>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { ProvenanceCasoDto } from "@ffa/shared";
import { computed } from "vue";
import { buildProvenanceBanner } from "../utils/provenanceDisplay";

const props = defineProps<{
  provenance?: ProvenanceCasoDto | null;
}>();

const banner = computed(() =>
  props.provenance ? buildProvenanceBanner(props.provenance) : null
);

const metricas = computed(() => {
  const p = props.provenance;
  if (!p) return [] as string[];
  const items: string[] = [];
  const ext = p.extraccion;
  if (ext && ext.paginasPdfTotal > 0) {
    items.push(
      `Vision: ${ext.paginasEnviadasVision}/${ext.paginasPdfTotal} pág. (${ext.seleccionPaginas.replace(/_/g, " ")})`
    );
  }
  if (ext?.textoNativoPrimario) {
    items.push("Extracción primaria: texto nativo del PDF");
  }
  if (ext && ext.lineasOmitidasEstimadas > 0) {
    items.push(`Filas no extraídas (estimado): ${ext.lineasOmitidasEstimadas}`);
  }
  const cls = p.clasificacion;
  if (cls) {
    if (cls.iaPrimaria > 0) items.push(`Clasificación IA: ${cls.iaPrimaria}`);
    if (cls.semanticaFallback > 0) items.push(`Clasificación heurística: ${cls.semanticaFallback}`);
  }
  return items;
});
</script>

<style scoped>
.prov-banner {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.75rem 1rem;
  margin: 0 0 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
}

.prov-banner--warn {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  color: #92400e;
}

.prov-banner--info {
  background: #eff6ff;
  border: 1px solid #93c5fd;
  color: #1e40af;
}

.prov-banner__title {
  margin: 0 0 0.25rem;
  font-weight: 700;
}

.prov-banner__text {
  margin: 0;
  line-height: 1.45;
}

.prov-banner__metrics {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  opacity: 0.95;
}
</style>
