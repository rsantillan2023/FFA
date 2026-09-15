<template>
  <div class="lines-workspace">
    <div class="lines-summary" role="toolbar" aria-label="Filtrar líneas contables">
      <button
        type="button"
        class="lines-summary__chip"
        :class="[
          lineasPendientesConRubro > 0 ? 'lines-summary__chip--pending' : 'lines-summary__chip--ok',
          { 'lines-summary__chip--active': lineasFiltro === 'pendientes' },
        ]"
        :aria-pressed="lineasFiltro === 'pendientes'"
        :disabled="lineasPendientesConRubro === 0"
        :title="'Con rubro asignado — falta revisar o confirmar (no incluye sin rubro)'"
        @click="toggleFiltro('pendientes')"
      >
        <i :class="lineasPendientesConRubro > 0 ? 'fas fa-list-check' : 'fas fa-circle-check'" aria-hidden="true"></i>
        <span>
          <strong>{{ lineasPendientesConRubro }}</strong> a revisar
        </span>
      </button>
      <button
        v-if="lineasSinRubroCount > 0"
        type="button"
        class="lines-summary__chip lines-summary__chip--critical"
        :class="{ 'lines-summary__chip--active': lineasFiltro === 'sin-rubro' }"
        :aria-pressed="lineasFiltro === 'sin-rubro'"
        :title="'Sin rubro institucional — elegí cuenta en el combo'"
        @click="toggleFiltro('sin-rubro')"
      >
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        <span><strong>{{ lineasSinRubroCount }}</strong> sin rubro</span>
      </button>
      <button
        v-if="lineasRuidoCount > 0"
        type="button"
        class="lines-summary__chip lines-summary__chip--warn"
        :class="{ 'lines-summary__chip--active': lineasFiltro === 'ruido' }"
        :aria-pressed="lineasFiltro === 'ruido'"
        @click="toggleFiltro('ruido')"
      >
        <i class="fas fa-broom" aria-hidden="true"></i>
        <span><strong>{{ lineasRuidoCount }}</strong> posible ruido OCR</span>
      </button>
      <button
        v-if="lineasDuplicadasCount > 0"
        type="button"
        class="lines-summary__chip lines-summary__chip--dup"
        :class="{ 'lines-summary__chip--active': lineasFiltro === 'duplicados' }"
        :aria-pressed="lineasFiltro === 'duplicados'"
        @click="toggleFiltro('duplicados')"
      >
        <i class="fas fa-clone" aria-hidden="true"></i>
        <span><strong>{{ lineasDuplicadasCount }}</strong> duplicadas</span>
      </button>
      <button
        v-if="totalLineas != null"
        type="button"
        class="lines-summary__chip lines-summary__chip--neutral"
        :class="{ 'lines-summary__chip--active': lineasFiltro === 'all' }"
        :aria-pressed="lineasFiltro === 'all'"
        @click="toggleFiltro('all')"
      >
        <i class="fas fa-table" aria-hidden="true"></i>
        <span>
          <strong>{{ lineasVisiblesCount }}</strong> en el balance
          <span v-if="lineasDuplicadasCount > 0" class="lines-summary__chip-sub">
            (+{{ lineasDuplicadasCount }} ocultas)
          </span>
        </span>
      </button>
    </div>

    <p v-if="lineasDuplicadasCount > 0 && lineasFiltro !== 'duplicados'" class="lines-dup-hint">
      Hay {{ lineasDuplicadasCount }} fila(s) repetida(s) colapsada(s). Usá el filtro
      <button type="button" class="link-btn" @click="toggleFiltro('duplicados')">duplicadas</button>
      para verlas o
      <strong>Eliminar duplicados</strong> en la barra superior.
    </p>

    <div v-if="!unificado" class="lines-toolbar">
      <div class="lines-toolbar__left">
        <button
          v-if="allowManual"
          class="btn btn-primary btn-sm"
          type="button"
          @click="emit('agregarLinea')"
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
          Agregar línea
        </button>
      </div>
      <label class="lines-filter">
        <input v-model="soloRevision" type="checkbox" @change="emitReload" />
        <span>Solo pendientes de revisión</span>
      </label>
    </div>

    <div v-if="!lineasFiltradas.length" class="lines-empty" :class="`lines-empty--${emptyKind}`">
      <div class="lines-empty__icon" aria-hidden="true">
        <i :class="emptyIcon"></i>
      </div>
      <h3 class="lines-empty__title">{{ emptyTitle }}</h3>
      <p class="lines-empty__desc">{{ emptyDescription }}</p>
      <div v-if="emptyActions.length" class="lines-empty__actions">
        <button
          v-for="action in emptyActions"
          :key="action.label"
          class="btn btn-sm"
          :class="action.primary ? 'btn-primary' : 'btn-ghost'"
          type="button"
          @click="action.onClick()"
        >
          <i v-if="action.icon" :class="action.icon" aria-hidden="true"></i>
          {{ action.label }}
        </button>
      </div>
    </div>

    <div v-else-if="unificado && ordenPorPlan" class="lines-sections lines-sections--plan">
      <div v-if="totalesBalance" class="balance-totales-wrap" role="region" aria-label="Totales de balance">
        <p v-if="tieneCambiosSinGuardar" class="balance-totales__preview">
          Vista previa — incluye rubros/montos editados sin guardar.
          <span v-if="isRecalculandoTotales"> Actualizando totales…</span>
        </p>
        <div
          class="balance-strip"
          :class="totalesBalance.cuadraturaOk ? 'balance-strip--ok' : 'balance-strip--fail'"
        >
          <header class="balance-strip__head">
            <div class="balance-strip__head-row">
              <div class="balance-strip__head-left">
                <h3 class="balance-strip__title">Cuadratura del balance</h3>
                <p class="balance-strip__subtitle">
                  Total Activo = Total Pasivo + Total Patrimonio
                  <span v-if="totalesBalance.lineasExcluidasCuadratura > 0" class="balance-strip__subtitle-note">
                    · {{ totalesBalance.lineasCuadratura }} línea(s) de detalle
                    ({{ totalesBalance.lineasExcluidasCuadratura }} excluidas: totales, ER/flujo en balance, agrupadores, comparativas)
                  </span>
                </p>
              </div>
              <p v-if="razonSocial" class="balance-strip__empresa" :title="razonSocial">
                {{ razonSocial }}
              </p>
            </div>
          </header>
          <div class="balance-strip__grid">
            <article class="balance-strip__card balance-strip__card--activo">
              <span class="balance-strip__badge">1</span>
              <div class="balance-strip__card-body">
                <span class="balance-strip__label">Total Activo</span>
                <strong class="balance-strip__value" :title="formatMonto(totalesBalance.activo)">
                  {{ formatMontoConMoneda(totalesBalance.activo) }}
                </strong>
              </div>
            </article>
            <article class="balance-strip__card balance-strip__card--pasivo">
              <span class="balance-strip__badge">2</span>
              <div class="balance-strip__card-body">
                <span class="balance-strip__label">Total Pasivo</span>
                <strong class="balance-strip__value" :title="formatMonto(totalesBalance.pasivo)">
                  {{ formatMontoConMoneda(totalesBalance.pasivo) }}
                </strong>
              </div>
            </article>
            <article class="balance-strip__card balance-strip__card--patrimonio">
              <span class="balance-strip__badge">3</span>
              <div class="balance-strip__card-body">
                <span class="balance-strip__label">Total Patrimonio</span>
                <strong class="balance-strip__value" :title="formatMonto(totalesBalance.patrimonio)">
                  {{ formatMontoConMoneda(totalesBalance.patrimonio) }}
                </strong>
              </div>
            </article>
            <article
              class="balance-strip__card balance-strip__card--verdict"
              :class="totalesBalance.cuadraturaOk ? 'balance-strip__card--verdict-ok' : 'balance-strip__card--verdict-fail'"
            >
              <i
                class="balance-strip__verdict-icon"
                :class="totalesBalance.cuadraturaOk ? 'fas fa-circle-check' : 'fas fa-circle-exclamation'"
                aria-hidden="true"
              ></i>
              <div class="balance-strip__card-body">
                <span class="balance-strip__label">Cuadratura</span>
                <strong v-if="totalesBalance.cuadraturaOk" class="balance-strip__value balance-strip__value--ok">
                  Cuadra — 1 = 2 + 3
                </strong>
                <template v-else>
                  <strong class="balance-strip__value balance-strip__value--fail">No cuadra</strong>
                  <span class="balance-strip__diff">
                    Diferencia:
                    {{ formatMontoConMoneda(Math.abs(totalesBalance.diferencia)) }}
                    <span class="balance-strip__diff-pct">
                      ({{ formatDiferenciaCuadraturaPct(totalesBalance.diferenciaPct) }})
                    </span>
                  </span>
                  <span class="balance-strip__rhs">
                    2 + 3 = {{ formatMontoConMoneda(totalesBalance.pasivo + totalesBalance.patrimonio) }}
                  </span>
                </template>
              </div>
            </article>
          </div>
          <div
            v-if="totalesBalance.resultadosLineas > 0 || totalesBalance.sinRubroLineas > 0"
            class="balance-strip__info"
          >
            <article
              v-if="totalesBalance.resultadosLineas > 0"
              class="balance-strip__info-item balance-strip__info-item--resultados"
            >
              <span class="balance-strip__badge">4</span>
              <div class="balance-strip__card-body">
                <span class="balance-strip__label">Total Resultados</span>
                <strong class="balance-strip__value" :title="formatMonto(totalesBalance.resultados)">
                  {{ formatMontoConMoneda(totalesBalance.resultados) }}
                </strong>
                <span class="balance-strip__info-hint">
                  {{ totalesBalance.resultadosLineas }} línea(s) · informativo, no entra en 1 = 2 + 3
                </span>
              </div>
            </article>
            <article
              v-if="totalesBalance.sinRubroLineas > 0"
              class="balance-strip__info-item balance-strip__info-item--sin-rubro"
            >
              <span class="balance-strip__badge balance-strip__badge--muted">—</span>
              <div class="balance-strip__card-body">
                <span class="balance-strip__label">Sin rubro</span>
                <strong class="balance-strip__value" :title="formatMonto(totalesBalance.sinRubro)">
                  {{ formatMontoConMoneda(totalesBalance.sinRubro) }}
                </strong>
                <span class="balance-strip__info-hint">
                  {{ totalesBalance.sinRubroLineas }} línea(s) · no suma en cuadratura hasta asignar rubro
                </span>
              </div>
            </article>
          </div>
        </div>
        <details
          v-if="!totalesBalance.cuadraturaOk && lineasImpactoCuadratura.length"
          class="balance-impacto-details"
        >
          <summary class="balance-impacto-details__summary">
            {{ lineasImpactoCuadratura.length }} línea(s) clave para revisar la diferencia
          </summary>
          <ul class="balance-impacto-details__list">
            <li v-for="item in lineasImpactoCuadratura" :key="item.linea.id">
              <button
                type="button"
                class="balance-impacto-details__btn"
                :title="`${item.linea.denominacionOriginal} — ${formatMonto(item.impacto)}`"
                @click="emit('scrollLinea', item.linea.id)"
              >
                <span class="balance-impacto-details__concepto">{{ truncar(item.linea.denominacionOriginal, 36) }}</span>
                <span class="balance-impacto-details__monto">{{ formatMontoCompact(item.impacto) }}</span>
              </button>
            </li>
          </ul>
        </details>
      </div>

      <section
        v-for="grupo in lineasGruposEstado"
        :key="grupo.estado"
        class="lines-section lines-section--plan-grupo"
        :class="
          grupo.estado === 'subtotales'
            ? 'lines-section--subtotales'
            : grupo.numero
              ? `lines-section--estado-${grupo.numero}`
              : 'lines-section--sin-clasificar'
        "
      >
        <header v-if="grupo.numero" class="lines-section__head lines-section__head--plan">
          <h3>
            <span class="lines-section__plan-num">{{ grupo.numero }}</span>
            {{ grupo.label }}
          </h3>
        </header>
        <header v-else class="lines-section__head lines-section__head--plan">
          <h3>{{ grupo.label }}</h3>
        </header>
        <LineList
          :lineas="grupo.lineas"
          :rubros="rubros"
          :moneda="moneda"
          :caso-id="casoId"
          editable
          editar-aprobadas
          show-estado
          :allow-delete="allowDelete"
          :ia-linea-en-curso-id="iaLineaEnCursoId"
          :ia-lineas-recientes-ids="iaLineasRecientesIds"
          :ids-duplicados="idsEnGrupoDuplicado"
          :duplicados-ocultos-por-id="duplicadosOcultosPorId"
          @guardar="onGuardar"
          @aprobar="onAprobar"
          @eliminar="onEliminar"
          @ia-aplicada="emit('iaAplicada')"
          @ver-documento="emitVerDocumentoLinea"
        />
      </section>
    </div>

    <div v-else-if="unificado" class="lines-sections lines-sections--unificado">
      <LineList
        :lineas="lineasOrdenadas"
        :rubros="rubros"
        :moneda="moneda"
        :caso-id="casoId"
        editable
        editar-aprobadas
        show-estado
        :allow-delete="allowDelete"
        :ia-linea-en-curso-id="iaLineaEnCursoId"
        :ia-lineas-recientes-ids="iaLineasRecientesIds"
        :ids-duplicados="idsEnGrupoDuplicado"
        :duplicados-ocultos-por-id="duplicadosOcultosPorId"
        @guardar="onGuardar"
        @aprobar="onAprobar"
        @eliminar="onEliminar"
        @ia-aplicada="emit('iaAplicada')"
        @ver-documento="emitVerDocumentoLinea"
      />
    </div>

    <div v-else class="lines-sections">
      <section
        v-if="lineasSinRubro.length && muestraSeccionSinRubro"
        class="lines-section lines-section--critical"
      >
        <header class="lines-section__head">
          <h3>
            <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
            Completar información ({{ lineasSinRubro.length }})
          </h3>
          <p>Elegí el rubro en el combo de cada fila y confirmá con ✓.</p>
        </header>
        <LineList
          :lineas="lineasSinRubro"
          :rubros="rubros"
          :moneda="moneda"
          :caso-id="casoId"
          editable
          :allow-delete="allowDelete"
          @guardar="onGuardar"
          @aprobar="onAprobar"
          @eliminar="onEliminar"
          @ia-aplicada="emit('iaAplicada')"
          @ver-documento="emitVerDocumentoLinea"
        />
      </section>

      <section
        v-if="lineasParaAprobar.length && muestraSeccionParaAprobar"
        class="lines-section lines-section--review"
      >
        <header class="lines-section__head">
          <h3>
            <i class="fas fa-clipboard-check" aria-hidden="true"></i>
            Revisar y aprobar ({{ lineasParaAprobar.length }})
          </h3>
          <p>Corregí monto o rubro en la misma fila, o confirmá con ✓ si está bien.</p>
        </header>
        <LineList
          :lineas="lineasParaAprobar"
          :rubros="rubros"
          :moneda="moneda"
          :caso-id="casoId"
          editable
          :allow-delete="allowDelete"
          @guardar="onGuardar"
          @aprobar="onAprobar"
          @eliminar="onEliminar"
          @ia-aplicada="emit('iaAplicada')"
          @ver-documento="emitVerDocumentoLinea"
        />
      </section>

      <section
        v-if="lineasOk.length && muestraSeccionOk"
        class="lines-section lines-section--ok"
      >
        <header class="lines-section__head">
          <h3>
            <i class="fas fa-circle-check" aria-hidden="true"></i>
            Ya revisadas — podés corregir rubros ({{ lineasOk.length }})
          </h3>
          <p>Si la cuadratura falla, reasigná rubros acá aunque la línea ya esté aprobada.</p>
        </header>
        <LineList
          :lineas="lineasOk"
          :rubros="rubros"
          :moneda="moneda"
          :caso-id="casoId"
          editable
          editar-aprobadas
          :allow-delete="allowDelete"
          @guardar="onGuardar"
          @eliminar="onEliminar"
          @ia-aplicada="emit('iaAplicada')"
          @ver-documento="emitVerDocumentoLinea"
        />
      </section>
    </div>

    <p v-if="panelMsg" class="panel-feedback panel-feedback--ok">{{ panelMsg }}</p>
    <p v-if="panelError" class="panel-feedback panel-feedback--err">{{ panelError }}</p>
  </div>
