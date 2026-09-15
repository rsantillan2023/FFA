<template>
  <section class="pipe-etapas">
    <p v-if="titulo" class="pipe-etapas__title">{{ titulo }}</p>
    <ul class="pipe-etapas__list">
      <li
        v-for="(etapa, index) in displayEtapas"
        :key="etapa.id"
        class="pipe-etapas__item"
        :class="`pipe-etapas__item--${bulbEstado(etapa, index)}`"
      >
        <div class="pipe-etapas__row">
          <span
            class="pipe-etapas__dot"
            :class="`pipe-etapas__dot--${bulbEstado(etapa, index)}`"
            aria-hidden="true"
          ></span>
          <span class="pipe-etapas__num">{{ index + 1 }}</span>
          <span class="pipe-etapas__name">{{ pipelineFriendlyMeta(etapa).titulo }}</span>
          <span
            v-if="pipelineEtapaProgresoPct(etapa) != null"
            class="pipe-etapas__pct"
            :title="etapa.enCurso ? 'Avance global del pipeline' : 'Avance al completar el paso'"
          >
            {{ pipelineEtapaProgresoPct(etapa) }}%
          </span>
          <span class="pipe-etapas__status">{{ pasoCorto(etapa, index) }}</span>
        </div>
        <p v-if="metaLine(etapa, index)" class="pipe-etapas__meta">{{ metaLine(etapa, index) }}</p>
        <ul v-if="etapa.subPasos?.length && etapa.enCurso" class="pipe-etapas__sub">
          <li
            v-for="sub in etapa.subPasos"
            :key="sub.id"
            class="pipe-etapas__sub-item"
            :class="`pipe-etapas__sub-item--${sub.estado}`"
          >
            <span class="pipe-etapas__sub-label">{{ sub.label }}</span>
            <span class="pipe-etapas__sub-status">{{ pipelineSubPasoEstadoCorto(sub.estado) }}</span>
            <span v-if="subMeta(sub)" class="pipe-etapas__sub-meta">{{ subMeta(sub) }}</span>
          </li>
        </ul>
        <p
          v-else-if="etapa.completada && etapa.detalle"
          class="pipe-etapas__result"
        >
          {{ pipelineDetalleAmigable(etapa) }}
        </p>
      </li>
    </ul>
    <p v-if="pasoDetenidoLabel" class="pipe-etapas__stop">
      <i class="fas fa-location-dot" aria-hidden="true"></i>
      {{ pasoDetenidoLabel }}
    </p>
  </section>
</template>

<script setup lang="ts">
import type { PipelineEtapaDto, PipelineSubPasoDto } from "@ffa/shared";
import { computed } from "vue";
import {
  formatDuracionSegundos,
  formatHoraCorta,
  pipelineBulbEstado,
  pipelineDetalleAmigable,
  pipelineEtapaMetaLine,
  pipelineEtapaProgresoPct,
  pipelineEtapasPlaceholder,
  pipelineFirstPendingIndex,
  pipelineFriendlyMeta,
  pipelinePasoEstado,
  pipelinePasoEstadoCorto,
  pipelineSubPasoActivo,
  pipelineSubPasoMetaLine,
  pipelineSubPasoEstadoCorto,
} from "../utils/pipelineDisplay";

const props = defineProps<{
  etapas?: PipelineEtapaDto[] | null;
  titulo?: string;
  procesando?: boolean;
}>();

const displayEtapas = computed(() =>
  props.etapas?.length ? props.etapas : pipelineEtapasPlaceholder()
);

const pasoDetenidoLabel = computed(() => {
  const etapaActiva = displayEtapas.value.find((e) => e.enCurso);
  const idx = etapaActiva
    ? displayEtapas.value.indexOf(etapaActiva)
    : pipelineFirstPendingIndex(displayEtapas.value);
  if (idx < 0) return null;
  const etapa = displayEtapas.value[idx];
  if (!etapa) return null;
  const meta = pipelineFriendlyMeta(etapa);
  const enCurso = etapa.enCurso === true;
  const sub = pipelineSubPasoActivo(etapa);
  const parts = [
    props.procesando && enCurso
      ? sub?.estado === "espera"
        ? `En cola: ${meta.titulo}`
        : sub
          ? `Procesando: ${sub.label}`
          : `Procesando: ${meta.titulo}`
      : enCurso
        ? `Detenido en: ${meta.titulo}`
        : `Próximo paso: ${meta.titulo}`,
  ];
  if (enCurso && etapa.iniciadaEn) {
    parts.push(`desde ${formatHoraCorta(etapa.iniciadaEn)}`);
  }
  if (sub?.estado === "espera" && sub.esperaSegundos != null && sub.esperaSegundos > 0) {
    parts.push(`espera ${formatDuracionSegundos(sub.esperaSegundos)}`);
  } else if (sub?.trabajoSegundos != null && sub.trabajoSegundos > 0) {
    parts.push(`trabajo ${formatDuracionSegundos(sub.trabajoSegundos)}`);
  } else if (enCurso && etapa.duracionSegundos != null && etapa.duracionSegundos > 0) {
    parts.push(formatDuracionSegundos(etapa.duracionSegundos));
  }
  if (enCurso && etapa.progresoPct != null) {
    parts.push(`${etapa.progresoPct}%`);
  }
  return parts.join(" · ");
});

