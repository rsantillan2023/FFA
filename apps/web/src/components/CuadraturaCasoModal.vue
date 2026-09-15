<template>
  <CreateFormModal
    :model-value="open"
    xl
    title="Cuadratura del balance"
    :subtitle="subtitle"
    @update:model-value="emit('update:open', $event)"
  >
    <div
      v-if="totales"
      class="cuad-modal__panel"
      :class="cuadraturaOk ? 'cuad-modal__panel--ok' : 'cuad-modal__panel--fail'"
    >
      <p class="cuad-modal__verdict">
        <i
          :class="cuadraturaOk ? 'fas fa-circle-check' : 'fas fa-circle-exclamation'"
          aria-hidden="true"
        ></i>
        <strong v-if="cuadraturaOk">Cuadra — Activo = Pasivo + Patrimonio neto</strong>
        <strong v-else>No cuadra</strong>
        <span v-if="!cuadraturaOk && diferenciaPct != null" class="cuad-modal__verdict-pct">
          ({{ formatDiferenciaCuadraturaPct(diferenciaPct) }})
        </span>
      </p>

      <!-- Pizarra: resta en un renglón -->
      <div class="cuad-modal__pizarra" role="group" aria-label="Activo menos Pasivo menos Patrimonio">
        <div class="cuad-modal__pizarra-row cuad-modal__pizarra-row--nums">
          <span class="cuad-modal__num">1</span>
          <span aria-hidden="true"></span>
          <span class="cuad-modal__num">2</span>
          <span aria-hidden="true"></span>
          <span class="cuad-modal__num">3</span>
          <span aria-hidden="true"></span>
          <span class="cuad-modal__num cuad-modal__num--result">Δ</span>
        </div>
        <div class="cuad-modal__pizarra-row cuad-modal__pizarra-row--labels">
          <span>Total Activo</span>
          <span class="cuad-modal__pizarra-op" aria-hidden="true">−</span>
          <span>Total Pasivo</span>
          <span class="cuad-modal__pizarra-op" aria-hidden="true">−</span>
          <span>Patrimonio neto</span>
          <span class="cuad-modal__pizarra-op cuad-modal__pizarra-op--eq" aria-hidden="true">=</span>
          <span>Diferencia</span>
        </div>
        <div class="cuad-modal__pizarra-row cuad-modal__pizarra-row--montos">
          <strong>{{ formatMontoConMoneda(totales.activo) }}</strong>
          <span class="cuad-modal__pizarra-op" aria-hidden="true">−</span>
          <strong>{{ formatMontoConMoneda(totales.pasivo) }}</strong>
          <span class="cuad-modal__pizarra-op" aria-hidden="true">−</span>
          <strong>{{ formatMontoConMoneda(totales.patrimonio) }}</strong>
          <span class="cuad-modal__pizarra-op cuad-modal__pizarra-op--eq" aria-hidden="true">=</span>
          <strong
            class="cuad-modal__monto-result"
            :class="cuadraturaOk ? 'cuad-modal__monto-result--ok' : 'cuad-modal__monto-result--fail'"
          >
            {{ formatMontoConMoneda(totales.diferencia) }}
          </strong>
        </div>
      </div>

      <!-- Equivalencia 1 = 2 + 3 -->
      <div class="cuad-modal__equiv-block">
        <p class="cuad-modal__equiv-title">Equivalencia contable</p>
        <div class="cuad-modal__equiv-line">
          <span class="cuad-modal__equiv-formula"><strong>1</strong> = <strong>2</strong> + <strong>3</strong></span>
          <span class="cuad-modal__equiv-arrow" aria-hidden="true">→</span>
          <span class="cuad-modal__equiv-montos">
            {{ formatMontoConMoneda(totales.activo) }}
            <span class="cuad-modal__equiv-eq">=</span>
            {{ formatMontoConMoneda(pasivoPatrimonio) }}
          </span>
        </div>
        <p v-if="!cuadraturaOk" class="cuad-modal__equiv-gap">
          Faltan o sobran
          <strong>{{ formatMontoConMoneda(Math.abs(totales.diferencia)) }}</strong>
          respecto a cuadrar.
        </p>
      </div>

      <!-- Cómo se obtiene el % -->
      <div v-if="desglosePct" class="cuad-modal__pct-block">
        <p class="cuad-modal__pct-title">Cálculo del % de desbalance (Δ Cuad.)</p>
        <p class="cuad-modal__pct-formula">
          |Activo − (Pasivo + Patrimonio)| ÷ max(|Activo|, |Pasivo + Patrimonio|) × 100
        </p>
        <div class="cuad-modal__pct-steps">
          <div class="cuad-modal__pct-step">
            <span class="cuad-modal__pct-step-label">Pasivo + Patrimonio (2 + 3)</span>
            <strong>{{ formatMontoConMoneda(pasivoPatrimonio) }}</strong>
          </div>
          <div class="cuad-modal__pct-step">
            <span class="cuad-modal__pct-step-label">Diferencia absoluta |1 − (2 + 3)|</span>
            <strong>{{ formatMontoConMoneda(desglosePct.diferenciaAbs) }}</strong>
          </div>
          <div class="cuad-modal__pct-step">
            <span class="cuad-modal__pct-step-label">Base (mayor total)</span>
            <strong>{{ formatMontoConMoneda(desglosePct.base) }}</strong>
          </div>
        </div>
        <p class="cuad-modal__pct-calc">
          {{ formatMontoCompact(desglosePct.diferenciaAbs) }}
          ÷
          {{ formatMontoCompact(desglosePct.base) }}
          × 100
          <span class="cuad-modal__pct-eq">=</span>
          <strong class="cuad-modal__pct-result">{{ formatDiferenciaCuadraturaPct(desglosePct.pct) }}</strong>
        </p>
      </div>

      <p class="cuad-modal__hint">
        Suma de líneas de detalle clasificadas (todas las páginas), excluyendo totales del PDF, flujo
        de efectivo y partidas fuera del balance. Misma lógica que revisión.
      </p>
    </div>

    <p v-else class="cuad-modal__empty">Sin datos de cuadratura para este caso.</p>

    <template #footer>
      <button class="btn btn-ghost" type="button" @click="emit('update:open', false)">Cerrar</button>
      <RouterLink
        v-if="casoId"
        :to="{ name: 'caso-revision', params: { id: casoId } }"
        class="btn btn-primary"
        @click="emit('update:open', false)"
      >
        Ir a revisión
      </RouterLink>
    </template>
  </CreateFormModal>