</template>

<script setup lang="ts">
import type { LineaContableDto, RubroOptionDto } from "@ffa/shared";
import { computed, provide, ref, watch } from "vue";
import { useDeferredBalancePreview } from "../composables/useDeferredBalancePreview";
import {
  agruparLineasPorEstado,
  calcularTotalesBalance,
  formatDiferenciaCuadraturaPct,
  rubroDeLinea,
  type LineaDraftOverride,
} from "../utils/balanceTotales";
import {
  colapsarDuplicadosLineas,
  colapsarDuplicadosEscala,
  esLineaEnGrupoDuplicado,
} from "../utils/linea-duplicados";
import { motivoExclusionCuadratura } from "../utils/lineaCuadratura";
import {
  esLineaProbableRuidoRevision,
  type LineaImpactoCuadratura,
} from "../utils/revisionResumen";
import { formatMonto, formatMontoCompact } from "../utils/formatMonto";
import LineList from "./RevisionLineList.vue";

const props = defineProps<{
  lineas: LineaContableDto[];
  rubros: RubroOptionDto[];
  casoId?: string;
  casoVersion: number;
  lineasPendientes?: number;
  totalLineas?: number;
  panelMsg?: string;
  panelError?: string;
  /** Una sola lista con todas las líneas, ordenadas por estado. */
  unificado?: boolean;
  /** Ordenar por posición en el plan de cuentas (rubros vienen ordenados del API). */
  ordenPorPlan?: boolean;
  /** Mostrar botón para ingreso manual de líneas (J.21). */
  allowManual?: boolean;
  /** Permite eliminar filas erróneas de extracción. */
  allowDelete?: boolean;
  /** Moneda ISO del expediente para mostrar en cada fila. */
  moneda?: string;
  /** Razón social del expediente (cabecera de cuadratura). */
  razonSocial?: string;
  iaClasificacionActiva?: boolean;
  iaLineaEnCursoId?: string;
  iaLineasRecientesIds?: string[];
  lineasImpactoCuadratura?: LineaImpactoCuadratura[];
}>();

