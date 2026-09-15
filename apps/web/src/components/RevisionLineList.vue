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
        :id="`revision-linea-${l.id}`"
        :key="l.id"
        class="lines-grid__row"
        role="row"
        :class="{
          'lines-grid__row--pending': esPendiente(l),
          'lines-grid__row--no-rubro': esPendiente(l) && !rubroEnDraft(l) && !lineaTieneRubro(l),
          'lines-grid__row--ok': !esPendiente(l),
          'lines-grid__row--ia-curso': l.id === iaLineaEnCursoId,
          'lines-grid__row--ia-reciente': iaLineasRecientesIds?.includes(l.id),
          'lines-grid__row--ruido': esLineaProbableRuidoRevision(l),
          'lines-grid__row--duplicado': esLineaDuplicada(l),
        }"
      >
        <span class="lines-grid__cell lines-grid__cell--icon" role="cell">
          <span class="line-status-icon" aria-hidden="true">
            <i :class="lineStatusIcon(l)"></i>
          </span>
        </span>

        <div class="lines-grid__cell lines-grid__cell--concepto" role="cell">
          <span class="line-concepto__title" :title="l.denominacionOriginal">{{ l.denominacionOriginal }}</span>
          <span v-if="esLineaProbableRuidoRevision(l)" class="line-concepto__ruido-tag">
            Posible ruido OCR
          </span>
          <span v-else-if="duplicadosOcultos(l) > 0" class="line-concepto__dup-tag">
            +{{ duplicadosOcultos(l) }} duplicada(s) oculta(s)
          </span>
          <span v-else-if="esLineaDuplicada(l)" class="line-concepto__dup-tag">
            Duplicado
          </span>
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
        </div>

        <div class="lines-grid__cell lines-grid__cell--pag" role="cell">
          <span class="line-pag__value">{{ l.paginaNumero }}</span>
        </div>

        <div class="lines-grid__cell lines-grid__cell--conf" role="cell">
          <span class="line-conf__value">{{ confianzaDisplay(l) }}</span>
        </div>

        <div class="lines-grid__cell lines-grid__cell--estado" role="cell">
          <button
            v-if="showEstado && puedeAbrirDetalleIa(l)"
            type="button"
            class="line-estado__badge line-estado__badge--ia-btn"
            :class="estadoLineaClass(l)"
            :title="`Ver clasificación IA — ${l.denominacionOriginal}`"
            :aria-label="`${estadoLineaLabel(l)} — ver detalle de clasificación IA`"
            @click.stop="abrirDetalleIa(l)"
          >
            {{ estadoLineaLabel(l) }}
          </button>
          <span v-else-if="showEstado" class="line-estado__badge" :class="estadoLineaClass(l)">
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
            :key="`${l.id}-${l.rubroInstitucionalId ?? ''}-${l.clasificacionIaAt ?? ''}`"
            v-model="draft(l).rubroId"
            class="lines-grid__select"
            :class="{ 'lines-grid__select--error': !rubroEnDraft(l) }"
            aria-label="Rubro"
            @click.stop
            @change="onRubroChange(l)"
          >
            <option value="">— Elegir rubro —</option>
            <option v-for="r in rubrosCombo" :key="r.id" :value="r.id">
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
          <template v-if="mostrarEditorInline(l)">
            <button
              v-if="esPendiente(l)"
              class="btn btn-primary btn-sm btn-icon line-action-confirm"
              type="button"
              :disabled="!puedeConfirmar(l)"
              :title="confirmarTitle(l)"
              @click.stop="emitConfirmar(l)"
            >
              <i class="fas fa-check" aria-hidden="true"></i>
            </button>
            <button
              v-else-if="draftDirty(l)"
              class="btn btn-primary btn-sm btn-icon"
              type="button"
              :disabled="!rubroEnDraft(l)"
              title="Guardar cambios"
              @click.stop="emitGuardar(l)"
            >
              <i class="fas fa-save" aria-hidden="true"></i>
            </button>
          </template>
          <button
            v-if="allowDelete"
            class="btn btn-ghost btn-sm btn-icon lines-grid__delete"
            type="button"
            title="Eliminar línea"
            @click.stop="emit('eliminar', l)"
          >
            <i class="fas fa-trash-can" aria-hidden="true"></i>
          </button>
        </div>
      </li>
    </ul>

    <ClasificacionIaLineaModal v-model="iaDetalleModalOpen" :linea="iaDetalleLinea" />
  </div>