</template>

<script setup lang="ts">
import {
  calcularDiferenciaCuadraturaPct,
  formatDiferenciaCuadraturaPct,
  type CasoCuadraturaTotalesDto,
} from "@ffa/shared";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import CreateFormModal from "./CreateFormModal.vue";
import { formatMontoCompact } from "../utils/formatMonto";

const props = defineProps<{
  open: boolean;
  casoId?: string;
  casoNumero?: string;
  referencia?: string;
  moneda?: string;
  totales?: CasoCuadraturaTotalesDto | null;
  cuadraturaOk?: boolean;
  diferenciaPct?: number | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const subtitle = computed(() => {
  const parts = [props.casoNumero, props.referencia].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
});

const monedaCodigo = computed(() => props.moneda?.trim().toUpperCase() ?? "");

const pasivoPatrimonio = computed(() => {
  if (!props.totales) return 0;
  return props.totales.pasivo + props.totales.patrimonio;
});

const desglosePct = computed(() => {
  const t = props.totales;
  if (!t) return null;
  const pp = t.pasivo + t.patrimonio;
  const diferenciaAbs = Math.abs(t.activo - pp);
  const base = Math.max(Math.abs(t.activo), Math.abs(pp));
  const pct = calcularDiferenciaCuadraturaPct(t.activo, t.pasivo, t.patrimonio);
  return { diferenciaAbs, base, pct };
});

function formatMontoConMoneda(n: number): string {
  const monto = formatMontoCompact(n);
  return monedaCodigo.value ? `${monto} ${monedaCodigo.value}` : monto;
}
</script>

<style scoped>
.cuad-modal__panel {
  border-radius: 12px;
  border: 1px solid var(--line);
  padding: 1.1rem 1.25rem;
  background: var(--panel-2);
}

.cuad-modal__panel--ok {
  border-color: color-mix(in srgb, var(--ok) 40%, var(--line));
  background: var(--ok-bg);
}

.cuad-modal__panel--fail {
  border-color: color-mix(in srgb, var(--bad) 40%, var(--line));
  background: var(--bad-bg);
}

.cuad-modal__verdict {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.55rem;
  margin: 0 0 1rem;
  font-size: 0.95rem;
}

.cuad-modal__panel--ok .cuad-modal__verdict {
  color: var(--ok);
}

.cuad-modal__panel--fail .cuad-modal__verdict {
  color: var(--bad);
}

.cuad-modal__verdict-pct {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Pizarra — una fila horizontal */
.cuad-modal__pizarra {
  padding: 0.85rem 1rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--ink) 4%, var(--panel));
  border: 1px dashed color-mix(in srgb, var(--ink) 18%, transparent);
  overflow-x: auto;
}