const emit = defineEmits<{
  reload: [soloRevision: boolean];
  patchLinea: [lineaId: string, data: Record<string, unknown>];
  approveLinea: [lineaId: string];
  eliminarLinea: [linea: LineaContableDto];
  reclasificarMasiva: [lineaId: string, data: { rubroInstitucionalId: string; motivo?: string }];
  verDocumento: [];
  verDocumentoLinea: [linea: LineaContableDto];
  agregarLinea: [];
  iaAplicada: [];
  draftOverridesChange: [overrides: Record<string, LineaDraftOverride>];
  scrollLinea: [lineaId: string];
}>();

const lineasImpactoCuadratura = computed(() => props.lineasImpactoCuadratura ?? []);
const allowDelete = computed(() => props.allowDelete ?? false);

const monedaCodigo = computed(() => props.moneda?.trim().toUpperCase() ?? "");

function formatMontoConMoneda(n: number): string {
  const monto = formatMontoCompact(n);
  return monedaCodigo.value ? `${monto} ${monedaCodigo.value}` : monto;
}

function truncar(texto: string, max: number): string {
  const t = texto.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

const {
  calcOverrides: lineDraftOverridesCalc,
  hasPendingChanges: tieneCambiosSinGuardar,
  isRecalculating: isRecalculandoTotales,
  register: registerLineDraft,
} = useDeferredBalancePreview();

provide("revisionDraftRegister", registerLineDraft);

watch(lineDraftOverridesCalc, (overrides) => {
  emit("draftOverridesChange", { ...overrides });
});

const soloRevision = ref(true);
type LineasFiltro = "all" | "pendientes" | "sin-rubro" | "ruido" | "duplicados";
const lineasFiltro = ref<LineasFiltro>("pendientes");

watch(
  () => props.iaClasificacionActiva,
  (activa) => {
    if (activa) {
      lineasFiltro.value = "all";
      if (soloRevision.value) {
        soloRevision.value = false;
        emit("reload", false);
      }
    }
  }
);

function toggleFiltro(filtro: LineasFiltro): void {
  if (filtro === "all") {
    lineasFiltro.value = "all";
    if (soloRevision.value) {
      soloRevision.value = false;
      emitReload();
    }
    return;
  }
  if (filtro === "pendientes" && lineasPendientesConRubro.value === 0) return;
  if (filtro === "sin-rubro" && lineasSinRubroCount.value === 0) return;
  lineasFiltro.value = lineasFiltro.value === filtro ? "all" : filtro;
}

watch(
  () => props.lineasPendientes,
  (pendientes) => {
    if (pendientes === 0 && (props.totalLineas ?? 0) > 0 && soloRevision.value) {
      soloRevision.value = false;
      emit("reload", false);
    }
  },
  { immediate: true }
);

function esPendiente(l: LineaContableDto): boolean {
  return l.requiereRevision && l.estado !== "aprobada";
}

/** Rubro resuelto en el plan cargado (id o código, incl. referenciados en líneas). */
function lineaTieneRubro(l: LineaContableDto): boolean {
  return Boolean(rubroDeLinea(l, props.rubros));
}

/** Detalle sin rubro imputable (excluye subtotales/totales del PDF). */
function lineaSinRubroResuelto(l: LineaContableDto): boolean {
  return motivoExclusionCuadratura(l, rubroDeLinea(l, props.rubros)) === "sin_rubro";
}

const colapsoDuplicados = computed(() => colapsarDuplicadosLineas(props.lineas));

/** Líneas para totales de balance: sin duplicados exactos ni pares escala ×1000. */
const lineasParaCuadratura = computed(() =>
  colapsarDuplicadosEscala(colapsoDuplicados.value.lineasVisibles)
);

const lineasSinRubro = computed(() =>
  colapsoDuplicados.value.lineasVisibles.filter((l) => lineaSinRubroResuelto(l))
);

const lineasSinRubroCount = computed(() => lineasSinRubro.value.length);

const lineasRuidoCount = computed(() =>
  props.lineas.filter((l) => esLineaProbableRuidoRevision(l)).length
);

/** Pendientes con rubro — revisión / confirmación (excluye sin rubro). */
const lineasPendientesConRubro = computed(
  () =>
    colapsoDuplicados.value.lineasVisibles.filter((l) => esPendiente(l) && lineaTieneRubro(l)).length
);

/** Total pendientes (sin rubro + a revisar) — p. ej. pie de aprobación. */
const lineasPendientesTotal = computed(
  () =>
    props.lineasPendientes ??
    colapsoDuplicados.value.lineasVisibles.filter((l) => esPendiente(l)).length
);

const lineasDuplicadasCount = computed(() => colapsoDuplicados.value.duplicadasCount);
const lineasVisiblesCount = computed(() => colapsoDuplicados.value.lineasVisibles.length);
const idsEnGrupoDuplicado = computed(() => [...colapsoDuplicados.value.idsEnGrupoDuplicado]);
const duplicadosOcultosPorId = computed(() => colapsoDuplicados.value.ocultasPorId);

/** En vista normal se muestra una fila por grupo; el filtro «duplicados» lista todas las copias. */
const lineasParaLista = computed(() =>
  lineasFiltro.value === "duplicados" ? props.lineas : colapsoDuplicados.value.lineasVisibles
);

function lineaMatchesFiltro(l: LineaContableDto): boolean {
  if (lineasFiltro.value === "all") return true;
  if (lineasFiltro.value === "pendientes") return esPendiente(l) && lineaTieneRubro(l);
  if (lineasFiltro.value === "ruido") return esLineaProbableRuidoRevision(l);
  if (lineasFiltro.value === "duplicados") {
    return esLineaEnGrupoDuplicado(l, colapsoDuplicados.value.idsEnGrupoDuplicado);
  }
  return lineaSinRubroResuelto(l);
}

const lineasFiltradas = computed(() => lineasParaLista.value.filter(lineaMatchesFiltro));

const muestraSeccionSinRubro = computed(
  () => lineasFiltro.value === "all" || lineasFiltro.value === "sin-rubro"
);

const muestraSeccionParaAprobar = computed(
  () => lineasFiltro.value === "all" || lineasFiltro.value === "pendientes"
);

const muestraSeccionOk = computed(
  () => lineasFiltro.value === "all" && !soloRevision.value
);

const lineasParaAprobar = computed(() =>
  colapsoDuplicados.value.lineasVisibles.filter((l) => esPendiente(l) && lineaTieneRubro(l))
);

const lineasOk = computed(() => props.lineas.filter((l) => !esPendiente(l)));

const rubroOrdenIndice = computed(() => {
  const map = new Map<string, number>();
  props.rubros.forEach((r, idx) => {
    map.set(r.id, idx);
    map.set(r.codigo, idx);
  });
  return map;
});

function indicePlanCuentas(l: LineaContableDto): number {
  const map = rubroOrdenIndice.value;
  if (l.rubroInstitucionalId && map.has(l.rubroInstitucionalId)) {
    return map.get(l.rubroInstitucionalId)!;
  }
  if (l.rubroCodigo && map.has(l.rubroCodigo)) {
    return map.get(l.rubroCodigo)!;
  }
  return Number.MAX_SAFE_INTEGER;
}

const lineasOrdenadas = computed(() => {
  const base = lineasFiltradas.value;
  if (props.ordenPorPlan) {
    return [...base].sort((a, b) => {
      const oa = indicePlanCuentas(a);
      const ob = indicePlanCuentas(b);
      if (oa !== ob) return oa - ob;
      return (a.paginaNumero ?? 0) - (b.paginaNumero ?? 0);
    });
  }
  const score = (l: LineaContableDto) => {
    if (lineaSinRubroResuelto(l)) return 0;
    if (esPendiente(l)) return 1;
    return 2;
  };
  return [...base].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa - sb;
    return (a.paginaNumero ?? 0) - (b.paginaNumero ?? 0);
  });
});

