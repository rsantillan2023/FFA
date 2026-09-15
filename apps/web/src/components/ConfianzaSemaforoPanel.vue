<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="csp-root"
      @mousedown.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <article
        ref="panelRef"
        class="csp-panel"
        :style="panelStyle"
        role="dialog"
        aria-labelledby="csp-title"
        aria-modal="true"
        tabindex="-1"
        @mousedown.stop
      >
        <header class="csp-head">
          <div class="csp-head__left">
            <SemaforoIndicator
              :value="semaforoDisplay"
              size="lg"
              :show-label="true"
            />
            <div>
              <h3 id="csp-title" class="csp-head__title">
                Confianza {{ pctDisplay }}%
                <span class="csp-head__badge">{{ nivelLabel }}</span>
              </h3>
              <p class="csp-head__sub">{{ headSubtitle }}</p>
            </div>
          </div>
          <button type="button" class="csp-close" aria-label="Cerrar" @click="emit('close')">
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </header>

        <div v-if="loading" class="csp-loading">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>Cargando desglose…</span>
        </div>

        <div v-else-if="error" class="csp-error">
          <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
          <span>{{ error }}</span>
        </div>

        <template v-else-if="resumen">
          <section class="csp-bars" aria-label="Confianza por etapa">
            <div v-for="bar in barras" :key="bar.key" class="csp-bar">
              <div class="csp-bar__label">
                <i :class="['fas', `fa-${bar.icon}`]" aria-hidden="true"></i>
                <span>{{ bar.label }}</span>
                <strong>{{ bar.pct != null ? `${bar.pct}%` : "—" }}</strong>
              </div>
              <div class="csp-bar__track" aria-hidden="true">
                <div
                  class="csp-bar__fill"
                  :class="`csp-bar__fill--${bar.tone}`"
                  :style="{ width: `${bar.pct ?? 0}%` }"
                />
              </div>
            </div>
          </section>

          <section class="csp-metrics" aria-label="Detalle del caso">
            <div
              v-for="m in metricas"
              :key="m.key"
              class="csp-metric"
              :class="m.tone ? `csp-metric--${m.tone}` : undefined"
            >
              <span class="csp-metric__icon" aria-hidden="true">
                <i :class="['fas', `fa-${m.icon}`]"></i>
              </span>
              <span class="csp-metric__val">{{ m.value }}</span>
              <span class="csp-metric__lbl">{{ m.label }}</span>
            </div>
          </section>

          <ProvenanceFallbackBanner v-if="resumen.provenance" :provenance="resumen.provenance" />

          <aside class="csp-insight" :class="`csp-insight--${insightTone}`">
            <i :class="['fas', insightIcon]" aria-hidden="true"></i>
            <div>
              <p class="csp-insight__main">{{ resumen.mensajePrincipal }}</p>
              <p v-if="resumen.mensajeSecundario" class="csp-insight__sub">
                {{ resumen.mensajeSecundario }}
              </p>
            </div>
          </aside>

        </template>
      </article>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  confianzaSemaforoLabel,
  semaforoDesdeConfianza,
  semaforoEfectivo,
  type ConfianzaResumenDto,
  type SemaforoConfianza,
} from "@ffa/shared";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { api } from "../api/client";
import ProvenanceFallbackBanner from "./ProvenanceFallbackBanner.vue";
import SemaforoIndicator from "./SemaforoIndicator.vue";
import { apiErrorMessage } from "../utils/apiError";

const props = defineProps<{
  open: boolean;
  casoId: string;
  confianzaGlobal?: number | null;
  semaforo?: string | null;
  anchorRect?: DOMRect | { top: number; left: number; bottom: number; right: number; width: number; height: number } | null;
  /** Panel fijo centrado (p. ej. modal de detalle) en lugar de anclado a celda. */
  inline?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  updated: [resumen: ConfianzaResumenDto];
}>();

const loading = ref(false);
const error = ref<string | null>(null);
const resumen = ref<ConfianzaResumenDto | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string>>({});

const pctDisplay = computed(
  () => resumen.value?.confianzaClasificacion ?? props.confianzaGlobal ?? "—"
);

const semaforoClasificacion = computed((): SemaforoConfianza | null | undefined => {
  if (resumen.value?.semaforoClasificacion) return resumen.value.semaforoClasificacion;
  return semaforoDesdeConfianza(props.confianzaGlobal) ?? null;
});

const semaforoValidacion = computed(
  () => (resumen.value?.semaforoValidacion ?? props.semaforo ?? null) as SemaforoConfianza | null
);

/** Mismo criterio que la grilla de fichas. */
const semaforoDisplay = computed(() => {
  if (resumen.value?.semaforoEfectivo) return resumen.value.semaforoEfectivo;
  return semaforoEfectivo(semaforoClasificacion.value, semaforoValidacion.value);
});