</template>

<script setup lang="ts">
import type { LineaContableDto, RubroOptionDto } from "@ffa/shared";
import { computed, inject, onUnmounted, reactive, ref, watch } from "vue";
import { rubroDeLinea, type LineaDraftOverride } from "../utils/balanceTotales";
import { formatMonto, parseMontoInput } from "../utils/formatMonto";
import { esLineaProbableRuidoRevision } from "../utils/revisionResumen";
import ClasificacionIaLineaModal from "./ClasificacionIaLineaModal.vue";

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
  iaLineaEnCursoId?: string;
  iaLineasRecientesIds?: string[];
  /** Permite eliminar filas erróneas (ruido OCR, duplicados). */
  allowDelete?: boolean;
  /** IDs de líneas que pertenecen a un grupo duplicado (mismo concepto y monto). */
  idsDuplicados?: string[];
  /** Filas repetidas colapsadas en la fila visible (id → cantidad oculta). */
  duplicadosOcultosPorId?: Record<string, number>;
}>();

const monedaCodigo = computed(() => props.moneda?.trim().toUpperCase() ?? "");

const iaLineaEnCursoId = computed(() => props.iaLineaEnCursoId);
const iaLineasRecientesIds = computed(() => props.iaLineasRecientesIds ?? []);

function formatMontoConMoneda(n: number | null | undefined): string {
  const monto = formatMonto(n);
  if (monto === "—") return monto;
  return monedaCodigo.value ? `${monedaCodigo.value} ${monto}` : monto;
}

const rubrosLista = computed(() => props.rubros ?? []);

const rubrosCombo = computed(() =>
  rubrosLista.value.filter((r) => r.asignable !== false)
);

const allowDelete = computed(() => props.allowDelete ?? false);
const idsDuplicadosSet = computed(() => new Set(props.idsDuplicados ?? []));

function esLineaDuplicada(l: LineaContableDto): boolean {
  return idsDuplicadosSet.value.has(l.id);
}

function duplicadosOcultos(l: LineaContableDto): number {
  return props.duplicadosOcultosPorId?.[l.id] ?? 0;
}

const emit = defineEmits<{
  guardar: [lineaId: string, data: Record<string, unknown>];
  aprobar: [lineaId: string];
  verDocumento: [linea: LineaContableDto];
  eliminar: [linea: LineaContableDto];
  iaAplicada: [];
}>();

const drafts = reactive<Record<string, LineDraft>>({});
const draftServerKey = reactive<Record<string, string>>({});
const montoEditando = reactive<Record<string, string>>({});
const montoFocused = ref<Set<string>>(new Set());
const iaDetalleModalOpen = ref(false);
const iaDetalleLinea = ref<LineaContableDto | null>(null);
const registerLineDraft = inject<RegisterLineDraft | null>("revisionDraftRegister", null);

function lineServerKey(l: LineaContableDto): string {
  return [
    l.rubroInstitucionalId ?? "",
    l.clasificacionIaAt ?? "",
    l.montoNormalizado ?? l.montoOriginal,
    l.denominacionOriginal,
  ].join("|");
}

function esPendiente(l: LineaContableDto): boolean {
  return l.requiereRevision && l.estado !== "aprobada";
}

function lineaYaProcesadaPorIa(l: LineaContableDto): boolean {
  return (
    Boolean(l.clasificacionIaAt) ||
    l.origenClasificacion === "ia_revision" ||
    l.origenClasificacion === "ia_clasificacion" ||
    l.origenClasificacion === "ia_pre_revision"
  );
}

function lineaOkIa(l: LineaContableDto): boolean {
  if (esPendiente(l)) return false;
  return (
    l.origenClasificacion === "ia_clasificacion" ||
    l.origenClasificacion === "ia_pre_revision" ||
    l.origenClasificacion === "ia_revision"
  );
}

function rubroAsignado(l: LineaContableDto): boolean {
  return Boolean(rubroDeLinea(l, rubrosLista.value));
}

function puedeAbrirDetalleIa(l: LineaContableDto): boolean {
  if (!lineaYaProcesadaPorIa(l)) return false;
  return Boolean(l.clasificacionIaRazonamiento) || rubroAsignado(l);
}

function abrirDetalleIa(l: LineaContableDto): void {
  iaDetalleLinea.value = l;
  iaDetalleModalOpen.value = true;
}