const totalesBalance = computed(() =>
  props.ordenPorPlan
    ? calcularTotalesBalance(
        lineasParaCuadratura.value,
        props.rubros,
        lineDraftOverridesCalc.value
      )
    : null
);

const lineasGruposEstado = computed(() =>
  props.ordenPorPlan ? agruparLineasPorEstado(lineasOrdenadas.value, props.rubros) : []
);

const totalLineas = computed(() => props.totalLineas);

type EmptyKind = "all-done" | "no-data" | "filter-empty";

const emptyKind = computed((): EmptyKind => {
  const total = props.totalLineas ?? 0;
  if (props.lineas.length === 0 && total === 0) return "no-data";
  if (lineasFiltro.value === "all" && soloRevision.value && total > 0 && lineasPendientesTotal.value === 0) {
    return "all-done";
  }
  return "filter-empty";
});

const emptyIcon = computed(() => {
  if (emptyKind.value === "all-done") return "fas fa-circle-check";
  if (emptyKind.value === "no-data") return "fas fa-inbox";
  return "fas fa-filter";
});

const emptyTitle = computed(() => {
  if (emptyKind.value === "all-done") return "No quedan líneas pendientes";
  if (emptyKind.value === "no-data") return "Todavía no hay líneas contables";
  return "Ninguna línea coincide con el filtro";
});

