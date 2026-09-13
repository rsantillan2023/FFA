<template>
  <div class="lines-grid">
    <div class="lines-grid__head" role="row">
      <span class="lines-grid__cell lines-grid__cell--icon" role="columnheader" aria-label="Indicador"></span>
      <span class="lines-grid__cell lines-grid__cell--concepto" role="columnheader">Concepto</span>
      <span class="lines-grid__cell lines-grid__cell--pag" role="columnheader">Pág.</span>
      <span class="lines-grid__cell lines-grid__cell--conf" role="columnheader">Conf.</span>
      <span class="lines-grid__cell lines-grid__cell--estado" role="columnheader">Estado</span>
      <span class="lines-grid__cell lines-grid__cell--monto" role="columnheader">
        Monto<span v-if="monedaCodigo"> ({{ monedaCodigo }})</span>
      </span>
      <span class="lines-grid__cell lines-grid__cell--rubro" role="columnheader">Rubro</span>
      <span class="lines-grid__cell lines-grid__cell--actions" role="columnheader">Acciones</span>
    </div>

    <ul class="lines-grid__body" role="rowgroup">
      <li
        v-for="l in lineas"
        :key="l.id"
        class="lines-grid__row"
        role="row"
        :class="{
          'lines-grid__row--pending': esPendiente(l),
          'lines-grid__row--no-rubro': esPendiente(l) && !rubroEnDraft(l) && !lineaTieneRubro(l),
          'lines-grid__row--ok': !esPendiente(l),
        }"
      >
        <span class="lines-grid__cell lines-grid__cell--icon" role="cell">
          <span class="line-status-icon" aria-hidden="true">
            <i :class="lineStatusIcon(l)"></i>
          </span>
        </span>

        <div class="lines-grid__cell lines-grid__cell--concepto" role="cell">
          <span class="line-concepto__title" :title="l.denominacionOriginal">{{ l.denominacionOriginal }}</span>
          <div v-if="mostrarEditorInline(l)" class="line-concepto__sugerencias">
            <button
              v-for="c in l.candidatosAsistidos?.slice(0, 3) ?? []"
              :key="c.rubroInstitucionalId"
              type="button"
              class="line-concepto__sug-btn"
              :class="{ 'line-concepto__sug-btn--active': draft(l).rubroId === c.rubroInstitucionalId }"
              @click="setRubro(l.id, c.rubroInstitucionalId)"
            >
              {{ c.codigo }} {{ c.score }}%
            </button>
          </div>
          <div
            v-if="mostrarEditorInline(l) && iaSugerencias[l.id]"
            class="line-concepto__ia-panel"
          >
            <div class="line-concepto__ia-head">
              <strong>{{ iaSugerencias[l.id]!.rubroCodigo }} — {{ iaSugerencias[l.id]!.rubroNombre }}</strong>
              <span class="line-concepto__ia-conf">{{ iaSugerencias[l.id]!.confianza }}%</span>
            </div>
            <p class="line-concepto__ia-razon">{{ iaSugerencias[l.id]!.razonamiento }}</p>
            <div class="line-concepto__ia-actions">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="Boolean(iaAplicando[l.id])"
                @click="aplicarSugerenciaIa(l)"
              >
                {{ iaAplicando[l.id] ? "Aplicando…" : "Aplicar" }}
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="cerrarSugerenciaIa(l.id)"
              >
                Cerrar
              </button>
            </div>
          </div>
          <p v-if="iaErrores[l.id]" class="line-concepto__ia-error">{{ iaErrores[l.id] }}</p>
        </div>

        <div class="lines-grid__cell lines-grid__cell--pag" role="cell">
          <span class="line-pag__value">{{ l.paginaNumero }}</span>
        </div>

        <div class="lines-grid__cell lines-grid__cell--conf" role="cell">
          <span class="line-conf__value">{{ confianzaDisplay(l) }}</span>
        </div>

        <div class="lines-grid__cell lines-grid__cell--estado" role="cell">
          <span v-if="showEstado" class="line-estado__badge" :class="estadoLineaClass(l)">
            {{ estadoLineaLabel(l) }}
          </span>
          <span v-else-if="esPendiente(l)" class="line-estado__badge line-estado__badge--pending">Pendiente</span>
          <span v-else class="line-estado__badge line-estado__badge--ok">OK</span>
        </div>

        <div class="lines-grid__cell lines-grid__cell--monto" role="cell">
          <input
            v-if="mostrarEditorInline(l)"
            :value="montoInputDisplay(l)"
            class="lines-grid__input lines-grid__input--monto"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            aria-label="Monto"
            @click.stop
            @focus="onMontoFocus(l.id)"
            @blur="onMontoBlur(l)"
            @input="onMontoInput(l, $event)"
          />
          <span v-else class="lines-grid__readonly-monto">
            {{ formatMontoConMoneda(l.montoNormalizado ?? l.montoOriginal) }}
          </span>
        </div>

        <div class="lines-grid__cell lines-grid__cell--rubro" role="cell">
          <select
            v-if="mostrarEditorInline(l)"
            v-model="draft(l).rubroId"
            class="lines-grid__select"
            :class="{ 'lines-grid__select--error': !rubroEnDraft(l) }"
            aria-label="Rubro"
            @click.stop
            @change="onRubroChange(l)"
          >
            <option value="">— Elegir rubro —</option>
            <option v-for="r in rubros" :key="r.id" :value="r.id">
              {{ r.codigo }} — {{ r.nombre }}
            </option>
          </select>
          <span v-else-if="l.rubroCodigo" class="lines-grid__rubro-tag" :title="l.rubroNombre">
            {{ l.rubroCodigo }}
          </span>
          <span v-else class="lines-grid__rubro-empty">—</span>
        </div>

        <div class="lines-grid__cell lines-grid__cell--actions" role="cell">
          <button
            class="btn btn-ghost btn-sm btn-icon"
            type="button"
            title="Ver en PDF"
            @click.stop="emit('verDocumento', l)"
          >
            <i class="fas fa-file-alt" aria-hidden="true"></i>
          </button>
          <button
            v-if="mostrarEditorInline(l) && casoId"
            class="btn btn-sm btn-icon line-action-ia"
            type="button"
            :class="{ 'line-action-ia--active': Boolean(iaSugerencias[l.id]) }"
            :disabled="Boolean(iaLoading[l.id])"
            :title="iaLoading[l.id] ? 'Consultando IA…' : 'Sugerir rubro con IA'"
            @click.stop="solicitarSugerenciaIa(l)"
          >
            <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
          </button>
          <template v-if="mostrarEditorInline(l)">
            <button
              class="btn btn-primary btn-sm btn-icon"
              type="button"
              :disabled="!rubroEnDraft(l) || !draftDirty(l)"
              title="Guardar cambios"
              @click.stop="emitGuardar(l)"
            >
              <i class="fas fa-save" aria-hidden="true"></i>
            </button>
            <button
              v-if="esPendiente(l)"
              class="btn btn-sm btn-icon line-action-approve"
              type="button"
              :disabled="!puedeAprobar(l)"
              :title="aprobarTitle(l)"
              @click.stop="emitAprobar(l)"
            >
              <i class="fas fa-check" aria-hidden="true"></i>
            </button>
          </template>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { LineaContableDto, RubroOptionDto, SugerenciaClasificacionIaDto } from "@ffa/shared";
