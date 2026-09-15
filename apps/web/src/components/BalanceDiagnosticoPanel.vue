<template>
  <details v-if="visible" class="balance-diag" :open="openByDefault">
    <summary class="balance-diag__summary">
      <i class="fas fa-stethoscope" aria-hidden="true"></i>
      Diagnóstico de cuadratura
      <span v-if="analisis" class="balance-diag__badge" :class="analisis.totales.cuadraturaOk ? 'balance-diag__badge--ok' : 'balance-diag__badge--fail'">
        {{ analisis.totales.cuadraturaOk ? "Cuadra" : "No cuadra" }}
      </span>
    </summary>

    <div class="balance-diag__body">
      <p v-if="loading" class="balance-diag__muted">Analizando balance…</p>
      <p v-else-if="error" class="balance-diag__error">{{ error }}</p>

      <template v-else-if="analisis">
        <section v-if="analisis.testigos.length" class="balance-diag__section">
          <h4>Testigos en el PDF (totales extraídos)</h4>
          <table class="balance-diag__table">
            <thead>
              <tr>
                <th>Pág.</th>
                <th>Total Activo</th>
                <th>Total Pasivo + Patrimonio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in analisis.testigos"
                :key="t.paginaNumero"
                :class="{ 'balance-diag__row--rec': analisis.testigoRecomendado?.paginaNumero === t.paginaNumero }"
              >
                <td>{{ t.paginaNumero }}</td>
                <td>{{ formatMonto(t.totalActivo) }}</td>
                <td>{{ formatMonto(t.totalPasivoPatrimonio) }}</td>
                <td>
                  <span v-if="analisis.testigoRecomendado?.paginaNumero === t.paginaNumero" class="balance-diag__tag">Objetivo</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="analisis.paginasBalanceObjetivo.length" class="balance-diag__hint">
            Páginas del balance objetivo: {{ analisis.paginasBalanceObjetivo.join(", ") }}
          </p>
        </section>

        <section class="balance-diag__section">
          <h4>Proceso vs testigo</h4>
          <dl class="balance-diag__dl">
            <div>
              <dt>Activo (proceso)</dt>
              <dd>{{ formatMonto(analisis.totales.activo) }}</dd>
            </div>
            <div>
              <dt>Pasivo + Patrimonio</dt>
              <dd>{{ formatMonto(analisis.totales.pasivo + analisis.totales.patrimonio) }}</dd>
            </div>
            <div v-if="analisis.testigoRecomendado">
              <dt>Testigo activo (PDF)</dt>
              <dd>{{ formatMonto(analisis.testigoRecomendado.totalActivo) }}</dd>
            </div>
            <div>
              <dt>Diferencia ecuación</dt>
              <dd :class="analisis.totales.cuadraturaOk ? 'balance-diag__ok' : 'balance-diag__fail'">
                {{ formatMonto(analisis.totales.diferencia) }}
                <span v-if="!analisis.totales.cuadraturaOk" class="balance-diag__pct">
                  ({{ formatDiferenciaPct(analisis.totales) }})
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section class="balance-diag__section">
          <h4>Conteos</h4>
          <ul class="balance-diag__counts">
            <li><strong>{{ analisis.conteos.detalle ?? 0 }}</strong> líneas de detalle en cuadratura</li>
            <li v-if="analisis.paresEscala"><strong>{{ analisis.paresEscala }}</strong> pares escala ×1000 detectados</li>
            <li v-if="analisis.activoIncompleto" class="balance-diag__warn-li">
              <strong>Activo incompleto:</strong>
              solo {{ analisis.ratioActivoVsTestigo ?? "?" }}% del total activo del PDF está en cuadratura
              — faltan filas de detalle en la extracción
            </li>
            <li v-if="analisis.patrimonioMalEnPasivo">
              <strong>{{ formatMonto(analisis.patrimonioMalEnPasivo) }}</strong> patrimonio mal clasificado en pasivo
            </li>
          </ul>
        </section>

        <section v-if="analisis.diagnosticoIa" class="balance-diag__section balance-diag__ia">
          <h4><i class="fas fa-robot" aria-hidden="true"></i> Diagnóstico IA</h4>
          <p class="balance-diag__ia-resumen">{{ analisis.diagnosticoIa.resumen }}</p>
          <ul v-if="analisis.diagnosticoIa.causasProbables.length" class="balance-diag__counts">
            <li v-for="(c, i) in analisis.diagnosticoIa.causasProbables" :key="'c'+i">{{ c }}</li>
          </ul>
          <ul v-if="analisis.diagnosticoIa.accionesSugeridas.length" class="balance-diag__counts balance-diag__ia-acciones">
            <li v-for="(a, i) in analisis.diagnosticoIa.accionesSugeridas" :key="'a'+i"><strong>Sugerencia:</strong> {{ a }}</li>
          </ul>
        </section>

        <div v-if="editable && !analisis.totales.cuadraturaOk" class="balance-diag__actions">
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="reconciliando"
            @click="$emit('reconciliar')"
          >
            <i class="fas fa-scale-balanced" aria-hidden="true"></i>
            {{ reconciliando ? "Reconciliando…" : "Reconciliar balance" }}
          </button>
          <p class="balance-diag__hint">
            Reclasifica activo/pasivo/patrimonio mal ubicados, restaura líneas excluidas por error y marca duplicados ×1000.
            Los ajustes sintéticos (1.9 / 3.9) solo se crean si lo solicitás explícitamente al reconciliar.
          </p>
        </div>
        <p v-if="mensaje" class="balance-diag__msg">{{ mensaje }}</p>
      </template>

      <button v-if="!loading && !analisis" class="btn btn-ghost btn-sm" type="button" @click="$emit('analizar')">
        Analizar cuadratura
      </button>
    </div>
  </details>