const emptyDescription = computed(() => {
  if (emptyKind.value === "all-done") {
    return "Revisaste todas las filas que el sistema marcó para control manual. Podés continuar al paso de aprobación.";
  }
  if (emptyKind.value === "no-data") {
    return "El procesamiento aún no generó filas para este caso, o la extracción falló. Revisá el expediente o reprocesá el documento.";
  }
  if (lineasFiltro.value === "ruido") {
    return "Filas que parecen firmas, matrículas u otro texto del PDF — no son partidas contables. Eliminálas con el ícono de papelera.";
  }
  if (lineasFiltro.value === "duplicados") {
    return "Mismo concepto y monto repetido. Usá «Eliminar duplicados» arriba para conservar solo la mejor fila de cada grupo.";
  }
  return "Probá otro filtro o usá «en el balance» para ver todas las líneas.";
});

const emptyActions = computed(() => {
  const actions: Array<{ label: string; icon?: string; primary?: boolean; onClick: () => void }> = [];
  if (emptyKind.value === "all-done" || emptyKind.value === "filter-empty") {
    if (lineasFiltro.value !== "all" || soloRevision.value) {
      actions.push({
        label: "Ver todas las líneas",
        icon: "fas fa-list",
        primary: emptyKind.value === "all-done" || lineasFiltro.value !== "all",
        onClick: () => {
          lineasFiltro.value = "all";
          if (soloRevision.value) {
            soloRevision.value = false;
            emitReload();
          }
        },
      });
    }
  }
  if (emptyKind.value === "no-data") {
    actions.push({
      label: "Ver documento origen",
      icon: "fas fa-file-pdf",
      onClick: () => emit("verDocumento"),
    });
  }
  if (props.allowManual) {
    actions.push({
      label: "Agregar línea manual",
      icon: "fas fa-plus",
      primary: emptyKind.value === "no-data",
      onClick: () => emit("agregarLinea"),
    });
  }
  return actions;
});