import { computed, inject, onUnmounted, reactive, ref, watch } from "vue";
import { api } from "../api/client";
import type { LineaDraftOverride } from "../utils/balanceTotales";
import { apiErrorMessage } from "../utils/apiError";
import { formatMonto, parseMontoInput } from "../utils/formatMonto";

type RegisterLineDraft = (lineaId: string, override: LineaDraftOverride | null) => void;

type LineDraft = {
  denominacion: string;
  monto: number;
  rubroId: string;
};

const props = defineProps<{
  lineas: LineaContableDto[];
  rubros?: RubroOptionDto[];
  casoId?: string;
  editable?: boolean;
  /** Permite editar rubros/montos en líneas ya aprobadas (p. ej. corregir cuadratura). */
  editarAprobadas?: boolean;
  showEstado?: boolean;
  /** Código ISO 4217 del expediente (p. ej. ARS). */
  moneda?: string;
}>();

const monedaCodigo = computed(() => props.moneda?.trim().toUpperCase() ?? "");

function formatMontoConMoneda(n: number | null | undefined): string {
  const monto = formatMonto(n);
  if (monto === "—") return monto;
  return monedaCodigo.value ? `${monedaCodigo.value} ${monto}` : monto;
}

const emit = defineEmits<{
  guardar: [lineaId: string, data: Record<string, unknown>];
  aprobar: [lineaId: string];
  verDocumento: [linea: LineaContableDto];
  iaAplicada: [];
}>();

const drafts = reactive<Record<string, LineDraft>>({});
const montoEditando = reactive<Record<string, string>>({});
const montoFocused = ref<Set<string>>(new Set());
const iaLoading = reactive<Record<string, boolean>>({});
const iaSugerencias = reactive<Record<string, SugerenciaClasificacionIaDto | undefined>>({});
const iaErrores = reactive<Record<string, string>>({});
const registerLineDraft = inject<RegisterLineDraft | null>("revisionDraftRegister", null);