.cuad-modal__pizarra-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
  align-items: center;
  gap: 0.35rem 0.5rem;
  min-width: min(100%, 780px);
}

.cuad-modal__pizarra-row--nums {
  margin-bottom: 0.25rem;
}

.cuad-modal__pizarra-row--labels {
  font-size: 0.68rem;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.2rem;
}

.cuad-modal__pizarra-row--labels span:not(.cuad-modal__pizarra-op) {
  white-space: nowrap;
}

.cuad-modal__pizarra-row--montos {
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.cuad-modal__pizarra-row--montos strong {
  white-space: nowrap;
}

.cuad-modal__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
}

.cuad-modal__num--result {
  background: var(--ink-soft);
  font-size: 0.65rem;
}

.cuad-modal__pizarra-op {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--ink-soft);
  text-align: center;
  user-select: none;
}

.cuad-modal__pizarra-op--eq {
  color: var(--ink);
}

.cuad-modal__monto-result--ok {
  color: var(--ok);
}

.cuad-modal__monto-result--fail {
  color: var(--bad);
}

.cuad-modal__equiv-block {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
}

.cuad-modal__equiv-title,
.cuad-modal__pct-title {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.cuad-modal__equiv-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.45rem 0.65rem;
  font-size: 0.9rem;
  color: var(--ink);
}

.cuad-modal__equiv-formula {
  font-variant-numeric: tabular-nums;
}

.cuad-modal__equiv-arrow {
  color: var(--ink-soft);
}

.cuad-modal__equiv-montos {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.cuad-modal__equiv-eq {
  margin: 0 0.25rem;
  color: var(--ink-soft);
  font-weight: 700;
}

.cuad-modal__equiv-gap {
  margin: 0.45rem 0 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.cuad-modal__pct-block {
  margin-top: 0.85rem;
  padding: 0.75rem 0.85rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--brand) 5%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--brand) 15%, var(--line));
}

.cuad-modal__pct-formula {
  margin: 0 0 0.65rem;
  font-size: 0.82rem;
  color: var(--ink);
  font-family: ui-monospace, "Cascadia Code", monospace;
  line-height: 1.45;
}

.cuad-modal__pct-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}

.cuad-modal__pct-step {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  background: var(--panel);
  border: 1px solid var(--line);
  font-size: 0.78rem;
}

.cuad-modal__pct-step-label {
  color: var(--ink-soft);
  line-height: 1.3;
}

.cuad-modal__pct-step strong {
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}

.cuad-modal__pct-calc {
  margin: 0;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  line-height: 1.5;
}

.cuad-modal__pct-eq {
  margin: 0 0.35rem;
  font-weight: 700;
  color: var(--ink-soft);
}

.cuad-modal__pct-result {
  font-size: 1.05rem;
  color: var(--bad);
}

.cuad-modal__panel--ok .cuad-modal__pct-result {
  color: var(--ok);
}

.cuad-modal__hint {
  margin: 0.85rem 0 0;
  font-size: 0.78rem;
  color: var(--ink-faint, var(--ink-soft));
  line-height: 1.45;
}

.cuad-modal__empty {
  margin: 0;
  color: var(--ink-soft);
}

@media (max-width: 720px) {
  .cuad-modal__pct-steps {
    grid-template-columns: 1fr;
  }

  .cuad-modal__pizarra-row {
    min-width: 680px;
  }
}
</style>