function emitReload(): void {
  emit("reload", soloRevision.value);
}

function emitVerDocumentoLinea(l: LineaContableDto): void {
  emit("verDocumentoLinea", l);
}

function onGuardar(lineaId: string, data: Record<string, unknown>): void {
  emit("patchLinea", lineaId, { version: props.casoVersion, ...data });
}

function onAprobar(lineaId: string): void {
  emit("approveLinea", lineaId);
}

function onEliminar(linea: LineaContableDto): void {
  emit("eliminarLinea", linea);
}
</script>

<style scoped>
.lines-workspace {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.lines-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.lines-summary__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--ink-soft);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.lines-summary__chip:hover:not(:disabled) {
  border-color: var(--line-2);
}

.lines-summary__chip--active {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 22%, transparent);
}

.lines-summary__chip:disabled {
  cursor: default;
  opacity: 0.65;
}

.lines-summary__chip strong {
  color: var(--ink);
  font-weight: 700;
}

.lines-summary__chip--ok {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
  background: var(--ok-bg);
  color: var(--ok);
}

.lines-summary__chip--pending {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--line));
  background: var(--warn-bg);
  color: var(--warn);
}

.lines-summary__chip--critical {
  border-color: color-mix(in srgb, var(--bad) 35%, var(--line));
  background: var(--bad-bg);
  color: var(--bad);
}

.lines-summary__chip--warn {
  border-color: color-mix(in srgb, var(--warn) 35%, var(--line));
  background: color-mix(in srgb, var(--warn) 10%, var(--panel));
  color: var(--warn);
}