function esPendiente(l: LineaContableDto): boolean {
  return l.requiereRevision && l.estado !== "aprobada";
}

function rubroAsignado(l: LineaContableDto): boolean {
  return Boolean(l.rubroInstitucionalId || l.rubroCodigo);
}

function estadoLineaLabel(l: LineaContableDto): string {
  if (!esPendiente(l)) return "OK";
  if (!rubroAsignado(l)) return "Falta info";
  return "Pendiente aprobar";
}

function estadoLineaClass(l: LineaContableDto): string {
  if (!esPendiente(l)) return "line-estado__badge--ok";
  if (!rubroAsignado(l)) return "line-estado__badge--critical";
  return "line-estado__badge--pending";
}

function mostrarEditorInline(l: LineaContableDto): boolean {
  if (!props.editable) return false;
  return esPendiente(l) || Boolean(props.editarAprobadas);
}

function initDraft(l: LineaContableDto): LineDraft {
  return {
    denominacion: l.denominacionOriginal,
    monto: l.montoNormalizado ?? l.montoOriginal,
    rubroId: l.rubroInstitucionalId ?? "",
  };
}

function draft(l: LineaContableDto): LineDraft {
  if (!drafts[l.id]) {
    drafts[l.id] = initDraft(l);
  }
  return drafts[l.id];
}

function setRubro(lineaId: string, rubroId: string): void {
  const linea = props.lineas.find((l) => l.id === lineaId);
  if (!linea) return;
  draft(linea).rubroId = rubroId;
  pushDraftOverride(linea);
}

async function solicitarSugerenciaIa(l: LineaContableDto): Promise<void> {
  if (!props.casoId || iaLoading[l.id]) return;
  iaLoading[l.id] = true;
  delete iaErrores[l.id];
  delete iaSugerencias[l.id];
  try {
    iaSugerencias[l.id] = await api.sugerirClasificacionIa(props.casoId, l.id);
  } catch (e) {
    iaErrores[l.id] = apiErrorMessage(e, "No se pudo obtener sugerencia IA");
  } finally {
    iaLoading[l.id] = false;
  }
}

const iaAplicando = reactive<Record<string, boolean>>({});

async function aplicarSugerenciaIa(l: LineaContableDto): Promise<void> {
  if (!props.casoId || iaAplicando[l.id]) return;
  iaAplicando[l.id] = true;
  delete iaErrores[l.id];
  try {
    await api.aplicarClasificacionIa(props.casoId, l.id);
    cerrarSugerenciaIa(l.id);
    emit("iaAplicada");
  } catch (e) {
    iaErrores[l.id] = apiErrorMessage(e, "No se pudo aplicar la sugerencia IA");
  } finally {
    iaAplicando[l.id] = false;
  }
}

function cerrarSugerenciaIa(lineaId: string): void {
  delete iaSugerencias[lineaId];
  delete iaErrores[lineaId];
}

watch(
  () => props.lineas,
  (list) => {
    for (const l of list) {
      const prev = drafts[l.id];
      if (!prev) {
        drafts[l.id] = initDraft(l);
        continue;
      }
      if (!draftDirty(l)) {
        drafts[l.id] = initDraft(l);
        registerLineDraft?.(l.id, null);
      }
    }
  },
  { deep: true, immediate: true }
);

const montoOverrideTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function pushDraftOverride(l: LineaContableDto): void {
  if (!registerLineDraft) return;
  if (mostrarEditorInline(l) && draftDirty(l)) {
    const d = draft(l);
    registerLineDraft(l.id, {
      rubroInstitucionalId: d.rubroId || undefined,
      montoNormalizado: d.monto,
    });
  } else {
    registerLineDraft(l.id, null);
  }
}

function scheduleMontoOverride(l: LineaContableDto): void {
  if (montoOverrideTimers[l.id]) clearTimeout(montoOverrideTimers[l.id]);
  montoOverrideTimers[l.id] = setTimeout(() => {
    delete montoOverrideTimers[l.id];
    pushDraftOverride(l);
  }, 350);
}

function onRubroChange(l: LineaContableDto): void {
  pushDraftOverride(l);
}

onUnmounted(() => {
  for (const id of Object.keys(montoOverrideTimers)) {
    clearTimeout(montoOverrideTimers[id]);
  }
});

