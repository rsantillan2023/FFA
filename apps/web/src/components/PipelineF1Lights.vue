<template>
  <div
    ref="anchorRef"
    class="f1-wrap"
    @mouseenter="openPopover"
    @mouseleave="scheduleClose"
    @focusin="openPopover"
    @focusout="scheduleClose"
  >
    <div class="f1-lights" role="group" :aria-label="ariaLabel">
      <button
        v-for="(etapa, index) in displayEtapas"
        :key="etapa.id"
        type="button"
        class="f1-lights__bulb"
        :class="`f1-lights__bulb--${bulbEstado(etapa, index)}`"
        :title="bulbTitle(etapa, index)"
        :aria-label="bulbTitle(etapa, index)"
        @click.stop="$emit('select', etapa)"
      />
    </div>

    <Teleport to="body">
      <div
        v-if="popoverOpen"
        class="f1-popover"
        role="dialog"
        aria-label="Detalle de etapas del procesamiento"
        :style="popoverStyle"
        @mouseenter="cancelClose"
        @mouseleave="scheduleClose"
      >
        <p class="f1-popover__title">
          Etapas{{ casoLabel ? ` · ${casoLabel}` : "" }}
        </p>
        <ul class="f1-popover__list">
          <li
            v-for="(etapa, index) in displayEtapas"
            :key="etapa.id"
            class="f1-popover__item"
            :class="`f1-popover__item--${bulbEstado(etapa, index)}`"
          >
            <div class="f1-popover__row">
              <span
                class="f1-popover__dot"
                :class="`f1-popover__dot--${bulbEstado(etapa, index)}`"
                aria-hidden="true"
              ></span>
              <span class="f1-popover__num">{{ index + 1 }}</span>
              <span class="f1-popover__name">{{ pipelineFriendlyMeta(etapa).titulo }}</span>
              <span class="f1-popover__status">{{ pasoCorto(etapa, index) }}</span>
            </div>
            <p v-if="metaLine(etapa, index)" class="f1-popover__meta">{{ metaLine(etapa, index) }}</p>
            <ul v-if="etapa.subPasos?.length && etapa.enCurso" class="f1-popover__sub">
              <li
                v-for="sub in etapa.subPasos"
                :key="sub.id"
                class="f1-popover__sub-item"
                :class="`f1-popover__sub-item--${sub.estado}`"
              >
                <span class="f1-popover__sub-label">{{ sub.label }}</span>
                <span class="f1-popover__sub-status">{{ pipelineSubPasoEstadoCorto(sub.estado) }}</span>
                <span v-if="subMeta(sub)" class="f1-popover__sub-meta">{{ subMeta(sub) }}</span>
              </li>
            </ul>
          </li>
        </ul>
        <p v-if="pasoDetenidoLabel" class="f1-popover__stop">
          <i class="fas fa-location-dot" aria-hidden="true"></i>
          {{ pasoDetenidoLabel }}
        </p>
        <p class="f1-popover__hint">Clic en una luz para ver el detalle de esa etapa.</p>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { PipelineEtapaDto, PipelineSubPasoDto } from "@ffa/shared";
import { computed, ref } from "vue";
import {
  formatDuracionSegundos,
  formatHoraCorta,
  pipelineBulbEstado,
  pipelineDetalleAmigable,
  pipelineEtapaMetaLine,
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
  /** Referencia de la ficha si existe; si no, el número de expediente. */
  casoLabel?: string;
  /** Si la ficha está procesándose ahora mismo, la etapa activa se muestra en azul. */
  procesando?: boolean;
}>();

defineEmits<{
  select: [etapa: PipelineEtapaDto];
}>();

const anchorRef = ref<HTMLElement | null>(null);
const popoverOpen = ref(false);
const popoverStyle = ref<Record<string, string>>({});
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const displayEtapas = computed(() =>
  props.etapas?.length ? props.etapas : pipelineEtapasPlaceholder()
);

