<template>
  <div class="informe-view">
    <div v-if="loading">Cargando…</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>
    <div v-else>
    <PageHeader
      page-key="informe"
      :subtitle="informe ? `Estado: ${informe.estado} · Ficha v${informe.fichaVersion}` : undefined"
      :back-link="{ to: `/casos/${casoId}/revision`, label: '← Revisión del caso' }"
    >
      <template #actions>
        <button
          v-if="!informe"
          class="btn btn-primary"
          type="button"
          :disabled="generando"
          @click="generar"
        >
          {{ generando ? "Generando con IA…" : "Generar informe" }}
        </button>
        <button
          v-if="informe"
          class="btn btn-ghost"
          type="button"
          :disabled="openingHtml"
          @click="verHtml"
        >
          {{ openingHtml ? "Abriendo…" : "Ver HTML" }}
        </button>
        <button
          v-if="informe"
          class="btn btn-ghost"
          type="button"
          :disabled="exportingDocx"
          @click="exportarWord"
        >
          {{ exportingDocx ? "Exportando…" : informe.tieneDocx ? "Regenerar Word" : "Generar Word" }}
        </button>
        <button
          v-if="informe?.tieneDocx"
          class="btn btn-ghost"
          type="button"
          :disabled="openingDocx"
          @click="abrirWord"
        >
          {{ openingDocx ? "Descargando…" : "Descargar .docx" }}
        </button>
        <button
          v-if="informe && informe.estado !== 'final'"
          class="btn btn-primary"
          type="button"
          @click="finalizar"
        >
          Marcar final
        </button>
      </template>
    </PageHeader>

    <div v-if="ficha?.cierreParcial" class="card cierre-parcial-banner" role="note">
      <h3><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Cierre parcial</h3>
      <p v-if="ficha.motivoCierreParcial">{{ ficha.motivoCierreParcial }}</p>
      <p v-else>Esta ficha se cerró con observaciones. El informe puede reflejar cuadratura o líneas pendientes.</p>
    </div>

    <div v-if="ficha" class="card ficha-resumen">
      <div class="ficha-resumen__head">
        <h3>
          <i class="fas fa-file-circle-check" aria-hidden="true"></i>
          {{ ficha.cierreParcial ? "Ficha cerrada con observaciones" : "Ficha aprobada" }}
        </h3>
        <span v-if="ficha.validacionesResumen?.semaforo" class="ficha-resumen__meta">
          <SemaforoIndicator :value="ficha.validacionesResumen.semaforo" />
        </span>
      </div>
      <div class="ficha-kpis">
        <article class="ficha-kpi">
          <span class="ficha-kpi__label">Activo corriente</span>
          <strong class="ficha-kpi__val">{{ formatN(ficha.balance?.activoCorriente) }}</strong>
        </article>
        <article class="ficha-kpi">
          <span class="ficha-kpi__label">Pasivo corriente</span>
          <strong class="ficha-kpi__val">{{ formatN(ficha.balance?.pasivoCorriente) }}</strong>
        </article>
        <article class="ficha-kpi">
          <span class="ficha-kpi__label">Patrimonio</span>
          <strong class="ficha-kpi__val">{{ formatN(ficha.balance?.patrimonio) }}</strong>
        </article>
        <article class="ficha-kpi">
          <span class="ficha-kpi__label">Utilidad ejercicio</span>
          <strong class="ficha-kpi__val">{{ formatN(ficha.estadoResultados?.utilidad) }}</strong>
        </article>
      </div>
      <p class="ficha-resumen__hint">Montos en miles CLP (escala del caso). Versión {{ ficha.version }}.</p>

      <div v-if="indicadores.length" class="ficha-indicadores">
        <h4>Indicadores financieros</h4>
        <ul class="ficha-indicadores__list">
          <li v-for="i in indicadores" :key="i.id">
            <span>{{ indicadorLabel(i.codigo) }}</span>
            <strong>{{ i.calculable ? formatIndicador(i.codigo, i.valor) : `N/C (${i.error})` }}</strong>
          </li>
        </ul>
      </div>
      <p v-else class="ficha-resumen__hint">Sin indicadores — recalcule tras aprobar la ficha.</p>
    </div>

    <div v-if="informe && previewUrl" class="card preview-card">
      <div class="preview-header">
        <h3>Vista previa del informe</h3>
        <button class="btn btn-ghost btn-sm" type="button" @click="verHtml">Abrir en pestaña nueva</button>
      </div>
      <iframe :src="previewUrl" class="informe-preview" title="Vista previa informe HTML" />
    </div>

    <div v-if="informe" class="card form">
      <h3>Apartados manuales (J.22)</h3>
      <p class="hint">Los campos marcados con * son obligatorios para marcar el informe como final.</p>
      <label class="label">Análisis del analista *</label>
      <textarea
        v-model="apartados.apartado_analisis"
        class="input"
        rows="4"
        :class="{ 'input--invalid': apartadoInvalido('apartado_analisis') }"
      />
      <label class="label">Recomendación comité *</label>
      <textarea
        v-model="apartados.apartado_recomendacion"
        class="input"
        rows="3"
        :class="{ 'input--invalid': apartadoInvalido('apartado_recomendacion') }"
      />
      <button class="btn btn-primary" type="button" @click="guardarApartados">Guardar borrador</button>
      <p v-if="msg" class="success-msg">{{ msg }}</p>
      <p v-if="err" class="error-msg">{{ err }}</p>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FichaCanonicaDto, IndicadorCalculadoDto, InformeComiteDto } from "@ffa/shared";