const validacionRestringe = computed(() => {
  const cls = semaforoClasificacion.value;
  const val = semaforoValidacion.value;
  return cls === "verde" && val === "rojo";
});

const validacionAdvertencia = computed(() => {
  const cls = semaforoClasificacion.value;
  const val = semaforoValidacion.value;
  return !!val && val !== "verde" && cls === "verde" && !validacionRestringe.value;
});

const nivelLabel = computed(() => {
  if (validacionRestringe.value) {
    return semaforoDisplay.value === "amarillo" ? "Revisar" : confianzaSemaforoLabel(semaforoDisplay.value ?? null);
  }
  return confianzaSemaforoLabel(semaforoDisplay.value ?? null);
});

const headSubtitle = computed(() => {
  const cls = semaforoClasificacion.value;
  const val = semaforoValidacion.value;
  const pct = pctDisplay.value;
  const fallas = resumen.value?.validacionesFallidas;
  const fallasTxt =
    fallas != null && fallas > 0 ? ` · ${fallas} validación(es) pendiente(s)` : "";

  if (validacionRestringe.value && cls && val) {
    return `Clasificación alta (${pct}%). Validación contable en rojo${fallasTxt} — semáforo amarillo hasta revisar cuadratura/controles.`;
  }
  if (validacionAdvertencia.value && val) {
    return `Clasificación alta (${pct}%). Validación contable: ${val}${fallasTxt} — el semáforo refleja la confianza %.`;
  }
  return "Promedio de clasificación al plan de cuentas";
});

type BarTone = "ok" | "warn" | "bad" | "neutral";

function barTone(pct: number | null | undefined): BarTone {
  if (pct == null) return "neutral";
  if (pct >= 85) return "ok";
  if (pct >= 50) return "warn";
  return "bad";
}

const barras = computed(() => {
  const r = resumen.value;
  if (!r) return [];
  const items: Array<{ key: string; icon: string; label: string; pct: number | null; tone: BarTone }> = [
    {
      key: "clasificacion",
      icon: "tags",
      label: "Clasificación",
      pct: r.confianzaClasificacion,
      tone: barTone(r.confianzaClasificacion),
    },
    {
      key: "extraccion",
      icon: "file-import",
      label: "Extracción (lectura)",
      pct: r.confianzaExtraccion,
      tone: barTone(r.confianzaExtraccion),
    },
  ];
  if (r.confianzaInformeExtraccion != null) {
    items.push({
      key: "informe",
      icon: "clipboard-check",
      label: "Calidad post-lectura (PDF)",
      pct: r.confianzaInformeExtraccion,
      tone: barTone(r.confianzaInformeExtraccion),
    });
  }
  return items;
});

const metricas = computed(() => {
  const r = resumen.value;
  if (!r) return [];
  return [
    { key: "total", icon: "table-list", label: "líneas leídas", value: r.totalLineas, tone: undefined },
    {
      key: "sin-rubro",
      icon: "circle-question",
      label: "sin rubro",
      value: r.lineasSinRubro,
      tone: r.lineasSinRubro > 0 ? ("warn" as const) : ("ok" as const),
    },
    {
      key: "revision",
      icon: "eye",
      label: "requieren revisión",
      value: r.lineasRequierenRevision,
      tone: r.lineasRequierenRevision > 0 ? ("warn" as const) : ("ok" as const),
    },
    {
      key: "alta",
      icon: "circle-check",
      label: "alta confianza",
      value: r.lineasAltaConfianza,
      tone: r.lineasAltaConfianza > 0 ? ("ok" as const) : undefined,
    },
    {
      key: "val-ok",
      icon: "shield-check",
      label: "validaciones OK",
      value: r.validacionesTotal ? r.validacionesOk : "—",
      tone: r.validacionesOk === r.validacionesTotal && r.validacionesTotal > 0 ? ("ok" as const) : undefined,
    },
    {
      key: "val-fail",
      icon: "shield-xmark",
      label: "validaciones fallidas",
      value: r.validacionesTotal ? r.validacionesFallidas : "—",
      tone: r.validacionesFallidas > 0 ? ("bad" as const) : undefined,
    },
  ];
});

const insightTone = computed((): BarTone => {
  const s = semaforoDisplay.value;
  if (s === "verde") return "ok";
  if (s === "amarillo") return "warn";
  if (s === "rojo") return "bad";
  return "neutral";
});

const insightIcon = computed(() => {
  const t = insightTone.value;
  if (t === "ok") return "fa-lightbulb";
  if (t === "bad") return "fa-triangle-exclamation";
  return "fa-circle-info";
});

function updatePosition(): void {
  if (props.inline) {
    panelStyle.value = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(380px, calc(100vw - 24px))",
      zIndex: "10060",
    };
    return;
  }
  const r = props.anchorRect;
  if (!r) return;
  const width = 360;
  const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12));
  const estHeight = 420;
  const spaceBelow = window.innerHeight - r.bottom;
  const top =
    spaceBelow >= estHeight + 8
      ? r.bottom + 8
      : Math.max(12, r.top - estHeight - 8);

  panelStyle.value = {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    zIndex: "10060",
  };
}