</template>

<script setup lang="ts">
import type { BalanceAnalisisDto } from "@ffa/shared";
import {
  calcularDiferenciaCuadraturaPct,
  formatDiferenciaCuadraturaPct,
} from "../utils/balanceTotales";

defineProps<{
  visible?: boolean;
  openByDefault?: boolean;
  loading?: boolean;
  reconciliando?: boolean;
  error?: string | null;
  mensaje?: string | null;
  analisis?: BalanceAnalisisDto | null;
  editable?: boolean;
  moneda?: string;
}>();

defineEmits<{
  analizar: [];
  reconciliar: [];
}>();

function formatMonto(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function formatDiferenciaPct(totales: BalanceAnalisisDto["totales"]): string {
  return formatDiferenciaCuadraturaPct(
    calcularDiferenciaCuadraturaPct(totales.activo, totales.pasivo, totales.patrimonio)
  );
}
</script>

<style scoped>
.balance-diag {
  margin: 0 0 1rem;
  border: 1px solid var(--border-subtle, #e2e8f0);
  border-radius: 8px;
  background: var(--surface-raised, #f8fafc);
}

.balance-diag__summary {
  cursor: pointer;
  padding: 0.65rem 1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  list-style: none;
}

.balance-diag__summary::-webkit-details-marker {
  display: none;
}

.balance-diag__badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.balance-diag__badge--ok {
  background: #dcfce7;
  color: #166534;
}

.balance-diag__badge--fail {
  background: #fee2e2;
  color: #991b1b;
}

.balance-diag__body {
  padding: 0 1rem 1rem;
}

.balance-diag__section {
  margin-top: 0.75rem;
}

.balance-diag__section h4 {
  margin: 0 0 0.35rem;
  font-size: 0.85rem;
  color: var(--text-muted, #64748b);
}

.balance-diag__table {
  width: 100%;
  font-size: 0.85rem;
  border-collapse: collapse;
}

.balance-diag__table th,
.balance-diag__table td {
  text-align: left;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--border-subtle, #e2e8f0);
}

.balance-diag__row--rec {
  background: #eff6ff;
}

.balance-diag__tag {
  font-size: 0.7rem;
  background: #dbeafe;
  color: #1e40af;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.balance-diag__dl {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.5rem;
  margin: 0;
  font-size: 0.85rem;
}

.balance-diag__dl dt {
  color: var(--text-muted, #64748b);
  font-size: 0.75rem;
}

.balance-diag__dl dd {
  margin: 0;
  font-weight: 600;
}

.balance-diag__counts {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.85rem;
}

.balance-diag__actions {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.balance-diag__hint,
.balance-diag__muted {
  font-size: 0.8rem;
  color: var(--text-muted, #64748b);
  margin: 0.35rem 0 0;
}

.balance-diag__error {
  color: #b91c1c;
  font-size: 0.85rem;
}

.balance-diag__msg {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #166534;
}

.balance-diag__ok {
  color: #166534;
}

.balance-diag__fail {
  color: #b91c1c;
}

.balance-diag__pct {
  font-weight: 600;
  color: var(--ink-soft, #64748b);
}

.balance-diag__ia {
  border-top: 1px dashed var(--border-subtle, #e2e8f0);
  padding-top: 0.75rem;
}

.balance-diag__ia-resumen {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
}

.balance-diag__ia-acciones {
  color: #1e40af;
}
</style>