import { onMounted, onUnmounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api/client";
import { apiErrorMessage } from "../utils/apiError";
import PageHeader from "../components/PageHeader.vue";
import SemaforoIndicator from "../components/SemaforoIndicator.vue";

const INDICADOR_LABELS: Record<string, string> = {
  LIQ_CORRIENTE: "Liquidez corriente",
  END_TOTAL: "Endeudamiento total",
  MARGEN_BRUTO: "Margen bruto aprox.",
  CAP_TRABAJO: "Capital de trabajo",
  COBERTURA_PAT: "Cobertura patrimonial",
};

const route = useRoute();
const casoId = route.params.id as string;

const loading = ref(true);
const error = ref<string | null>(null);
const ficha = ref<FichaCanonicaDto | null>(null);
const indicadores = ref<IndicadorCalculadoDto[]>([]);
const informe = ref<InformeComiteDto | null>(null);
const apartados = reactive({ apartado_analisis: "", apartado_recomendacion: "" });
const msg = ref("");
const err = ref("");
const exportingDocx = ref(false);
const openingHtml = ref(false);
const openingDocx = ref(false);
const validarApartados = ref(false);
const previewUrl = ref<string | null>(null);
const generando = ref(false);
let isMounted = false;
let previewObjectUrl: string | null = null;

function revokePreviewUrl(): void {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  previewUrl.value = null;
}

async function loadPreview(): Promise<void> {
  revokePreviewUrl();
  if (!informe.value) return;
  try {
    const url = await api.fetchInformeHtmlBlobUrl(informe.value.id);
    if (!isMounted) {
      URL.revokeObjectURL(url);
      return;
    }
    previewObjectUrl = url;
    previewUrl.value = url;
  } catch {
    revokePreviewUrl();
  }
}

function apartadoInvalido(key: keyof typeof apartados): boolean {
  return validarApartados.value && !apartados[key]?.trim();
}

function formatN(n?: number | null): string {
  return n != null && !Number.isNaN(n) ? n.toLocaleString("es-CL") : "—";
}

function indicadorLabel(codigo: string): string {
  return INDICADOR_LABELS[codigo] ?? codigo;
}

function formatIndicador(codigo: string, valor: number | null): string {
  if (valor == null) return "—";
  if (codigo === "END_TOTAL" || codigo === "MARGEN_BRUTO") {
    return `${(valor * 100).toFixed(1)}%`;
  }
  if (codigo === "CAP_TRABAJO") return formatN(valor);
  return `${valor.toFixed(2)}×`;
}

async function load(): Promise<void> {
  ficha.value = await api.getFichaByCaso(casoId);
  indicadores.value = await api.getFichaIndicadores(ficha.value.id);
  try {
    informe.value = await api.getInformeByCaso(casoId);
    apartados.apartado_analisis = informe.value.apartadosManuales.apartado_analisis ?? "";
    apartados.apartado_recomendacion = informe.value.apartadosManuales.apartado_recomendacion ?? "";
    await loadPreview();
  } catch {
    informe.value = null;
    revokePreviewUrl();
  }
}

async function generar(): Promise<void> {
  if (!ficha.value) return;
  err.value = "";
  msg.value = "";
  generando.value = true;
  try {
    informe.value = await api.generarInforme(ficha.value.id);
    apartados.apartado_analisis = informe.value.apartadosManuales.apartado_analisis ?? "";
    apartados.apartado_recomendacion =
      informe.value.apartadosManuales.apartado_recomendacion ?? "";
    await loadPreview();
    msg.value =
      "Informe preliminar generado con IA (Anthropic). Revisá análisis y recomendación antes de marcar final.";
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo generar el informe");
  } finally {
    generando.value = false;
  }
}

async function guardarApartados(): Promise<void> {
  if (!informe.value) return;
  err.value = "";
  try {
    informe.value = await api.patchInformeApartados(informe.value.id, { ...apartados });
    msg.value = "Borrador guardado";
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo guardar el borrador");
    throw e;
  }
}

async function verHtml(): Promise<void> {
  if (!informe.value) return;
  openingHtml.value = true;
  err.value = "";
  try {
    await api.openInformeHtml(informe.value.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "No se pudo abrir el HTML";
  } finally {
    openingHtml.value = false;
  }
}

async function exportarWord(): Promise<void> {
  if (!informe.value) return;
  exportingDocx.value = true;
  err.value = "";
  try {
    await api.exportInformeDocx(informe.value.id);
    informe.value = { ...informe.value, tieneDocx: true };
    msg.value = "Word generado — use Descargar .docx";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Error al exportar";
  } finally {
    exportingDocx.value = false;
  }
}

async function abrirWord(): Promise<void> {
  if (!informe.value) return;
  openingDocx.value = true;
  err.value = "";
  try {
    await api.openInformeDocx(informe.value.id);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "No se pudo descargar el Word";
  } finally {
    openingDocx.value = false;
  }
}

async function finalizar(): Promise<void> {
  if (!informe.value) return;
  err.value = "";
  msg.value = "";
  validarApartados.value = true;

  const faltantes: string[] = [];
  if (!apartados.apartado_analisis.trim()) faltantes.push("Análisis del analista");
  if (!apartados.apartado_recomendacion.trim()) faltantes.push("Recomendación comité");
  if (faltantes.length > 0) {
    err.value = `Complete los apartados obligatorios: ${faltantes.join(", ")}`;
    return;
  }

  try {
    await guardarApartados();
    informe.value = await api.finalizarInforme(informe.value.id);
    validarApartados.value = false;
    msg.value = "Informe marcado como final";
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Error";
  }
}

onMounted(async () => {
  isMounted = true;
  try {
    await load();
    if (!isMounted) return;
  } catch (e) {
    if (!isMounted) return;
    error.value = e instanceof Error ? e.message : "Error";
  } finally {
    if (isMounted) loading.value = false;
  }
});

onUnmounted(() => {
  isMounted = false;
  revokePreviewUrl();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
  gap: 1rem;
}

.back {
  color: var(--brand);
  text-decoration: none;
  font-size: 0.875rem;
}

.cierre-parcial-banner {
  margin-bottom: 1rem;
  padding: 1rem 1.15rem;
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line));
  background: color-mix(in srgb, var(--warn) 10%, var(--panel));
}

.cierre-parcial-banner h3 {
  margin: 0 0 0.45rem;
  font-size: 0.95rem;
  color: #92400e;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.cierre-parcial-banner p {
  margin: 0;
  font-size: 0.85rem;
  color: #78350f;
  line-height: 1.45;
}

.ficha-resumen {
  margin-bottom: 1rem;
}

.ficha-resumen__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.ficha-resumen__head h3 {
  margin: 0;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--brand-ink);
}