function metaLine(etapa: PipelineEtapaDto, index: number): string {
  return pipelineEtapaMetaLine(etapa, bulbEstado(etapa, index));
}

function bulbEstado(etapa: PipelineEtapaDto, index: number) {
  return pipelineBulbEstado(etapa, index, displayEtapas.value, props.procesando);
}

function pasoCorto(etapa: PipelineEtapaDto, index: number): string {
  const color = bulbEstado(etapa, index);
  if (color === "azul") {
    const sub = pipelineSubPasoActivo(etapa);
    if (sub?.estado === "espera") return "En cola";
    return "Procesando";
  }
  if (color === "rojo") return "Detenido";
  return pipelinePasoEstadoCorto(pipelinePasoEstado(etapa, index, displayEtapas.value));
}

function subMeta(sub: PipelineSubPasoDto): string {
  return pipelineSubPasoMetaLine(sub);
}
</script>

<style scoped>
.pipe-etapas {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
  padding: 0.65rem 0.75rem;
}

.pipe-etapas__title {
  margin: 0 0 0.45rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--ink);
}

.pipe-etapas__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pipe-etapas__item {
  padding: 0.35rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.pipe-etapas__item:last-child {
  border-bottom: none;
}

.pipe-etapas__row {
  display: grid;
  grid-template-columns: 0.65rem 1.25rem minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.4rem;
}

.pipe-etapas__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  justify-self: center;
}

.pipe-etapas__dot--verde {
  background: var(--ok);
  box-shadow: 0 0 4px color-mix(in srgb, var(--ok) 55%, transparent);
}

.pipe-etapas__dot--azul {
  background: #2563eb;
  box-shadow: 0 0 5px rgba(37, 99, 235, 0.55);
}

.pipe-etapas__dot--rojo {
  background: var(--bad);
}

.pipe-etapas__dot--gris {
  background: var(--ink-faint);
}

.pipe-etapas__num {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.pipe-etapas__name {
  font-size: 0.84rem;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pipe-etapas__pct {
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--brand);
  white-space: nowrap;
}

.pipe-etapas__item--verde .pipe-etapas__pct {
  color: var(--ok);
}

.pipe-etapas__status {
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.pipe-etapas__item--verde .pipe-etapas__status {
  color: var(--ok);
}

.pipe-etapas__item--azul .pipe-etapas__status {
  color: #2563eb;
}

.pipe-etapas__item--rojo .pipe-etapas__status {
  color: var(--bad);
}

.pipe-etapas__item--gris .pipe-etapas__status {
  color: var(--ink-soft);
}

.pipe-etapas__meta,
.pipe-etapas__result {
  margin: 0.15rem 0 0 2.3rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--ink-soft);
}

.pipe-etapas__item--azul .pipe-etapas__meta {
  color: #1d4ed8;
  font-weight: 500;
}

.pipe-etapas__sub {
  margin: 0.35rem 0 0 2.3rem;
  padding: 0.35rem 0.45rem;
  list-style: none;
  border-radius: 8px;
  background: var(--panel);
  border: 1px dashed var(--line);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.pipe-etapas__sub-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.25rem 0.5rem;
  font-size: 0.72rem;
  align-items: baseline;
}

.pipe-etapas__sub-label {
  font-weight: 600;
  color: var(--ink);
}

.pipe-etapas__sub-status {
  font-weight: 600;
  text-align: right;
}

.pipe-etapas__sub-item--listo .pipe-etapas__sub-status {
  color: var(--ok);
}

.pipe-etapas__sub-item--en_curso .pipe-etapas__sub-status {
  color: #2563eb;
}

.pipe-etapas__sub-item--espera .pipe-etapas__sub-status {
  color: var(--warn);
}

.pipe-etapas__sub-item--pendiente .pipe-etapas__sub-status {
  color: var(--ink-soft);
}

.pipe-etapas__sub-meta {
  grid-column: 1 / -1;
  font-size: 0.68rem;
  color: var(--ink-soft);
  line-height: 1.35;
}

.pipe-etapas__stop {
  margin: 0.5rem 0 0;
  padding: 0.4rem 0.5rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--warn) 12%, var(--panel));
  color: var(--ink);
  font-weight: 600;
  font-size: 0.75rem;
}

.pipe-etapas__stop i {
  margin-right: 0.25rem;
  color: var(--warn);
}
</style>