.lines-summary__chip--dup {
  border-color: color-mix(in srgb, #6366f1 35%, var(--line));
  background: color-mix(in srgb, #6366f1 10%, var(--panel));
  color: #4338ca;
}

.lines-summary__chip-sub {
  display: block;
  font-size: 0.68rem;
  font-weight: 500;
  opacity: 0.85;
}

.lines-dup-hint {
  margin: 0 0 0.75rem;
  padding: 0.55rem 0.75rem;
  font-size: 0.82rem;
  border-radius: 8px;
  background: color-mix(in srgb, #6366f1 10%, var(--panel));
  border: 1px solid color-mix(in srgb, #6366f1 25%, var(--line));
  color: var(--text, #334155);
}

.lines-dup-hint .link-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: #4338ca;
  text-decoration: underline;
  cursor: pointer;
}

.lines-summary__chip--neutral {
  background: var(--panel-2);
}

.lines-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--line);
}

.lines-toolbar__left {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.lines-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--ink-soft);
  cursor: pointer;
  user-select: none;
}

.lines-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2.5rem 1.5rem;
  min-height: 280px;
  border-radius: 12px;
  border: 1px dashed var(--line-2);
  background: var(--panel-2);
}

.lines-empty--all-done {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line-2));
  background: color-mix(in srgb, var(--ok) 6%, var(--panel-2));
}

.lines-empty__icon {
  width: 3.25rem;
  height: 3.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 1.35rem;
  margin-bottom: 0.85rem;
}

.lines-empty--all-done .lines-empty__icon {
  background: var(--ok-bg);
  color: var(--ok);
}

.lines-empty__title {
  margin: 0 0 0.4rem;
  font-size: 1.05rem;
  color: var(--ink);
}

.lines-empty__desc {
  margin: 0;
  max-width: 28rem;
  font-size: 0.84rem;
  line-height: 1.5;
  color: var(--ink-soft);
}

.lines-empty__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 1.1rem;
}

.lines-sections {
  display: grid;
  gap: 1rem;
}

.lines-section {
  border-radius: 10px;
  border: 1px solid var(--line);
  overflow: hidden;
}

.lines-section--critical {
  border-color: color-mix(in srgb, var(--bad) 30%, var(--line));
}

.lines-section--subtotales {
  border-color: color-mix(in srgb, var(--muted) 40%, var(--line));
  opacity: 0.92;
}

.lines-section--subtotales .lines-section__head h3 {
  color: var(--muted);
  font-weight: 600;
}

.lines-section--review {
  border-color: color-mix(in srgb, var(--warn) 30%, var(--line));
}

.lines-section--ok {
  border-color: color-mix(in srgb, var(--ok) 25%, var(--line));
  opacity: 0.95;
}

.lines-section__head {
  padding: 0.65rem 0.85rem;
  background: var(--panel-2);
  border-bottom: 1px solid var(--line);
}

.lines-section__head h3 {
  margin: 0;
  font-size: 0.88rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.lines-section--critical .lines-section__head h3 {
  color: var(--bad);
}

.lines-section--review .lines-section__head h3 {
  color: var(--warn);
}

.lines-section--ok .lines-section__head h3 {
  color: var(--ok);
}

.lines-section__head p {
  margin: 0.25rem 0 0;
  font-size: 0.76rem;
  color: var(--ink-soft);
  line-height: 1.4;
}

.panel-feedback {
  margin: 0;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  font-size: 0.82rem;
}

.panel-feedback--ok {
  background: var(--ok-bg);
  color: var(--ok);
  border: 1px solid color-mix(in srgb, var(--ok) 30%, var(--line));
}

.panel-feedback--err {
  background: var(--bad-bg);
  color: var(--bad);
  border: 1px solid color-mix(in srgb, var(--bad) 25%, var(--line));
}

.lines-sections--plan {
  gap: 1rem;
}

.balance-totales-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0 0 0.35rem;
  margin-bottom: 0.15rem;
}

.balance-totales__preview {
  margin: 0;
  font-size: 0.72rem;
  color: var(--warn);
  font-weight: 600;
}

.balance-totales__diff {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--bad, #dc2626);
}

.balance-impacto-details {
  font-size: 0.72rem;
}

.balance-impacto-details__summary {
  cursor: pointer;
  color: var(--ink-soft);
  font-weight: 600;
  padding: 0.15rem 0;
  list-style: none;
}

.balance-impacto-details__summary::-webkit-details-marker {
  display: none;
}

.balance-impacto-details__list {
  margin: 0.25rem 0 0;
  padding: 0;
  list-style: none;
}

.balance-impacto-details__btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.2rem 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--ink-soft);
}

.balance-impacto-details__btn:hover {
  color: var(--brand);
}

.balance-impacto-details__concepto {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.balance-impacto-details__monto {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.balance-strip {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
  overflow: hidden;
}

.balance-strip--ok {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
}

.balance-strip--fail {
  border-color: color-mix(in srgb, var(--bad) 35%, var(--line));
}

.balance-strip__head {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--brand) 5%, var(--panel));
}

.balance-strip__head-row {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem 1.25rem;
}

.balance-strip__head-left {
  min-width: 0;
}

.balance-strip__empresa {
  margin: 0;
  text-align: center;
  font-size: clamp(1rem, 1.8vw, 1.35rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--brand-ink, var(--ink));
  word-break: break-word;
}