const ariaLabel = computed(() =>
  props.casoLabel
    ? `Etapas de procesamiento de ${props.casoLabel}`
    : "Etapas de procesamiento"
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

function bulbTitle(etapa: PipelineEtapaDto, index: number): string {
  const meta = pipelineFriendlyMeta(etapa);
  const color = bulbEstado(etapa, index);
  const estado =
    color === "verde"
      ? "Completado"
      : color === "azul"
        ? "Procesando"
        : color === "rojo"
          ? "Detenido aquí"
          : "Pendiente";
  const det = etapa.detalle ? pipelineDetalleAmigable(etapa) : meta.ayuda;
  return `${meta.titulo} — ${estado}. ${det}. Clic para ver detalle.`;
}

function updatePopoverPosition(): void {
  const el = anchorRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const width = 340;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const subExtra = displayEtapas.value.some((e) => e.enCurso && e.subPasos?.length) ? 52 : 0;
  const estHeight =
    32 + displayEtapas.value.length * 38 + subExtra + (pasoDetenidoLabel.value ? 36 : 0) + 36;
  const spaceBelow = window.innerHeight - r.bottom;
  const top =
    spaceBelow >= estHeight + 8
      ? r.bottom + 6
      : Math.max(8, r.top - estHeight - 6);

  popoverStyle.value = {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    zIndex: "10050",
  };
}

function openPopover(): void {
  cancelClose();
  updatePopoverPosition();
  popoverOpen.value = true;
}

function scheduleClose(): void {
  cancelClose();
  closeTimer = setTimeout(() => {
    popoverOpen.value = false;
  }, 120);
}

function cancelClose(): void {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}
</script>

<style scoped>
.f1-wrap {
  display: inline-block;
}

.f1-lights {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  cursor: help;
}

.f1-lights__bulb {
  width: 10px;
  height: 10px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--ink-soft, #94a3b8) 75%, var(--line, #cbd5e1));
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  box-sizing: border-box;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  background: transparent;
  box-shadow: none;
}

.f1-lights__bulb:hover {
  transform: scale(1.15);
}

.f1-lights__bulb--gris {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--ink-soft, #94a3b8) 75%, var(--line, #cbd5e1));
  box-shadow: none;
}

.f1-lights__bulb--verde {
  border: none;
  background: radial-gradient(circle at 35% 30%, #86efac, #16a34a 55%, #14532d 100%);
  box-shadow:
    inset 0 -1px 2px rgba(0, 0, 0, 0.35),
    0 0 6px rgba(34, 197, 94, 0.65);
}

.f1-lights__bulb--azul {
  border: none;
  background: radial-gradient(circle at 35% 30%, #93c5fd, #2563eb 55%, #1e3a8a 100%);
  box-shadow:
    inset 0 -1px 2px rgba(0, 0, 0, 0.35),
    0 0 8px rgba(37, 99, 235, 0.75);
  animation: f1-bulb-pulse-azul 1.1s ease-in-out infinite;
}

.f1-lights__bulb--rojo {
  border: none;
  background: radial-gradient(circle at 35% 30%, #fca5a5, #dc2626 55%, #7f1d1d 100%);
  box-shadow:
    inset 0 -1px 2px rgba(0, 0, 0, 0.35),
    0 0 8px rgba(239, 68, 68, 0.75);
}

@keyframes f1-bulb-pulse-azul {
  0%,
  100% {
    box-shadow:
      inset 0 -1px 2px rgba(0, 0, 0, 0.35),
      0 0 6px rgba(37, 99, 235, 0.55);
  }
  50% {
    box-shadow:
      inset 0 -1px 2px rgba(0, 0, 0, 0.35),
      0 0 12px rgba(37, 99, 235, 0.95);
  }
}
</style>

<style>
.f1-popover {
  padding: 0.55rem 0.65rem 0.5rem;
  border-radius: 10px;
  border: 1px solid var(--line, #e2e8f0);
  background: var(--panel, #fff);
  box-shadow:
    0 12px 28px rgba(15, 23, 42, 0.14),
    0 2px 6px rgba(15, 23, 42, 0.06);
  font-size: 0.6875rem;
  line-height: 1.3;
  color: var(--ink, #0f172a);
  pointer-events: auto;
}

.f1-popover__title {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--ink, #0f172a);
}

.f1-popover__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.f1-popover__item {
  padding: 0.22rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line, #e2e8f0) 70%, transparent);
}

.f1-popover__item:last-child {
  border-bottom: none;
}

.f1-popover__row {
  display: grid;
  grid-template-columns: 0.55rem 1.1rem 1fr auto;
  align-items: center;
  gap: 0.35rem;
}

.f1-popover__meta {
  margin: 0.12rem 0 0 1.95rem;
  font-size: 0.5625rem;
  line-height: 1.35;
  color: var(--ink-soft, #64748b);
}

.f1-popover__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  justify-self: center;
}

.f1-popover__dot--verde {
  background: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.55);
}

.f1-popover__dot--azul {
  background: #2563eb;
  box-shadow: 0 0 5px rgba(37, 99, 235, 0.65);
}

.f1-popover__dot--rojo {
  background: #ef4444;
  box-shadow: 0 0 5px rgba(239, 68, 68, 0.65);
}

.f1-popover__dot--gris {
  background: transparent;
  border: 1px solid #94a3b8;
  box-sizing: border-box;
}

.f1-popover__num {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft, #64748b);
}

.f1-popover__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink, #0f172a);
}

.f1-popover__status {
  font-weight: 600;
  white-space: nowrap;
}

.f1-popover__item--verde .f1-popover__status {
  color: var(--ok, #15803d);
}

.f1-popover__item--azul .f1-popover__status {
  color: #2563eb;
}

.f1-popover__item--rojo .f1-popover__status {
  color: var(--bad, #dc2626);
}

.f1-popover__item--gris .f1-popover__status {
  color: var(--ink-soft, #64748b);
}

.f1-popover__item--azul .f1-popover__meta {
  color: #1d4ed8;
  font-weight: 500;
}

.f1-popover__stop {
  margin: 0.35rem 0 0;
  padding: 0.28rem 0.35rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--warn, #eab308) 12%, var(--panel, #fff));
  color: var(--ink, #0f172a);
  font-weight: 600;
  font-size: 0.625rem;
}

.f1-popover__stop i {
  margin-right: 0.2rem;
  color: var(--warn, #ca8a04);
}

.f1-popover__hint {
  margin: 0.35rem 0 0;
  font-size: 0.5625rem;
  color: var(--ink-faint, #94a3b8);
}

.f1-popover__sub {
  margin: 0.18rem 0 0 1.95rem;
  padding: 0.22rem 0.3rem;
  list-style: none;
  border-radius: 6px;
  background: color-mix(in srgb, var(--panel-2, #f8fafc) 80%, var(--panel, #fff));
  border: 1px dashed var(--line, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.f1-popover__sub-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.15rem 0.35rem;
  font-size: 0.5625rem;
  align-items: baseline;
}

.f1-popover__sub-label {
  font-weight: 600;
}

.f1-popover__sub-status {
  font-weight: 600;
  text-align: right;
}

.f1-popover__sub-item--listo .f1-popover__sub-status {
  color: var(--ok, #15803d);
}

.f1-popover__sub-item--en_curso .f1-popover__sub-status {
  color: #2563eb;
}

.f1-popover__sub-item--espera .f1-popover__sub-status {
  color: var(--warn, #ca8a04);
}

.f1-popover__sub-item--pendiente .f1-popover__sub-status {
  color: var(--ink-soft, #64748b);
}

.f1-popover__sub-meta {
  grid-column: 1 / -1;
  font-size: 0.5rem;
  color: var(--ink-soft, #64748b);
  line-height: 1.3;
}
</style>