function estadoLineaLabel(l: LineaContableDto): string {
  if (!esPendiente(l)) return lineaOkIa(l) ? "OK IA" : "OK";
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
  const resuelto = rubroDeLinea(l, rubrosLista.value);
  const rubroId =
    resuelto && resuelto.asignable !== false ? resuelto.id : l.rubroInstitucionalId ?? "";
  return {
    denominacion: l.denominacionOriginal,
    monto: l.montoNormalizado ?? l.montoOriginal,
    rubroId,
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

watch(
  () => props.lineas,
  (list) => {
    for (const l of list) {
      const key = lineServerKey(l);
      const prev = drafts[l.id];
      const keyChanged = draftServerKey[l.id] !== key;

      if (!prev) {
        drafts[l.id] = initDraft(l);
        draftServerKey[l.id] = key;
        continue;
      }

      if (!keyChanged) continue;

      const editedLocally = draftDirty(l);
      const actualizadoPorIa = Boolean(l.clasificacionIaAt);

      if (!editedLocally || actualizadoPorIa) {
        drafts[l.id] = initDraft(l);
        registerLineDraft?.(l.id, null);
      }

      draftServerKey[l.id] = key;
    }
  },
  { deep: true, immediate: true }
);

watch(
  () => props.iaLineasRecientesIds,
  (ids) => {
    if (!ids?.length) return;
    for (const id of ids) {
      const l = props.lineas.find((linea) => linea.id === id);
      if (!l) continue;
      drafts[l.id] = initDraft(l);
      draftServerKey[l.id] = lineServerKey(l);
      registerLineDraft?.(l.id, null);
    }
  }
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
    d.rubroId !== (rubroDeLinea(l, rubrosLista.value)?.id ?? l.rubroInstitucionalId ?? "")
  );
}

function lineaTieneRubro(l: LineaContableDto): boolean {
  return Boolean(rubroDeLinea(l, rubrosLista.value));
}

function confianzaDisplay(l: LineaContableDto): string {
  if (l.confianzaClasificacion == null || Number.isNaN(l.confianzaClasificacion)) return "—";
  return `${l.confianzaClasificacion}%`;
}

function puedeConfirmar(l: LineaContableDto): boolean {
  if (draftDirty(l)) return rubroEnDraft(l);
  return lineaTieneRubro(l);
}

function confirmarTitle(l: LineaContableDto): string {
  if (draftDirty(l) && !rubroEnDraft(l)) return "Elegí un rubro antes de confirmar";
  if (draftDirty(l)) return "Confirmar cambios en la línea";
  if (!lineaTieneRubro(l)) return "Asigná un rubro antes de confirmar";
  return "Confirmar línea";
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

function emitConfirmar(l: LineaContableDto): void {
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

.lines-grid__row--ia-curso {
  border-left-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand) 35%, transparent);
  animation: line-ia-pulse 1.2s ease-in-out infinite;
}

.lines-grid__row--ia-reciente:not(.lines-grid__row--ia-curso) {
  animation: line-ia-flash 1.4s ease-out 1;
}

@keyframes line-ia-pulse {
  0%,
  100% {
    background: color-mix(in srgb, var(--brand) 6%, var(--panel));
  }
  50% {
    background: color-mix(in srgb, var(--brand) 14%, var(--panel));
  }
}

@keyframes line-ia-flash {
  0% {
    background: color-mix(in srgb, var(--ok) 22%, var(--panel));
  }
  100% {
    background: transparent;
  }
}

.lines-grid__row--ruido {
  background: color-mix(in srgb, var(--warn) 6%, var(--panel));
  border-left: 3px solid color-mix(in srgb, var(--warn) 55%, transparent);
}

.lines-grid__row--duplicado {
  background: color-mix(in srgb, #6366f1 6%, var(--panel));
  border-left: 3px solid color-mix(in srgb, #6366f1 45%, transparent);
}

.line-concepto__dup-tag {
  display: inline-block;
  margin-top: 0.2rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  background: color-mix(in srgb, #6366f1 12%, var(--panel));
  color: #4338ca;
}

.line-concepto__ruido-tag {
  display: inline-block;
  margin-top: 0.2rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 12%, var(--panel));
}

.lines-grid__delete {
  color: var(--bad);
}

.lines-grid__delete:hover {
  color: var(--bad);
  background: color-mix(in srgb, var(--bad) 10%, var(--panel));
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

.line-estado__badge--ia-btn {
  border: none;
  padding: 0;
  background: none;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.line-estado__badge--ia-btn:hover {
  filter: brightness(0.92);
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