function montoInputDisplay(l: LineaContableDto): string {
  if (montoFocused.value.has(l.id)) {
    return montoEditando.value[l.id] ?? String(draft(l).monto);
  }
  return formatMonto(draft(l).monto);
}

function onMontoFocus(lineaId: string): void {
  montoFocused.value = new Set(montoFocused.value).add(lineaId);
  const d = drafts[lineaId];
  if (d && montoEditando.value[lineaId] == null) {
    montoEditando.value[lineaId] = String(d.monto);
  }
}

function onMontoInput(l: LineaContableDto, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  montoEditando.value[l.id] = raw;
  const parsed = parseMontoInput(raw);
  if (parsed != null) {
    draft(l).monto = parsed;
    scheduleMontoOverride(l);
  }
}

function onMontoBlur(l: LineaContableDto): void {
  if (montoOverrideTimers[l.id]) {
    clearTimeout(montoOverrideTimers[l.id]);
    delete montoOverrideTimers[l.id];
  }
  const parsed = parseMontoInput(montoEditando.value[l.id] ?? "");
  if (parsed != null) {
    draft(l).monto = parsed;
  }
  pushDraftOverride(l);
  const next = new Set(montoFocused.value);
  next.delete(l.id);
  montoFocused.value = next;
  delete montoEditando.value[l.id];
}

function rubroEnDraft(l: LineaContableDto): boolean {
  return Boolean(draft(l).rubroId);
}

function draftDirty(l: LineaContableDto): boolean {
  const d = draft(l);
  return (
    d.denominacion !== l.denominacionOriginal ||
    d.monto !== (l.montoNormalizado ?? l.montoOriginal) ||
    d.rubroId !== (l.rubroInstitucionalId ?? "")
  );
}

function lineaTieneRubro(l: LineaContableDto): boolean {
  return Boolean(l.rubroInstitucionalId || l.rubroCodigo);
}

function confianzaDisplay(l: LineaContableDto): string {
  if (l.confianzaClasificacion == null || Number.isNaN(l.confianzaClasificacion)) return "—";
  return `${l.confianzaClasificacion}%`;
}

function puedeAprobar(l: LineaContableDto): boolean {
  if (draftDirty(l)) return rubroEnDraft(l);
  return lineaTieneRubro(l);
}

function aprobarTitle(l: LineaContableDto): string {
  if (draftDirty(l) && !rubroEnDraft(l)) return "Elegí un rubro antes de guardar";
  if (draftDirty(l)) return "Guardar cambios y aprobar";
  if (!lineaTieneRubro(l)) return "Asigná un rubro antes de aprobar";
  return "Aprobar clasificación";
}

function lineStatusIcon(l: LineaContableDto): string {
  if (l.estado === "aprobada" || !l.requiereRevision) return "fas fa-circle-check";
  if (!rubroEnDraft(l) && !lineaTieneRubro(l)) return "fas fa-circle-xmark";
  return "fas fa-circle-exclamation";
}

function buildPayload(l: LineaContableDto): Record<string, unknown> {
  const d = draft(l);
  return {
    denominacionOriginal: d.denominacion,
    montoNormalizado: d.monto,
    rubroInstitucionalId: d.rubroId || undefined,
  };
}

function emitGuardar(l: LineaContableDto): void {
  if (!rubroEnDraft(l)) return;
  emit("guardar", l.id, buildPayload(l));
}

function emitAprobar(l: LineaContableDto): void {
  if (draftDirty(l)) {
    if (!rubroEnDraft(l)) return;
    emit("guardar", l.id, buildPayload(l));
    return;
  }
  if (!lineaTieneRubro(l)) return;
  emit("aprobar", l.id);
}
</script>

<style scoped>
.lines-grid {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) 2.75rem 3.25rem 6.75rem 10rem minmax(12rem, 1.3fr) 7.75rem;
  column-gap: 0.55rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: var(--panel);
}

.lines-grid__head,
.lines-grid__row {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
  padding: 0.4rem 0.55rem;
}

.lines-grid__head {
  font-size: 0.58rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
  background: var(--panel-2);
  border-bottom: 1px solid var(--line);
}

.lines-grid__cell {
  min-width: 0;
}

.lines-grid__cell--monto {
  text-align: right;
}

.lines-grid__head .lines-grid__cell--actions {
  text-align: right;
}