.balance-strip__title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--brand-ink);
}

.balance-strip__subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.balance-strip__subtitle-note {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.68rem;
  color: var(--ink-faint);
}

.balance-strip__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: stretch;
  gap: 0.45rem;
  padding: 0.55rem 0.65rem 0.65rem;
}

.balance-strip__card {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.5rem 0.55rem;
  border-radius: 8px;
  background: var(--panel);
  border: 1px solid var(--line);
}

.balance-strip__verdict-icon {
  flex-shrink: 0;
  margin-top: 0.1rem;
  font-size: 1rem;
}

.balance-strip__card--activo .balance-strip__badge {
  background: #047857;
}

.balance-strip__card--pasivo .balance-strip__badge {
  background: #b45309;
}

.balance-strip__card--patrimonio .balance-strip__badge {
  background: #6d28d9;
}

.balance-strip__card--verdict {
  grid-column: span 1;
  border-width: 1px;
}

.balance-strip__card--verdict-ok {
  border-color: color-mix(in srgb, var(--ok) 40%, var(--line));
  background: color-mix(in srgb, var(--ok) 8%, var(--panel));
  color: var(--ok);
}

.balance-strip__card--verdict-fail {
  border-color: color-mix(in srgb, var(--bad) 40%, var(--line));
  background: color-mix(in srgb, var(--bad) 8%, var(--panel));
}

.balance-strip__badge {
  flex-shrink: 0;
  width: 1.35rem;
  height: 1.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
}

.balance-strip__card-body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.balance-strip__label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}

.balance-strip__value {
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  line-height: 1.25;
}

.balance-strip__value--ok {
  color: var(--ok);
}

.balance-strip__value--fail {
  color: var(--bad, #dc2626);
}

.balance-strip__diff {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--bad, #dc2626);
}

.balance-strip__diff-pct {
  font-weight: 700;
  color: var(--ink-soft);
  white-space: nowrap;
}

.balance-strip__rhs {
  font-size: 0.68rem;
  color: var(--ink-soft);
  line-height: 1.3;
}

.balance-strip__info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0 0.65rem 0.65rem;
  border-top: 1px dashed var(--line);
  margin-top: -0.15rem;
  padding-top: 0.55rem;
}

.balance-strip__info-item {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  flex: 1 1 14rem;
  min-width: 0;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px dashed color-mix(in srgb, var(--ink-faint) 35%, var(--line));
  background: color-mix(in srgb, var(--panel-2) 70%, var(--panel));
}

.balance-strip__info-item--resultados .balance-strip__badge {
  background: #0369a1;
}

.balance-strip__info-item--sin-rubro .balance-strip__badge--muted {
  background: var(--ink-faint);
  font-size: 0.55rem;
}

.balance-strip__info-hint {
  font-size: 0.65rem;
  color: var(--ink-soft);
  line-height: 1.35;
}

@media (max-width: 900px) {
  .balance-strip__grid {
    grid-template-columns: 1fr 1fr;
  }

  .balance-strip__card--verdict {
    grid-column: 1 / -1;
  }
}

.balance-totales {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
}

.balance-totales__card {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel-2);
  min-width: 0;
}

.balance-totales__num {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}

.balance-totales__card--activo .balance-totales__num {
  background: #047857;
}

.balance-totales__card--pasivo .balance-totales__num {
  background: #b45309;
}

.balance-totales__card--patrimonio .balance-totales__num {
  background: #6d28d9;
}

.balance-totales__label {
  display: block;
  font-size: 0.72rem;
  color: var(--ink-soft);
  margin-bottom: 0.15rem;
}

.balance-totales__value {
  display: block;
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.balance-totales__value--sm {
  font-size: 0.78rem;
  line-height: 1.35;
}

.balance-totales__card--cuadra {
  grid-column: span 1;
}

.balance-totales__card--ok {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
  background: var(--ok-bg);
  color: var(--ok);
}

.balance-totales__card--fail {
  border-color: color-mix(in srgb, var(--bad) 35%, var(--line));
  background: var(--bad-bg);
  color: var(--bad);
}

.balance-totales__card--cuadra i {
  margin-top: 0.15rem;
  font-size: 1.1rem;
}

.lines-section--plan-grupo {
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}

.lines-section__head--plan {
  padding: 0.55rem 0.85rem;
  margin: 0;
  background: var(--panel-2);
  border-bottom: 1px solid var(--line);
}

.lines-section__head--plan h3 {
  margin: 0;
  font-size: 0.88rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.lines-section__plan-num {
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

.lines-section--estado-1 .lines-section__plan-num {
  background: #047857;
}

.lines-section--estado-2 .lines-section__plan-num {
  background: #b45309;
}

.lines-section--estado-3 .lines-section__plan-num {
  background: #6d28d9;
}

.lines-section--estado-4 .lines-section__plan-num {
  background: #0369a1;
}

.lines-grupo-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.85rem;
  border-top: 2px solid var(--line);
  background: color-mix(in srgb, var(--brand) 5%, var(--panel-2));
  font-size: 0.82rem;
  color: var(--ink-soft);
}

.lines-grupo-total strong {
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

@media (max-width: 900px) {
  .balance-totales {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .balance-totales {
    grid-template-columns: 1fr;
  }
}
</style>