.ficha-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.65rem;
}

.ficha-kpi {
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-soft) 25%, var(--panel));
}

.ficha-kpi__label {
  display: block;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
  margin-bottom: 0.2rem;
}

.ficha-kpi__val {
  font-size: 1.05rem;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.ficha-resumen__hint {
  margin: 0.65rem 0 0;
  font-size: 0.75rem;
  color: var(--ink-faint);
}

.ficha-indicadores {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--line);
}

.ficha-indicadores h4 {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.ficha-indicadores__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.35rem 1rem;
}

.ficha-indicadores__list li {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.82rem;
  padding: 0.35rem 0;
}

.ficha-indicadores__list span {
  color: var(--ink-soft);
}

.ficha-indicadores__list strong {
  font-variant-numeric: tabular-nums;
  color: var(--brand-ink);
}

.form {
  margin-top: 1rem;
}

.hint {
  margin: 0 0 0.75rem;
  color: var(--muted, #64748b);
  font-size: 0.875rem;
}

.input--invalid {
  border-color: var(--danger, #dc2626);
}

.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.actions a.btn {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.preview-card {
  margin-bottom: 1rem;
  padding: 0;
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.preview-header h3 {
  margin: 0;
}

.informe-preview {
  display: block;
  width: 100%;
  min-height: 520px;
  height: 62vh;
  border: 0;
  background: #eef2f6;
}
</style>