.lines-grid__body {
  display: contents;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lines-grid__row {
  border-bottom: 1px solid var(--line);
  border-left: 3px solid var(--line-2);
}

.lines-grid__row:last-child {
  border-bottom: none;
}

.lines-grid__row--pending {
  border-left-color: var(--warn);
}

.lines-grid__row--no-rubro {
  border-left-color: var(--bad);
  background: color-mix(in srgb, var(--bad) 3%, var(--panel));
}

.lines-grid__row--ok {
  border-left-color: var(--ok);
}

.lines-grid__row--pending .line-status-icon {
  background: var(--warn-bg);
  color: var(--warn);
}

.lines-grid__row--no-rubro .line-status-icon {
  background: var(--bad-bg);
  color: var(--bad);
}

.lines-grid__row--ok .line-status-icon {
  background: var(--ok-bg);
  color: var(--ok);
}

.line-status-icon {
  width: 1.35rem;
  height: 1.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.7rem;
  margin: 0 auto;
}

.lines-grid__cell--icon {
  justify-self: center;
}

.lines-grid__cell--pag {
  text-align: center;
  align-self: center;
}

.line-pag__value {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
}

.lines-grid__cell--conf {
  text-align: center;
  align-self: center;
}

.line-conf__value {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
  white-space: nowrap;
}

.lines-grid__cell--estado {
  text-align: center;
  align-self: center;
}

.line-estado__badge {
  display: inline-block;
  max-width: 100%;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink-soft);
  word-break: break-word;
}

.line-estado__badge--ok {
  color: var(--ok);
}

.line-estado__badge--pending {
  color: var(--warn);
}

.line-estado__badge--critical {
  color: var(--bad);
}

.lines-grid__cell--concepto {
  min-width: 0;
  align-self: center;
}

.line-concepto__title {
  display: block;
  font-weight: 600;
  font-size: 0.78rem;
  line-height: 1.3;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-concepto__sugerencias {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  margin-top: 0.25rem;
}

.line-concepto__sug-btn {
  padding: 0.08rem 0.32rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--panel-2);
  font-size: 0.6rem;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
}

.line-concepto__sug-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
}

.line-concepto__sug-btn--active {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 12%, var(--panel));
  color: var(--brand);
}

.line-action-ia {
  border: 1px solid color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
  color: var(--brand);
}

.line-action-ia:hover:not(:disabled) {
  background: color-mix(in srgb, var(--brand) 18%, var(--panel));
}

.line-action-ia--active {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 22%, var(--panel));
}

.line-action-ia:disabled {
  opacity: 0.65;
  cursor: wait;
}

.line-concepto__ia-panel {
  margin-top: 0.35rem;
  padding: 0.35rem 0.45rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--brand) 25%, var(--line));
  background: color-mix(in srgb, var(--brand) 6%, var(--panel));
}

.line-concepto__ia-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.35rem;
  font-size: 0.68rem;
  color: var(--ink);
}

.line-concepto__ia-conf {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--brand);
  white-space: nowrap;
}

.line-concepto__ia-razon {
  margin: 0.25rem 0 0;
  font-size: 0.65rem;
  line-height: 1.35;
  color: var(--ink-soft);
}

.line-concepto__ia-actions {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.3rem;
}

.line-concepto__ia-error {
  margin: 0.25rem 0 0;
  font-size: 0.62rem;
  color: var(--bad);
}

.lines-grid__cell--monto,
.lines-grid__cell--rubro {
  align-self: center;
}

.lines-grid__input,
.lines-grid__select {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0.28rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--panel-2);
  font-size: 0.75rem;
  color: var(--ink);
}

.lines-grid__input--monto {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.lines-grid__select--error {
  border-color: var(--bad);
  background: color-mix(in srgb, var(--bad) 5%, var(--panel));
}

.lines-grid__readonly-monto {
  display: block;
  width: 100%;
  box-sizing: border-box;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lines-grid__rubro-tag {
  display: inline-block;
  max-width: 100%;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-weight: 600;
  font-size: 0.7rem;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lines-grid__rubro-empty {
  font-size: 0.75rem;
  color: var(--ink-faint);
}

.lines-grid__cell--actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.2rem;
  justify-self: stretch;
}

.btn-icon {
  padding: 0.25rem 0.4rem;
  min-width: 1.85rem;
  justify-content: center;
}

.line-action-approve {
  border: 1px solid color-mix(in srgb, var(--ok) 40%, var(--line));
  background: var(--ok-bg);
  color: var(--ok);
}

.line-action-approve:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ok) 22%, var(--panel));
}

.btn-sm {
  font-size: 0.75rem;
}

@media (max-width: 900px) {
  .lines-grid {
    overflow-x: auto;
    grid-template-columns: 2rem minmax(10rem, 1fr) 2.5rem 3rem 6.5rem 9rem minmax(11rem, 1.2fr) 7.5rem;
  }
}
</style>