async function loadResumen(): Promise<void> {
  if (!props.casoId) return;
  loading.value = true;
  error.value = null;
  try {
    resumen.value = await api.getCasoConfianzaResumen(props.casoId);
    if (resumen.value) emit("updated", resumen.value);
  } catch (e) {
    error.value = apiErrorMessage(e, "No se pudo cargar el desglose de confianza");
    resumen.value = null;
  } finally {
    loading.value = false;
  }
}

function onWindowChange(): void {
  if (props.open) updatePosition();
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      updatePosition();
      void loadResumen();
      requestAnimationFrame(() => panelRef.value?.focus());
    }
  }
);

watch(
  () => props.anchorRect,
  () => {
    if (props.open) updatePosition();
  }
);

onMounted(() => {
  window.addEventListener("resize", onWindowChange);
  window.addEventListener("scroll", onWindowChange, true);
});

onUnmounted(() => {
  window.removeEventListener("resize", onWindowChange);
  window.removeEventListener("scroll", onWindowChange, true);
});
</script>

<style scoped>
.csp-root {
  position: fixed;
  inset: 0;
  z-index: 10055;
}

.csp-panel {
  background: var(--panel, #fff);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow:
    0 12px 40px rgba(15, 23, 42, 0.14),
    0 2px 8px rgba(15, 23, 42, 0.06);
  padding: 0.85rem 0.95rem 1rem;
  outline: none;
  max-height: min(90vh, 520px);
  overflow: auto;
}

.csp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.csp-head__left {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  min-width: 0;
}

.csp-head__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.csp-head__badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 6%, var(--panel));
  color: var(--ink-soft);
}

.csp-head__sub {
  margin: 0.15rem 0 0;
  font-size: 0.72rem;
  color: var(--ink-soft);
  line-height: 1.35;
}

.csp-close {
  flex-shrink: 0;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
}

.csp-close:hover {
  background: color-mix(in srgb, var(--ink) 6%, var(--panel));
  color: var(--ink);
}

.csp-loading,
.csp-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--ink-soft);
  padding: 0.5rem 0;
}

.csp-error {
  color: var(--bad);
}

.csp-bars {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-bottom: 0.85rem;
}

.csp-bar__label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--ink-soft);
  margin-bottom: 0.2rem;
}

.csp-bar__label i {
  width: 0.9rem;
  text-align: center;
  color: var(--brand, #2563eb);
}

.csp-bar__label strong {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.csp-bar__track {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ink) 8%, var(--line));
  overflow: hidden;
}

.csp-bar__fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.25s ease;
}

.csp-bar__fill--ok {
  background: var(--ok, #22c55e);
}

.csp-bar__fill--warn {
  background: var(--warn, #eab308);
}

.csp-bar__fill--bad {
  background: var(--bad, #ef4444);
}

.csp-bar__fill--neutral {
  background: var(--ink-faint, #94a3b8);
}

.csp-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.45rem;
  margin-bottom: 0.85rem;
}

.csp-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0.45rem 0.25rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ink) 4%, var(--panel));
  border: 1px solid var(--line);
}

.csp-metric__icon {
  font-size: 0.85rem;
  color: var(--brand, #2563eb);
  margin-bottom: 0.15rem;
}

.csp-metric--ok .csp-metric__icon {
  color: var(--ok);
}

.csp-metric--warn .csp-metric__icon {
  color: var(--warn);
}

.csp-metric--bad .csp-metric__icon {
  color: var(--bad);
}

.csp-metric__val {
  font-size: 0.95rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  line-height: 1.1;
}

.csp-metric__lbl {
  font-size: 0.58rem;
  color: var(--ink-soft);
  line-height: 1.2;
  margin-top: 0.1rem;
}

.csp-insight {
  display: flex;
  gap: 0.55rem;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  font-size: 0.75rem;
  line-height: 1.4;
}

.csp-insight--ok {
  background: color-mix(in srgb, var(--ok) 12%, var(--panel));
  color: color-mix(in srgb, var(--ok) 70%, var(--ink));
}

.csp-insight--warn {
  background: color-mix(in srgb, var(--warn) 14%, var(--panel));
  color: color-mix(in srgb, var(--warn) 75%, var(--ink));
}

.csp-insight--bad {
  background: color-mix(in srgb, var(--bad) 12%, var(--panel));
  color: color-mix(in srgb, var(--bad) 75%, var(--ink));
}

.csp-insight--neutral {
  background: color-mix(in srgb, var(--ink) 5%, var(--panel));
  color: var(--ink-soft);
}

.csp-insight__main {
  margin: 0;
  font-weight: 600;
  color: inherit;
}

.csp-insight__sub {
  margin: 0.2rem 0 0;
  opacity: 0.9;
}

</style>
