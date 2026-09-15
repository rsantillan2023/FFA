<template>
  <div class="revision-view">
    <div v-if="loading" class="loading">Cargando estación de revisión…</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>
    <div v-else-if="caso && documento">
    <PageHeader
      page-key="revision"
      :title="`Revisión — ${caso.numero}`"
      subtitle=""
      :back-link="{ to: '/casos', label: '← Bandeja de fichas' }"
    >
      <template #actions>
        <button class="btn btn-ghost" type="button" @click="openDocumentoModal()">
          Ver documento
        </button>
        <button class="btn btn-ghost" type="button" @click="extraccionIaOpen = true">
          Texto extraído por IA
        </button>
        <button
          v-if="!fichaCerrada"
          class="btn btn-ghost"
          type="button"
          @click="accionesAvanzadasOpen = true"
        >
          Acciones avanzadas
        </button>
        <RouterLink
          v-if="caso.estado === 'aprobado' || caso.estado === 'informe_generado'"
          :to="`/casos/${casoId}/informe`"
          class="btn btn-ghost"
        >
          Informe
        </RouterLink>
      </template>
    </PageHeader>

    <ProvenanceFallbackBanner :provenance="provenanceCaso" />

    <aside
      v-if="clasificacionIaMasivaLoading"
      class="revision-ia-banner-top revision-ia-live"
      role="status"
      aria-live="polite"
      aria-label="Clasificación con inteligencia artificial en curso"
    >
      <div class="revision-ia-live__head">
        <div class="revision-ia-live__spinner" aria-hidden="true">
          <i class="fas fa-wand-magic-sparkles fa-spin"></i>
        </div>
        <div class="revision-ia-live__main">
          <p class="revision-ia-banner-top__title">
            <strong>Estoy procesando las líneas dudosas con IA</strong>
            <span v-if="clasificacionIaProgresoTotal > 0" class="revision-ia-live__count">
              {{ clasificacionIaProgresoActual }}/{{ clasificacionIaProgresoTotal }}
            </span>
          </p>
          <p class="revision-ia-banner-top__hint">
            Podés seguir revisando lo que ya quedó listo o volver más tarde para ver todos los resultados.
          </p>
          <p v-if="iaLineaEnCurso" class="revision-ia-live__curso">
            Ahora: {{ truncarDenominacion(iaLineaEnCurso.denominacionOriginal, 64) }}
          </p>
          <p v-else-if="clasificacionIaTrabajandoEtapa" class="revision-ia-live__curso revision-ia-live__curso--muted">
            {{ clasificacionIaTrabajandoEtapa }}
          </p>
        </div>
      </div>
      <ul v-if="iaUltimasLineas.length" class="revision-ia-live__feed">
        <li
          v-for="ev in iaUltimasLineas.slice(0, 5)"
          :key="`${ev.lineaId}-${ev.at}`"
          class="revision-ia-live__feed-item"
          :class="{
            'revision-ia-live__feed-item--ok': ev.estado === 'ok',
            'revision-ia-live__feed-item--err': ev.estado === 'error',
          }"
        >
          <i
            :class="
              ev.estado === 'ok'
                ? 'fas fa-check'
                : ev.estado === 'error'
                  ? 'fas fa-xmark'
                  : 'fas fa-spinner fa-spin'
            "
            aria-hidden="true"
          ></i>
          <span class="revision-ia-live__feed-concepto">{{
            truncarDenominacion(ev.denominacionOriginal, 40)
          }}</span>
          <span v-if="ev.rubroCodigo" class="revision-ia-live__feed-rubro">{{ ev.rubroCodigo }}</span>
        </li>
      </ul>
      <button
        v-if="revisionActiveStep !== 1 && !fichaCerrada"
        type="button"
        class="btn btn-ghost btn-sm revision-ia-banner-top__goto"
        @click="goRevisionStep(1)"
      >
        Ir a las líneas
      </button>
    </aside>

    <RevisionStepNav
      v-if="!fichaCerrada"
      :steps="revisionSteps"
      :active-step="revisionActiveStep"
      @go="goRevisionStep"
    />

    <div v-if="caso.estado === 'pendiente_calidad'" class="card alert-calidad">
      <p>Extracción automática no fue posible. Use <strong>carga manual</strong> de líneas (J.21).</p>
      <button class="btn btn-primary" type="button" @click="iniciarCargaManual">
        Iniciar carga manual
      </button>
    </div>

    <div class="revision-unified" :class="{ 'revision-unified--with-footer': !fichaCerrada }">
    <!-- Identificación -->
    <section
      v-show="revisionActiveStep === 0 || fichaCerrada"
      id="revision-identificacion"
      class="card revision-section revision-ident-unified"
      :class="{
        'revision-ident-unified--ok': metaVerificado,
        'revision-ident-unified--warn': !metaVerificado && metaCompleto,
        'revision-ident-unified--err': !metaCompleto,
      }"
    >
      <header
        class="revision-ident-unified__head"
        :class="{ 'revision-ident-unified__head--no-empresa': !empresaTitular }"
      >
        <div class="revision-ident-unified__head-left">
          <h2>Identificación del expediente</h2>
          <p class="revision-ident-unified__ref">
            {{ metaReferenciaDisplay }}
            <span v-if="caso.numero" class="revision-ident-unified__num">{{ caso.numero }}</span>
          </p>
          <p class="revision-ident-unified__doc" :title="documento.nombreOriginal">
            <i class="fas fa-file-pdf" aria-hidden="true"></i>
            {{ documento.nombreOriginal }}
          </p>
        </div>
        <p v-if="empresaTitular" class="revision-empresa-titulo" :title="empresaTitular">
          {{ empresaTitular }}
        </p>
        <span
          v-if="!fichaCerrada"
          class="meta-status revision-ident-unified__status"
          :class="{
            'meta-status--ok': metaVerificado,
            'meta-status--warn': !metaVerificado && metaDirty && metaGuardadoSnapshot,
            'meta-status--pending': !metaVerificado && !(metaDirty && metaGuardadoSnapshot),
          }"
        >
          <i
            :class="
              metaVerificado
                ? 'fas fa-circle-check'
                : metaDirty && metaGuardadoSnapshot
                  ? 'fas fa-pen'
                  : 'fas fa-triangle-exclamation'
            "
            aria-hidden="true"
          ></i>
          {{
            metaVerificado
              ? "Verificado"
              : metaDirty && metaGuardadoSnapshot
                ? "Sin confirmar"
                : "Pendiente"
          }}
        </span>
      </header>
      <p v-if="!metaVerificado && !fichaCerrada" class="revision-ident-unified__hint">
        Datos inferidos del PDF — revisá los campos y confirmá antes de cerrar la revisión.
      </p>
      <p v-if="metaCamposFaltantes.length" class="meta-missing-banner" role="alert">
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        Completá o corregí los campos marcados en rojo:
        <strong>{{ metaCamposFaltantes.join(", ") }}</strong>
      </p>
      <div class="meta-fields">
        <div class="meta-field" :class="{ 'meta-field--error': !metaMoneda.trim() }">
          <label class="label" for="meta-moneda">Moneda <span v-if="!metaMoneda.trim()" class="req">*</span></label>
          <select
            id="meta-moneda"
            v-model="metaMoneda"
            class="input"
            :class="{ 'input--error': !metaMoneda.trim() }"
          >
            <option value="">— Seleccionar moneda —</option>
            <option v-for="m in MONEDAS_OPCIONES" :key="m.codigo" :value="m.codigo">
              {{ m.codigo }} — {{ m.nombre }}
            </option>
          </select>
          <p class="meta-field__hint">Moneda en la que están expresados los montos del balance (ISO 4217).</p>
        </div>
        <div class="meta-field" :class="{ 'meta-field--error': metaEscala === 'indeterminada' }">
          <label class="label" for="meta-escala">Escala <span v-if="metaEscala === 'indeterminada'" class="req">*</span></label>
          <select
            id="meta-escala"
            v-model="metaEscala"
            class="input"
            :class="{ 'input--error': metaEscala === 'indeterminada' }"
          >
            <option value="indeterminada">— Indeterminada (requiere corrección) —</option>
          <option value="unidades">Unidades</option>
          <option value="miles">Miles</option>
          <option value="millones">Millones</option>
        </select>
          <p class="meta-field__hint">Factor de escala leído del documento (miles, millones, etc.).</p>
        </div>
        <div
          class="meta-field"
          :class="{ 'meta-field--error': metaEjercicio == null || Number.isNaN(metaEjercicio) }"
        >
          <label class="label" for="meta-ejercicio">
            Ejercicio fiscal
            <span v-if="metaEjercicio == null || Number.isNaN(metaEjercicio)" class="req">*</span>
          </label>
          <input
            id="meta-ejercicio"
            v-model.number="metaEjercicio"
            class="input"
            type="number"
            placeholder="2025"
            :class="{ 'input--error': metaEjercicio == null || Number.isNaN(metaEjercicio) }"
          />
          <p class="meta-field__hint">Año del período contable que estás revisando.</p>
        </div>
        <div class="meta-field" :class="{ 'meta-field--error': !metaRazonSocial.trim() }">
          <label class="label" for="meta-razon">
            Razón social <span v-if="!metaRazonSocial.trim()" class="req">*</span>
          </label>
          <input
            id="meta-razon"
            v-model="metaRazonSocial"
            class="input"
            placeholder="Nombre de la empresa"
            :class="{ 'input--error': !metaRazonSocial.trim() }"
          />
          <p class="meta-field__hint">Empresa titular del balance, según el PDF.</p>
        </div>
        <div class="meta-field">
          <label class="label" for="meta-rut">RUT</label>
          <input id="meta-rut" v-model="metaRut" class="input" placeholder="12.345.678-9" />
          <p class="meta-field__hint">Identificador tributario extraído o corregido manualmente (opcional).</p>
        </div>
      </div>
      <div class="meta-actions">
        <button
          class="btn btn-primary"
          type="button"
          :disabled="metaSaving || !metaCompleto"
          @click="guardarMetadatos"
        >
          {{ metaSaving ? "Confirmando…" : "Confirmar identificación" }}
        </button>
        <button
          class="btn btn-ghost"
          type="button"
          :disabled="metaReextrayendo || extractionProvider === 'mock'"
          :title="extractionProvider === 'mock' ? 'Configure OpenAI en Admin → Operación' : undefined"
          @click="reextraerMetadatosIa"
        >
          <i v-if="metaReextrayendo" class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {{ metaReextrayendo ? "Leyendo PDF…" : "Re-leer del PDF con IA" }}
        </button>
        <button
          v-if="consolidables.length || fichaHistorial.length"
          class="btn btn-ghost"
          type="button"
          @click="historialModalOpen = true"
        >
          Historial
        </button>
      </div>
      <p v-if="extractionProvider === 'mock'" class="meta-provider-warn">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        La lectura automática del PDF no está activa. Configurá <strong>OpenAI</strong> en Admin →
        Operación y usá «Re-leer del PDF con IA» para obtener los datos desde el documento.
      </p>
      <p v-if="metaStepMsg" class="step-inline-msg step-inline-msg--ok">{{ metaStepMsg }}</p>
      <p v-if="metaStepError" class="step-inline-msg step-inline-msg--err">{{ metaStepError }}</p>
    </section>

    <!-- Líneas -->
    <section
      v-show="revisionActiveStep >= 1 || fichaCerrada"
      id="revision-lineas"
      class="card revision-section"
      :class="{ 'revision-lineas--locked': !metaVerificado && !fichaCerrada }"
    >
      <div v-if="!metaVerificado && !fichaCerrada" class="revision-step-gate" role="status">
        <i class="fas fa-lock" aria-hidden="true"></i>
        Confirmá la identificación en el paso 1 para editar líneas y cuadratura.
        <button class="btn btn-sm btn-primary" type="button" @click="goRevisionStep(0)">Ir a identificación</button>
        </div>

      <div
        class="revision-lineas-layout"
        :class="{ 'revision-lineas-layout--split': splitViewDoc && documento }"
      >
        <aside v-if="splitViewDoc && documento" class="revision-lineas-layout__doc">
          <DocumentoOrigenModal
            embedded
            :model-value="true"
            :document-url="docUrl"
            :mime-type="documento.mimeType"
            :initial-page="docModalLine?.paginaNumero"
            :highlight-bbox="docModalLine?.bbox ?? null"
            :highlight-page="docModalLine?.paginaNumero"
            :line-label="docModalLine ? `${docModalLine.denominacionOriginal} · pág. ${docModalLine.paginaNumero}` : documento.nombreOriginal"
          />
        </aside>
        <div class="revision-lineas-layout__main">
      <header class="revision-section__head revision-section__head--lineas">
        <div class="revision-section__head-main">
          <div
            class="revision-section__head-row revision-section__head-row--with-empresa"
            :class="{ 'revision-section__head-row--no-empresa': !empresaTitular }"
          >
            <h2>Líneas contables</h2>
            <p v-if="empresaTitular" class="revision-empresa-titulo" :title="empresaTitular">
              {{ empresaTitular }}
            </p>
            <div v-if="!fichaCerrada" class="revision-section__head-actions">
              <button
                class="btn btn-ghost btn-sm"
                type="button"
                :title="splitViewDoc ? 'Ocultar panel PDF' : 'Mostrar PDF junto a las líneas'"
                @click="splitViewDoc = !splitViewDoc"
              >
                <i :class="splitViewDoc ? 'fas fa-columns' : 'fas fa-table-columns'" aria-hidden="true"></i>
                {{ splitViewDoc ? "Ocultar PDF" : "Vista dividida PDF" }}
            </button>
              <button
                v-if="metaVerificado && lineasDuplicadasCount > 0"
                class="btn btn-ghost btn-sm"
                type="button"
                :disabled="eliminarDuplicadosLoading"
                :title="`Eliminar ${lineasDuplicadasCount} fila(s) duplicada(s) en ${lineasDuplicadosGrupos} grupo(s)`"
                @click="onEliminarDuplicados"
              >
                <i class="fas fa-clone" aria-hidden="true"></i>
                {{ eliminarDuplicadosLoading ? "Eliminando…" : "Eliminar duplicados" }}
                <span class="revision-ia-masiva-btn__count">{{ lineasDuplicadasCount }}</span>
            </button>
              <button
                v-if="metaVerificado"
                class="btn btn-sm revision-ia-masiva-btn"
                type="button"
                :disabled="clasificacionIaMasivaLoading || lineasDudosasIaCount === 0"
                :title="
                  clasificacionIaMasivaLoading
                    ? 'Clasificando con IA…'
                    : lineasDudosasIaCount === 0
                      ? 'No hay líneas dudosas — revisá o corregí manualmente primero'
                      : 'Clasificar líneas dudosas con IA (sin rubro y baja confianza)'
                "
                @click="openClasificacionIaConfirm"
              >
                <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
                {{ clasificacionIaMasivaLoading ? "Clasificando…" : "Clasificar dudosas con IA" }}
                <span v-if="lineasDudosasIaCount > 0 && !clasificacionIaMasivaLoading" class="revision-ia-masiva-btn__count">
                  {{ lineasDudosasIaCount }}
          </span>
              </button>
        <button
                class="btn btn-primary btn-sm"
          type="button"
                @click="openAgregarLineaModal"
        >
                <i class="fas fa-plus" aria-hidden="true"></i>
                Agregar línea
        </button>
            </div>
          </div>
          <p v-if="metaVerificado && !fichaCerrada && !clasificacionIaMasivaLoading" class="revision-lineas-hint">
            Revisá, agregá o eliminá filas a mano. La IA solo corre cuando pedís
            <strong>Clasificar dudosas con IA</strong>.
          </p>
        </div>
      </header>

      <RevisionOrigenPanel v-if="lineas.length" :lineas="lineas" :open-by-default="false" />

      <BalanceDiagnosticoPanel
        v-if="lineas.length && metaVerificado"
        :visible="true"
        :open-by-default="!totalesBalanceRevision?.cuadraturaOk"
        :loading="balanceAnalisisLoading"
        :reconciliando="balanceReconciliarLoading"
        :error="balanceAnalisisError"
        :mensaje="balanceReconciliarMsg"
        :analisis="balanceAnalisis"
        :editable="!fichaCerrada"
        @analizar="onAnalizarBalance"
        @reconciliar="onReconciliarBalance"
      />

      <RevisionSplitView
        unificado
        orden-por-plan
        :allow-manual="!fichaCerrada && metaVerificado"
        :allow-delete="!fichaCerrada && metaVerificado"
        :caso-id="casoId"
        :lineas="lineas"
        :rubros="rubros"
        :moneda="metaMoneda"
        :caso-version="caso.version ?? 0"
        :lineas-pendientes="lineasPendientesCount"
        :total-lineas="caso.lineasCount ?? 0"
        :panel-msg="lineaPanelMsg"
        :panel-error="lineaPanelError"
        :ia-clasificacion-activa="clasificacionIaMasivaLoading"
        :ia-linea-en-curso-id="iaLineaEnCurso?.lineaId"
        :ia-lineas-recientes-ids="iaLineasRecientesIds"
        :lineas-impacto-cuadratura="lineasImpactoCuadratura"
        :razon-social="empresaTitular"
        @reload="loadLineas"
        @patch-linea="onPatchLinea"
        @approve-linea="onApproveLinea"
        @eliminar-linea="onEliminarLinea"
        @reclasificar-masiva="onReclasificarMasiva"
        @agregar-linea="openAgregarLineaModal"
        @ver-documento="openDocumentoModal()"
        @ver-documento-linea="openDocumentoModal"
        @draft-overrides-change="onDraftOverridesChange"
        @ia-aplicada="onIaAplicada"
        @scroll-linea="scrollToLineaRevision"
      />
        </div>
      </div>
    </section>

    <!-- Observaciones -->
    <section
      v-if="!fichaCerrada && (revisionActiveStep >= 1 || fichaCerrada)"
      class="card revision-section revision-section--obs"
    >
      <label class="label" for="revision-observaciones">Observaciones del analista</label>
      <textarea
        id="revision-observaciones"
        v-model="observaciones"
        class="input obs"
        rows="3"
        placeholder="Opcional — quedan registradas en la ficha y el expediente"
      />
    </section>
    </div>

    <footer v-if="!fichaCerrada" class="revision-form-footer">
      <div class="revision-form-footer__status" role="status">
        <span class="revision-form-footer__chip" :class="metaVerificado ? 'revision-form-footer__chip--ok' : 'revision-form-footer__chip--fail'">
          <i :class="metaVerificado ? 'fas fa-circle-check' : 'fas fa-circle-xmark'" aria-hidden="true"></i>
          Identificación
        </span>
        <span
          class="revision-form-footer__chip"
          :class="validacionesPendientes.length === 0 ? 'revision-form-footer__chip--ok' : 'revision-form-footer__chip--warn'"
        >
          <i :class="validacionesPendientes.length === 0 ? 'fas fa-circle-check' : 'fas fa-circle-exclamation'" aria-hidden="true"></i>
          {{ validacionesPendientes.length === 0 ? "Validaciones OK" : `${validacionesPendientes.length} validación(es) pendiente(s)` }}
        </span>
        <span
          class="revision-form-footer__chip"
          :class="lineasPendientesCount === 0 ? 'revision-form-footer__chip--ok' : 'revision-form-footer__chip--warn'"
        >
          <i :class="lineasPendientesCount === 0 ? 'fas fa-circle-check' : 'fas fa-circle-exclamation'" aria-hidden="true"></i>
          {{ lineasPendientesCount === 0 ? "Líneas OK" : `${lineasPendientesCount} línea(s) pendiente(s)` }}
        </span>
      </div>
      <div class="revision-form-footer__actions">
        <button
          class="btn btn-primary"
          type="button"
          :disabled="approving || caso.estado === 'informe_generado' || resolverPendientesLoading"
          @click="openCerrarRevisionModal"
        >
          {{
            resolverPendientesLoading ? resolverPendientesEtapa || "Cerrando…" : "Cerrar revisión"
          }}
        </button>
      </div>
      </footer>

    <footer v-else class="revision-form-footer revision-form-footer--closed">
      <button class="btn btn-primary" type="button" @click="openAprobarModal">
        Ver ficha aprobada
      </button>
    </footer>

    <CreateFormModal
      v-if="accionesAvanzadasOpen && caso"
      v-model="accionesAvanzadasOpen"
      title="Acciones avanzadas"
      :subtitle="caso.numero"
    >
      <div class="modal-form revision-modal acciones-avanzadas">
        <p class="revision-modal__hint">Operaciones poco frecuentes — usalas solo si sabés qué hacen.</p>
        <ul class="acciones-avanzadas__list">
          <li>
            <button class="btn btn-ghost acciones-avanzadas__btn" type="button" @click="accionAvanzadaEvaluar">
              <i class="fas fa-clipboard-check" aria-hidden="true"></i>
              Evaluar validaciones
              <span v-if="validacionesPendientes.length" class="revision-form-footer__badge">
                {{ validacionesPendientes.length }}
              </span>
            </button>
          </li>
          <li v-if="caso.estado === 'en_revision'">
            <button class="btn btn-ghost acciones-avanzadas__btn" type="button" @click="accionAvanzadaReprocesar">
              <i class="fas fa-rotate-right" aria-hidden="true"></i>
              Reprocesar documento
            </button>
          </li>
          <li>
            <button class="btn btn-ghost acciones-avanzadas__btn" type="button" @click="accionAvanzadaReclasificar">
              <i class="fas fa-arrows-rotate" aria-hidden="true"></i>
              Reclasificar rubros y validar
            </button>
          </li>
          <li v-if="showReinicioFojaCero">
            <button
              class="btn btn-ghost acciones-avanzadas__btn acciones-avanzadas__btn--danger"
              type="button"
              @click="accionAvanzadaReinicio"
            >
              <i class="fas fa-backward-step" aria-hidden="true"></i>
              Reiniciar a foja cero
            </button>
          </li>
        </ul>
        </div>
    </CreateFormModal>

    <CreateFormModal
      v-if="cerrarRevisionModalOpen && caso"
      v-model="cerrarRevisionModalOpen"
      title="Cerrar revisión"
      :subtitle="`${caso.numero}${caso.referencia ? ` · ${caso.referencia}` : ''}`"
    >
      <div class="modal-form revision-modal">
        <div class="revision-modal__box">
          <h4>Estado actual</h4>
          <ul class="revision-modal__list">
            <li>
              <strong>Identificación:</strong>
              {{ metaVerificado ? "Confirmada" : "Pendiente — requerida para cerrar" }}
        </li>
            <li>
              <strong>Líneas:</strong>
              {{
                lineasPendientesCount === 0
                  ? "Todas revisadas"
                  : `${lineasPendientesCount} pendiente(s)`
              }}
        </li>
            <li>
              <strong>Validaciones:</strong>
              {{
                validacionesPendientes.length === 0
                  ? "OK"
                  : `${validacionesPendientes.length} pendiente(s)`
              }}
            </li>
            <li v-if="totalesBalanceRevision">
              <strong>Cuadratura:</strong>
              {{ totalesBalanceRevision.cuadraturaOk ? "OK (1 = 2 + 3)" : "No cierra" }}
        </li>
      </ul>
        </div>

        <template v-if="aprobarListo">
          <p class="revision-modal__ok-hint">
            <i class="fas fa-circle-check" aria-hidden="true"></i>
            Todo en orden — podés cerrar con ficha completa.
          </p>
        </template>

        <template v-else>
          <p class="revision-modal__lead">
            Aún hay pendientes. Podés <strong>cerrar con observaciones</strong> y generar la ficha con lo revisado
            hasta acá.
          </p>
          <div class="revision-modal__box revision-modal__box--muted">
            <label class="label" for="motivo-cierre-parcial">Motivo del cierre (obligatorio)</label>
            <textarea
              id="motivo-cierre-parcial"
              v-model="motivoCierreParcial"
              class="input obs"
              rows="2"
              placeholder="Ej.: plazo de comité, documento incompleto, cuadratura no prioritaria…"
            />
            <label class="cerrar-parcial-check">
              <input v-model="cierreParcialAceptaIdentificacion" type="checkbox" />
              Confirmo que revisé la identificación del expediente
            </label>
            <label class="cerrar-parcial-check">
              <input v-model="cierreParcialAceptaPendientes" type="checkbox" />
              Acepto cerrar con líneas, validaciones o cuadratura pendientes
            </label>
          </div>
          <div class="revision-modal__warn">
            Quedará registrado como <strong>cierre parcial</strong> en la ficha y el informe.
          </div>
        </template>

        <p v-if="cerrarRevisionError" class="error-msg">{{ cerrarRevisionError }}</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" type="button" @click="cerrarRevisionModalOpen = false">
          Cancelar
        </button>
        <button
          v-if="aprobarListo"
          class="btn btn-primary"
          type="button"
          :disabled="approving"
          @click="proceedCierreCompleto"
        >
          Cerrar con ficha completa
        </button>
        <button
          v-else
          class="btn btn-primary"
          type="button"
          :disabled="!cierreParcialFormValido || resolverPendientesLoading || approving"
          @click="confirmCierreParcial"
        >
          {{ resolverPendientesLoading ? "Cerrando…" : "Cerrar con observaciones" }}
        </button>
      </template>
    </CreateFormModal>

    <CreateFormModal
      v-model="historialModalOpen"
      title="Historial"
      :subtitle="caso ? `${caso.numero}${caso.referencia ? ` · ${caso.referencia}` : ''}` : undefined"
    >
      <div class="modal-form revision-modal historial-modal">
        <article v-if="consolidables.length" class="historial-modal__card">
          <h4>Consolidar documentos duplicados</h4>
          <p class="historial-modal__desc">
            Si el mismo contribuyente cargó más de un PDF para este período, podés unir los archivos en este
            expediente. Las líneas del otro caso pasan acá; el caso origen queda archivado.
          </p>
          <ul class="historial-modal__list">
            <li v-for="c in consolidables" :key="c.id" class="historial-modal__row">
              <span>
                <strong>{{ c.numero }}</strong>
                · {{ c.documentosCount }} documento(s)
              </span>
              <button class="btn btn-ghost btn-sm" type="button" @click="onConsolidar(c.id)">
                Fusionar en este caso
              </button>
            </li>
          </ul>
        </article>
        <article v-if="fichaHistorial.length" class="historial-modal__card">
          <h4>Historial de fichas aprobadas</h4>
          <p class="historial-modal__desc">
            Versiones anteriores de la ficha canónica de este caso. Sirve para auditar cambios entre revisiones.
          </p>
          <ul class="historial-modal__list">
            <li v-for="h in fichaHistorial" :key="h.id" class="historial-modal__row">
              <span>
                Versión <strong>v{{ h.version }}</strong>
                · {{ h.estado }}
                · {{ h.aprobadaAt ? formatDate(h.aprobadaAt) : "sin fecha de aprobación" }}
              </span>
            </li>
          </ul>
        </article>
        <div class="modal-form__actions">
          <button class="btn btn-primary" type="button" @click="historialModalOpen = false">Cerrar</button>
        </div>
      </div>
    </CreateFormModal>

    <CreateFormModal
      v-if="reinicioModalOpen"
      v-model="reinicioModalOpen"
      title="Reiniciar a foja cero"
      :subtitle="caso ? `${caso.numero}${caso.referencia ? ` · ${caso.referencia}` : ''}` : ''"
    >
      <div class="reinicio-modal">
        <p class="reinicio-modal__lead">
          El sistema <strong>vuelve a leer el PDF con IA</strong> y arranca todo como una carga nueva.
          La ficha y el informe actuales quedan <strong>archivados</strong>.
        </p>
        <ul class="reinicio-modal__list">
          <li>Preproceso, extracción IA, clasificación y validación desde cero</li>
          <li>Se borran líneas y metadatos extraídos anteriormente</li>
          <li>Habrá que aprobar de nuevo para generar un informe nuevo</li>
        </ul>
        <label class="label" for="rev-reinicio-motivo">Motivo (opcional)</label>
        <textarea
          id="rev-reinicio-motivo"
          v-model="reinicioMotivo"
          class="input"
          rows="2"
          placeholder="Ej. documento incorrecto, re-extracción necesaria…"
        />
        <p v-if="reinicioError" class="error-msg">{{ reinicioError }}</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" type="button" :disabled="reinicioSaving" @click="cerrarReinicioModal">
          Cancelar
        </button>
        <button class="btn btn-primary btn-reinicio-confirm" type="button" :disabled="reinicioSaving" @click="confirmReinicio">
          {{ reinicioSaving ? "Reiniciando…" : "Sí, reiniciar a foja cero" }}
        </button>
      </template>
    </CreateFormModal>

    <DocumentoOrigenModal
      v-model="docModalOpen"
      :document-url="docUrl"
      :mime-type="documento.mimeType"
      :initial-page="docModalLine?.paginaNumero"
      :highlight-bbox="docModalLine?.bbox ?? null"
      :highlight-page="docModalLine?.paginaNumero"
      :line-label="docModalLine ? `${docModalLine.denominacionOriginal} · pág. ${docModalLine.paginaNumero}` : undefined"
    />

    <CreateFormModal
      v-if="agregarLineaModalOpen && documento"
      v-model="agregarLineaModalOpen"
      wide
      title="Agregar línea manual"
      :subtitle="caso?.numero ?? ''"
    >
      <div class="modal-form revision-modal agregar-linea-modal">
        <p class="revision-modal__lead">
          Ingresá una fila que falte en el balance. Quedará clasificada con el rubro elegido y se recalculan totales y
          validaciones.
        </p>
        <label class="label" for="nueva-linea-denom">Denominación</label>
        <input
          id="nueva-linea-denom"
          v-model="nuevaLineaDenominacion"
          class="input"
          type="text"
          placeholder="Ej. Caja y bancos"
        />
        <div class="agregar-linea-modal__row">
          <div class="agregar-linea-modal__field">
            <label class="label" for="nueva-linea-monto">Monto</label>
            <input
              id="nueva-linea-monto"
              v-model="nuevaLineaMontoRaw"
              class="input agregar-linea-modal__monto"
              type="text"
              inputmode="decimal"
              placeholder="0"
            />
          </div>
          <div class="agregar-linea-modal__field">
            <label class="label" for="nueva-linea-pagina">Página PDF</label>
            <input
              id="nueva-linea-pagina"
              v-model.number="nuevaLineaPagina"
              class="input"
              type="number"
              min="1"
            />
          </div>
        </div>
        <label class="label" for="nueva-linea-rubro">Rubro institucional</label>
        <select id="nueva-linea-rubro" v-model="nuevaLineaRubroId" class="input">
          <option value="">— Elegir rubro —</option>
          <option v-for="r in rubros" :key="r.id" :value="r.id">
            {{ r.codigo }} — {{ r.nombre }}
          </option>
        </select>
        <p v-if="agregarLineaError" class="error-msg">{{ agregarLineaError }}</p>
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" :disabled="agregarLineaSaving" @click="agregarLineaModalOpen = false">
            Cancelar
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="agregarLineaSaving || !agregarLineaFormValido"
            @click="confirmAgregarLinea"
          >
            {{ agregarLineaSaving ? "Guardando…" : "Agregar línea" }}
          </button>
        </div>
      </div>
    </CreateFormModal>

    <CreateFormModal
      v-if="evaluarModalOpen"
      v-model="evaluarModalOpen"
      xl
      title="Validaciones e inconsistencias"
      :subtitle="caso?.numero ?? ''"
    >
      <div class="modal-form revision-modal evaluar-modal">
        <p v-if="evaluarLoading" class="revision-modal__hint">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Actualizando validaciones…
        </p>
        <template v-else>
          <div class="evaluar-modal__toolbar">
            <p class="evaluar-modal__lead">
              Confirmá o descartá cada alerta. Mientras haya pendientes, la aprobación queda bloqueada salvo que marques
              «Aprobar igualmente sin resolver validaciones».
            </p>
            <button class="btn btn-ghost btn-sm" type="button" @click="exportValidaciones">
              <i class="fas fa-download" aria-hidden="true"></i>
              Exportar
            </button>
          </div>
          <div v-if="validaciones.length" class="val-panel val-panel--modal">
            <div class="val-summary" role="status" aria-live="polite">
              <div class="val-summary__chip val-summary__chip--ok">
                <i class="fas fa-circle-check" aria-hidden="true"></i>
                <span><strong>{{ validacionesOkCount }}</strong> correctas</span>
              </div>
              <div
                v-if="validacionesPendientes.length"
                class="val-summary__chip val-summary__chip--pending"
              >
                <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
                <span><strong>{{ validacionesPendientes.length }}</strong> pendientes</span>
              </div>
              <div v-if="validacionesResueltasCount" class="val-summary__chip val-summary__chip--resolved">
                <i class="fas fa-user-check" aria-hidden="true"></i>
                <span><strong>{{ validacionesResueltasCount }}</strong> resueltas</span>
              </div>
            </div>
            <ul class="val-cards">
              <li
                v-for="v in validacionesOrdenadas"
                :key="v.id"
                class="val-card"
                :class="valCardClass(v)"
              >
                <div class="val-card__icon" aria-hidden="true">
                  <i :class="valCardIcon(v)"></i>
                </div>
                <div class="val-card__body">
                  <div class="val-card__meta">
                    <span class="val-badge val-badge--tipo">{{ valTipoLabel(v.tipo) }}</span>
                    <span v-if="!v.passed" class="val-badge" :class="`val-badge--${v.severidad}`">
                      {{ valSeveridadLabel(v.severidad) }}
                    </span>
                    <span v-else class="val-badge val-badge--ok">Superada</span>
                  </div>
                  <p class="val-card__msg">{{ v.mensaje }}</p>
                  <p v-if="valGuiaAccion(v)" class="val-card__guide">{{ valGuiaAccion(v) }}</p>
                  <p v-if="valEstadoResuelto(v)" class="val-card__status">
                    {{
                      v.confirmadaPorAnalista
                        ? "Reconocida por el analista — quedará registrada en la ficha."
                        : "Descartada — el sistema no la exige para continuar."
                    }}
                  </p>
                </div>
                <div v-if="!v.passed && !valEstadoResuelto(v)" class="val-card__actions">
                  <button
                    class="btn btn-sm val-btn val-btn--confirm"
                    type="button"
                    @click="openValModal(v, true)"
                  >
                    <i class="fas fa-check" aria-hidden="true"></i>
                    Reconocer
                  </button>
                  <button
                    class="btn btn-sm val-btn val-btn--dismiss"
                    type="button"
                    @click="openValModal(v, false)"
                  >
                    <i class="fas fa-ban" aria-hidden="true"></i>
                    No aplica
                  </button>
                </div>
                <span v-else-if="valEstadoResuelto(v)" class="val-card__badge-done">
                  {{ v.confirmadaPorAnalista ? "Reconocida" : "Descartada" }}
                </span>
              </li>
            </ul>
          </div>
          <p v-else class="revision-step__empty">No hay validaciones registradas para este caso.</p>
          <p v-if="valStepError" class="step-inline-msg step-inline-msg--err">{{ valStepError }}</p>
        </template>
      </div>
    </CreateFormModal>

    <CreateFormModal
      v-if="valModalOpen && valModalTarget"
      v-model="valModalOpen"
      :title="valModalConfirmada ? 'Confirmar inconsistencia' : 'Descartar alerta'"
      :subtitle="caso?.numero ?? ''"
    >
      <div class="modal-form revision-modal">
        <template v-if="!valModalDone">
          <p class="revision-modal__alert">{{ valModalTarget.mensaje }}</p>
          <div class="revision-modal__box">
            <h4>¿Qué pasa si confirmás?</h4>
            <p v-if="valModalConfirmada">
              Queda registrado que <strong>reconocés esta inconsistencia</strong> como válida para esta ficha.
              El sistema la tendrá en cuenta al aprobar y en el informe de comité.
            </p>
            <p v-else>
              Queda registrado que <strong>descartás esta alerta</strong> porque no aplica o ya fue resuelta en
              los datos. Si el problema sigue en las líneas, corregilas antes de aprobar la ficha.
            </p>
          </div>
          <p v-if="valModalError" class="error-msg">{{ valModalError }}</p>
          <div class="modal-form__actions">
            <button class="btn btn-ghost" type="button" :disabled="valModalSaving" @click="valModalOpen = false">
              Cancelar
            </button>
            <button class="btn btn-primary" type="button" :disabled="valModalSaving" @click="submitValModal">
              {{
                valModalSaving
                  ? "Guardando…"
                  : valModalConfirmada
                    ? "Sí, confirmar inconsistencia"
                    : "Sí, descartar alerta"
              }}
            </button>
          </div>
        </template>
        <template v-else>
          <p class="revision-modal__success">
            {{
              valModalConfirmada
                ? "Inconsistencia confirmada y registrada en el expediente."
                : "Alerta descartada y registrada en el expediente."
            }}
          </p>
          <p class="revision-modal__hint">
            Podés seguir revisando líneas o aprobar la ficha cuando no queden pendientes.
          </p>
          <div class="modal-form__actions">
            <button class="btn btn-primary" type="button" @click="valModalOpen = false">Entendido</button>
          </div>
        </template>
      </div>
    </CreateFormModal>

    <CreateFormModal
      v-if="aprobarModalOpen && caso"
      v-model="aprobarModalOpen"
      title="Confirmar cierre de revisión"
      :subtitle="`${caso.numero} · v${caso.version ?? 0} → v${(caso.version ?? 0) + 1}`"
    >
      <div class="modal-form revision-modal">
        <p class="revision-modal__lead">
          Estás por cerrar la revisión y generar la <strong>ficha canónica</strong> con los datos validados abajo.
          Este snapshot alimentará indicadores e informe de comité.
        </p>

        <div class="aprobar-modal-resumen">
          <div class="aprobar-modal-resumen__row">
            <span class="aprobar-modal-resumen__label">Empresa</span>
            <strong>{{ aprobarResumen.empresa }}</strong>
          </div>
          <div class="aprobar-modal-resumen__row">
            <span class="aprobar-modal-resumen__label">Período</span>
            <strong>{{ aprobarResumen.ejercicio }} · {{ aprobarResumen.monedaEscala }}</strong>
          </div>
          <div class="aprobar-modal-resumen__row">
            <span class="aprobar-modal-resumen__label">Documento</span>
            <strong>{{ aprobarResumen.documento }}</strong>
          </div>
          <div class="aprobar-modal-resumen__row">
            <span class="aprobar-modal-resumen__label">Líneas incluidas</span>
            <strong>{{ aprobarResumen.lineasTotal }} ({{ aprobarResumen.lineasRevisadas }} revisadas)</strong>
          </div>
          <div class="aprobar-modal-resumen__row">
            <span class="aprobar-modal-resumen__label">Validaciones</span>
            <strong>{{ aprobarResumen.validacionesOk }} OK · {{ aprobarResumen.validacionesResueltas }} resueltas</strong>
          </div>
          <div v-if="observaciones.trim()" class="aprobar-modal-resumen__row aprobar-modal-resumen__row--obs">
            <span class="aprobar-modal-resumen__label">Observaciones</span>
            <em>{{ observaciones.trim() }}</em>
          </div>
        </div>

        <div class="revision-modal__box">
          <h4>Qué hará el sistema al confirmar</h4>
          <ul class="revision-modal__list">
            <li>Calcula totales de balance y estado de resultados con los rubros aprobados.</li>
            <li>Genera indicadores financieros sobre la ficha v{{ (caso.version ?? 0) + 1 }}.</li>
            <li>Marca el caso como <strong>Aprobado</strong> y registra la acción en auditoría.</li>
            <li>Habilita la generación del informe preliminar para comité.</li>
          </ul>
        </div>

        <p v-if="!aprobacionCheck && !aprobarModalError" class="revision-modal__hint">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Verificando requisitos…
        </p>
        <div v-if="aprobacionCheck && !aprobacionCheck.ok" class="revision-modal__warn">
          <strong>No podés aprobar todavía:</strong>
          <ul>
            <li v-for="(motivo, i) in aprobacionCheck.motivos" :key="i">
              {{ motivo }}
              <button
                v-if="motivoSeccion(motivo) != null"
                type="button"
                class="aprobar-motivo-link"
                @click="irASeccionDesdeModal(motivoSeccion(motivo)!)"
              >
                Ir a corregir →
              </button>
            </li>
          </ul>
        </div>
        <p v-else-if="aprobacionCheck?.ok" class="revision-modal__ok-hint">
          <i class="fas fa-circle-check" aria-hidden="true"></i>
          Todo en orden — la ficha quedará aprobada con el resumen mostrado arriba.
        </p>
        <p v-if="aprobarModalError" class="error-msg">{{ aprobarModalError }}</p>
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" :disabled="approving" @click="aprobarModalOpen = false">
            Volver a revisar
          </button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="approving || !aprobacionCheck?.ok"
            @click="confirmAprobarFicha"
          >
            {{ approving ? "Cerrando revisión…" : "Sí, cerrar y generar ficha" }}
          </button>
        </div>
      </div>
    </CreateFormModal>

    <CreateFormModal
      v-if="reclasificarModalOpen && caso"
      v-model="reclasificarModalOpen"
      title="Reclasificar rubros y validar"
      :subtitle="`${caso.numero} · sin volver a leer el PDF`"
    >
      <div class="modal-form revision-modal">
        <template v-if="!reclasificarDone">
          <p class="revision-modal__lead">
            Esta acción <strong>no vuelve a extraer el PDF</strong>. Reutiliza las líneas ya leídas y vuelve a
            asignar rubros del plan contable con las reglas vigentes.
          </p>
          <div class="revision-modal__box">
            <h4>Qué hará el sistema</h4>
            <ul class="revision-modal__list">
              <li>Borrará la clasificación actual de cada línea (rubro y confianza).</li>
              <li>Eliminará las validaciones automáticas registradas hasta ahora.</li>
              <li>Encolará el caso para reclasificar todas las líneas.</li>
              <li>Volverá a ejecutar las validaciones de cuadratura e inconsistencias.</li>
              <li>El caso saldrá temporalmente de «En revisión» mientras procesa.</li>
            </ul>
          </div>
          <div class="revision-modal__warn">
            <strong>Usalo cuando</strong> actualizaste el plan de cuentas, cambiaste umbrales o corregiste la identificación
            y querés recalcular sin subir el documento otra vez.
          </div>
          <p v-if="reclasificarError" class="error-msg">{{ reclasificarError }}</p>
          <div class="modal-form__actions">
            <button
              class="btn btn-ghost"
              type="button"
              :disabled="reclasificarSaving"
              @click="reclasificarModalOpen = false"
            >
              Cancelar
            </button>
            <button
              class="btn btn-primary"
              type="button"
              :disabled="reclasificarSaving"
              @click="confirmReclasificarValidar"
            >
              {{ reclasificarSaving ? "Encolando…" : "Sí, reclasificar y validar" }}
            </button>
          </div>
        </template>
        <template v-else>
          <p class="revision-modal__success">
            El caso fue encolado. Cuando termine el procesamiento volverá a «En revisión» con rubros y validaciones
            recalculados.
          </p>
          <p class="revision-modal__hint">Podés seguir en esta pantalla; los datos se actualizarán al refrescar.</p>
          <div class="modal-form__actions">
            <button class="btn btn-primary" type="button" @click="closeReclasificarModal">Entendido</button>
          </div>
        </template>
      </div>
    </CreateFormModal>

    <CreateFormModal
      v-if="clasificacionIaConfirmOpen && caso"
      v-model="clasificacionIaConfirmOpen"
      title="Clasificar líneas dudosas con IA"
      :subtitle="`${caso.numero}${caso.referencia ? ` · ${caso.referencia}` : ''}`"
    >
      <div class="modal-form revision-modal">
        <p class="revision-modal__lead">
          El sistema va a clasificar con IA
          <strong>{{ lineasDudosasIaCount }} línea(s) dudosa(s)</strong>
          (sin rubro asignado o con baja confianza).
        </p>
        <div class="revision-modal__box">
          <h4>Qué va a pasar</h4>
          <ul class="revision-modal__list">
            <li>
              <strong>Lote 1 — sin rubro ({{ lineasSinRubroIaCount }}):</strong> la IA propone rubro del plan de
              cuentas.
            </li>
            <li v-if="lineasBajaConfianzaIaCount > 0">
              <strong>Lote 2 — baja confianza ({{ lineasBajaConfianzaIaCount }}):</strong> la IA revisa y puede
              reasignar el rubro sugerido.
            </li>
            <li>Se guardan rubro, confianza y explicación de la IA en la base de datos (línea por línea).</li>
            <li>Cada línea clasificada por IA pasa a <strong>verde (OK)</strong> — la decisión queda firme, no pendiente de aprobación.</li>
            <li>Si se interrumpe el proceso, al reanudar <strong>no se reprocesan</strong> las líneas ya clasificadas.</li>
            <li>Podés corregir manualmente cualquier línea verde si no estás de acuerdo con la IA.</li>
          </ul>
        </div>
        <div v-if="lineasConRubroPendienteCount > 0" class="revision-modal__box revision-modal__box--muted">
          <p class="revision-modal__hint" style="margin: 0">
            <strong>{{ lineasConRubroPendienteCount }} línea(s)</strong> clasificadas por el pipeline (no por IA de
            revisión) siguen pendientes de tu confirmación manual.
          </p>
        </div>
        <div class="revision-modal__warn">
          <strong>Tené en cuenta:</strong> la IA solo se ejecuta cuando confirmás acá — no arranca sola al entrar.
          Puede tardar varios segundos por línea; no cierres esta pantalla hasta que termine.
        </div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" type="button" @click="clasificacionIaConfirmOpen = false">
          Cancelar
        </button>
        <button class="btn btn-primary" type="button" @click="confirmClasificacionIa">
          <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
          Sí, clasificar con IA
        </button>
      </template>
    </CreateFormModal>

    <ExtraccionIaModal
      v-model="extraccionIaOpen"
      :caso-id="casoId"
      :documento-nombre="documento?.nombreOriginal"
    />

    <CreateFormModal
      v-if="aprobarSuccessOpen && caso"
      v-model="aprobarSuccessOpen"
      :title="ultimoCierreParcial ? 'Revisión cerrada con observaciones' : 'Revisión cerrada'"
      :subtitle="caso.numero"
    >
      <div class="modal-form revision-modal">
        <p class="revision-modal__success">
          <template v-if="ultimoCierreParcial">
            La ficha <strong>v{{ aprobarResultVersion }}</strong> quedó cerrada con observaciones. Podés generar el
            informe con las limitaciones registradas.
          </template>
          <template v-else>
          La ficha canónica <strong>v{{ aprobarResultVersion }}</strong> quedó aprobada. El caso está listo para el
          informe de comité.
          </template>
        </p>
        <div class="revision-modal__box">
          <h4>Próximos pasos</h4>
          <ul class="revision-modal__list">
            <li>Revisá totales e indicadores en el expediente si lo necesitás.</li>
            <li>Generá el informe preliminar para el comité de crédito.</li>
            <li>O volvé a la bandeja para continuar con otra ficha.</li>
          </ul>
        </div>
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" @click="goBandeja">Volver a bandeja</button>
          <RouterLink :to="`/casos/${casoId}/informe`" class="btn btn-primary" @click="aprobarSuccessOpen = false">
            Generar informe
          </RouterLink>
        </div>
      </div>
    </CreateFormModal>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  ClasificacionIaLineaEventoDto,
  ClasificacionIaProgresoDto,
  FichaHistorialDto,
  LineaContableDto,
  RubroOptionDto,
  ValidacionResultadoDto,
} from "@ffa/shared";
import type { ProvenanceCasoDto } from "@ffa/shared";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { api, type CasoDetalleDto } from "../api/client";
import CreateFormModal from "../components/CreateFormModal.vue";
import DocumentoOrigenModal from "../components/DocumentoOrigenModal.vue";
import ExtraccionIaModal from "../components/ExtraccionIaModal.vue";
import BalanceDiagnosticoPanel from "../components/BalanceDiagnosticoPanel.vue";
import ProvenanceFallbackBanner from "../components/ProvenanceFallbackBanner.vue";
import RevisionSplitView from "../components/RevisionSplitView.vue";
import RevisionStepNav from "../components/RevisionStepNav.vue";
import RevisionOrigenPanel from "../components/RevisionOrigenPanel.vue";
import PageHeader from "../components/PageHeader.vue";
import SemaforoIndicator from "../components/SemaforoIndicator.vue";
import { useCloseOnRouteLeave } from "../composables/useCloseOnRouteLeave";
import { MONEDAS_OPCIONES, monedaLabel } from "../constants/monedas";
import { calcularTotalesBalance, type LineaDraftOverride } from "../utils/balanceTotales";
import {
  analizarDuplicadosLineas,
  colapsarDuplicadosLineas,
  lineaDuplicadoKey,
} from "../utils/linea-duplicados";
import { calcularLineasImpactoCuadratura } from "../utils/revisionResumen";
import { apiErrorMessage } from "../utils/apiError";
import { formatMonto, parseMontoInput } from "../utils/formatMonto";
import { puedeReiniciarFojaCero } from "../utils/casoAcciones";

const route = useRoute();
const router = useRouter();
const casoId = route.params.id as string;

const loading = ref(true);
const error = ref<string | null>(null);
const caso = ref<CasoDetalleDto | null>(null);
const provenanceCaso = ref<ProvenanceCasoDto | null>(null);
const documento = ref<CasoDetalleDto["documentos"][0] | null>(null);
const lineas = ref<LineaContableDto[]>([]);
const rubros = ref<RubroOptionDto[]>([]);
const validaciones = ref<ValidacionResultadoDto[]>([]);
const observaciones = ref("");
const approving = ref(false);
const metaStepMsg = ref("");
const metaStepError = ref("");
const valStepError = ref("");
const lineaPanelMsg = ref("");
const lineaPanelError = ref("");
const fichaHistorial = ref<FichaHistorialDto[]>([]);
const consolidables = ref<
  Array<{ id: string; numero: string; estado: string; documentosCount: number }>
>([]);
const metaMoneda = ref("");
const metaEscala = ref("indeterminada");
const metaEjercicio = ref<number | undefined>();
const metaRazonSocial = ref("");
const metaRut = ref("");
const metaSaving = ref(false);
const metaReextrayendo = ref(false);
const extractionProvider = ref<string>("mock");
/** Snapshot tras confirmación explícita del analista (paso 1). */
const metaGuardadoSnapshot = ref("");
const metaConfirmado = ref(false);
const valModalOpen = ref(false);
const valModalSaving = ref(false);
const valModalDone = ref(false);
const valModalError = ref("");
const valModalTarget = ref<ValidacionResultadoDto | null>(null);
const valModalConfirmada = ref(true);
const aprobarModalOpen = ref(false);
const aprobarModalError = ref("");
const aprobarSuccessOpen = ref(false);
const aprobarResultVersion = ref(0);
const aprobacionCheck = ref<{ ok: boolean; motivos: string[] } | null>(null);
const aprobacionBlockers = ref<string[]>([]);
const lineasPendientesCount = ref(0);
const lineasDudosasIaCount = ref(0);
const eliminarDuplicadosLoading = ref(false);
const balanceAnalisisLoading = ref(false);
const balanceReconciliarLoading = ref(false);
const balanceAnalisisError = ref<string | null>(null);
const balanceReconciliarMsg = ref<string | null>(null);
const balanceAnalisis = ref<import("@ffa/shared").BalanceAnalisisDto | null>(null);

const analisisDuplicadosLineas = computed(() => analizarDuplicadosLineas(lineas.value));
const lineasDuplicadasCount = computed(() => analisisDuplicadosLineas.value.duplicadasCount);
const lineasDuplicadosGrupos = computed(() => analisisDuplicadosLineas.value.gruposCount);
const lineasSinRubroIaCount = ref(0);
const lineasBajaConfianzaIaCount = ref(0);
const lineasConRubroPendienteCount = ref(0);
const umbralConfianza = ref(85);
const agregarLineaModalOpen = ref(false);
const agregarLineaSaving = ref(false);
const agregarLineaError = ref("");
const nuevaLineaDenominacion = ref("");
const nuevaLineaMontoRaw = ref("");
const nuevaLineaRubroId = ref("");
const nuevaLineaPagina = ref(1);
const evaluarModalOpen = ref(false);
const evaluarLoading = ref(false);
const aprobarIgnorarValidaciones = ref(false);
const docModalOpen = ref(false);
const docModalLine = ref<LineaContableDto | null>(null);
const reinicioModalOpen = ref(false);
const reinicioMotivo = ref("");
const reinicioSaving = ref(false);
const reinicioError = ref("");
const reclasificarModalOpen = ref(false);
const accionesAvanzadasOpen = ref(false);
const cerrarRevisionModalOpen = ref(false);
const motivoCierreParcial = ref("");
const cierreParcialAceptaIdentificacion = ref(false);
const cierreParcialAceptaPendientes = ref(false);
const cerrarRevisionError = ref("");
const pendingCierreParcial = ref(false);
const ultimoCierreParcial = ref(false);
const historialModalOpen = ref(false);
const reclasificarSaving = ref(false);
const reclasificarDone = ref(false);
const reclasificarError = ref("");
const extraccionIaOpen = ref(false);
const clasificacionIaMasivaLoading = ref(false);
const clasificacionIaConfirmOpen = ref(false);
const clasificacionIaTrabajandoEtapa = ref("");
const clasificacionIaProgresoActual = ref(0);
const clasificacionIaProgresoTotal = ref(0);
const iaLineaEnCurso = ref<ClasificacionIaLineaEventoDto | null>(null);
const iaUltimasLineas = ref<ClasificacionIaLineaEventoDto[]>([]);
const iaLineasRecientesIds = ref<string[]>([]);
const iaPollUltimoProcesadas = ref(0);
let iaPollTimer: ReturnType<typeof setInterval> | null = null;
const resolverPendientesLoading = ref(false);
const resolverPendientesEtapa = ref("");
let isMounted = false;

const lineDraftOverrides = ref<Record<string, LineaDraftOverride>>({});
const revisionActiveStep = ref(0);
const splitViewDoc = ref(false);

const totalesBalanceRevision = computed(() =>
  lineas.value.length && rubros.value.length
    ? calcularTotalesBalance(
        colapsarDuplicadosLineas(lineas.value).lineasVisibles,
        rubros.value,
        lineDraftOverrides.value
      )
    : null
);

const lineasImpactoCuadratura = computed(() =>
  lineas.value.length && rubros.value.length
    ? calcularLineasImpactoCuadratura(
        colapsarDuplicadosLineas(lineas.value).lineasVisibles,
        rubros.value,
        lineDraftOverrides.value
      )
    : []
);

const revisionSteps = computed(() => [
  {
    id: "ident",
    title: "Identificación",
    done: metaVerificado.value,
    hint: !metaCompleto.value ? "Incompleto" : metaVerificado.value ? undefined : "Sin confirmar",
  },
  {
    id: "lineas",
    title: "Líneas y cuadratura",
    done:
      metaVerificado.value &&
      lineasPendientesCount.value === 0 &&
      Boolean(totalesBalanceRevision.value?.cuadraturaOk),
    hint:
      metaVerificado.value && lineasPendientesCount.value > 0
        ? `${lineasPendientesCount.value} pendiente(s)`
        : metaVerificado.value && totalesBalanceRevision.value && !totalesBalanceRevision.value.cuadraturaOk
          ? "Cuadratura ≠"
          : undefined,
  },
]);

const cuadraturaEnVistaPrevia = computed(() => Object.keys(lineDraftOverrides.value).length > 0);

function onDraftOverridesChange(overrides: Record<string, LineaDraftOverride>): void {
  lineDraftOverrides.value = overrides;
}

const agregarLineaFormValido = computed(
  () =>
    Boolean(nuevaLineaDenominacion.value.trim()) &&
    Boolean(nuevaLineaRubroId.value) &&
    parseMontoInput(nuevaLineaMontoRaw.value) != null
);

const validacionesPendientes = computed(() =>
  validaciones.value.filter((v) => !v.passed && !valEstadoResuelto(v))
);

const validacionesOkCount = computed(() => validaciones.value.filter((v) => v.passed).length);

const validacionesResueltasCount = computed(
  () => validaciones.value.filter((v) => !v.passed && valEstadoResuelto(v)).length
);

const SEVERIDAD_ORDEN: Record<string, number> = { critical: 0, warning: 1, info: 2 };

const validacionesOrdenadas = computed(() => {
  return [...validaciones.value].sort((a, b) => {
    const score = (v: ValidacionResultadoDto) => {
      if (!v.passed && !valEstadoResuelto(v)) return 0;
      if (!v.passed && valEstadoResuelto(v)) return 1;
      return 2;
    };
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa - sb;
    if (sa === 0) {
      return (SEVERIDAD_ORDEN[a.severidad] ?? 9) - (SEVERIDAD_ORDEN[b.severidad] ?? 9);
    }
    return 0;
  });
});

function buildMetaSnapshot(): string {
  return JSON.stringify({
    moneda: metaMoneda.value.trim(),
    escala: metaEscala.value,
    ejercicio: metaEjercicio.value ?? null,
    razonSocial: metaRazonSocial.value.trim(),
    rut: metaRut.value.trim(),
  });
}

const metaDirty = computed(() => buildMetaSnapshot() !== metaGuardadoSnapshot.value);

const metaReferenciaDisplay = computed(
  () => caso.value?.referencia?.trim() || caso.value?.numero || "Sin referencia"
);

const empresaTitular = computed(() => metaRazonSocial.value.trim());

const metaCompleto = computed(
  () =>
    Boolean(metaMoneda.value.trim()) &&
    Boolean(metaRazonSocial.value.trim()) &&
    metaEjercicio.value != null &&
    !Number.isNaN(metaEjercicio.value) &&
    metaEscala.value !== "indeterminada"
);

const metaCamposFaltantes = computed(() => {
  const faltantes: string[] = [];
  if (!metaMoneda.value.trim()) faltantes.push("Moneda");
  if (metaEscala.value === "indeterminada") faltantes.push("Escala");
  if (metaEjercicio.value == null || Number.isNaN(metaEjercicio.value)) faltantes.push("Ejercicio");
  if (!metaRazonSocial.value.trim()) faltantes.push("Razón social");
  return faltantes;
});

const metaVerificado = computed(() => {
  if (fichaCerrada.value) return true;
  return metaConfirmado.value && metaCompleto.value && !metaDirty.value;
});

function escalaLabel(escala: string): string {
  const map: Record<string, string> = {
    unidades: "Unidades",
    miles: "Miles",
    millones: "Millones",
    indeterminada: "Indeterminada",
  };
  return map[escala] ?? escala;
}

watch([metaMoneda, metaEscala, metaEjercicio, metaRazonSocial, metaRut], () => {
  if (metaConfirmado.value && metaDirty.value) {
    metaConfirmado.value = false;
  }
});

const fichaCerrada = computed(
  () => caso.value?.estado === "aprobado" || caso.value?.estado === "informe_generado"
);

const showReinicioFojaCero = computed(
  () =>
    Boolean(documento.value) &&
    puedeReiniciarFojaCero({
      documentosCount: caso.value?.documentos?.length ?? (documento.value ? 1 : 0),
    })
);

const aprobacionBlockersEfectivos = computed(() => {
  if (!aprobarIgnorarValidaciones.value) return aprobacionBlockers.value;
  return aprobacionBlockers.value.filter((m) => !esMotivoIgnorableAlForzar(m));
});

const aprobacionOkConIgnorar = ref(false);

const aprobarListo = computed(() => {
  if (!metaVerificado.value) return false;
  if (aprobarIgnorarValidaciones.value && aprobacionOkConIgnorar.value) {
    return aprobacionBlockersEfectivos.value.length === 0;
  }
  return (
    lineasPendientesCount.value === 0 &&
    validacionesPendientes.value.length === 0 &&
    aprobacionBlockers.value.length === 0
  );
});

const aprobarListoMotivo = computed(() => {
  if (aprobarListo.value) return "";
  const motivos: string[] = [];
  if (!metaVerificado.value) motivos.push("Confirmá la identificación del documento (paso 1)");
  if (!aprobarIgnorarValidaciones.value) {
    if (lineasPendientesCount.value > 0) {
      motivos.push(`${lineasPendientesCount.value} línea(s) pendiente(s)`);
    }
    if (validacionesPendientes.value.length > 0) {
      motivos.push(`${validacionesPendientes.value.length} validación(es) pendiente(s)`);
    }
  }
  for (const m of aprobacionBlockersEfectivos.value) motivos.push(m);
  return motivos.join(" · ");
});

const aprobarResumen = computed(() => {
  const totalLineas = caso.value?.lineasCount ?? lineas.value.length;
  const pendientes = lineasPendientesCount.value;
  const revisadas = Math.max(0, totalLineas - pendientes);
  const valOk = validaciones.value.filter((v) => v.passed).length;
  const valResueltas = validaciones.value.filter((v) => !v.passed && valEstadoResuelto(v)).length;
  const moneda = metaMoneda.value.trim() || caso.value?.moneda || "—";
  const escala = metaEscala.value || caso.value?.escala || "—";
  return {
    empresa: metaRazonSocial.value.trim() || "Sin razón social registrada",
    rut: metaRut.value.trim() || "—",
    ejercicio: metaEjercicio.value ?? caso.value?.periodoEjercicio ?? "—",
    monedaEscala: `${monedaLabel(moneda)} · ${escalaLabel(String(escala))}`,
    documento: documento.value?.nombreOriginal ?? "—",
    confianza: caso.value?.confianzaGlobal != null ? `${caso.value.confianzaGlobal}%` : "—",
    lineasTotal: totalLineas,
    lineasRevisadas: revisadas,
    lineasPendientes: pendientes,
    validacionesOk: valOk,
    validacionesResueltas: valResueltas,
  };
});

function esMotivoValidacion(motivo: string): boolean {
  const m = motivo.toLowerCase();
  return (
    m.includes("validación") ||
    m.includes("inconsistencia") ||
    m.includes("cuadratura") ||
    m.includes("sin confirmar")
  );
}

function esMotivoIgnorableAlForzar(motivo: string): boolean {
  const m = motivo.toLowerCase();
  return (
    esMotivoValidacion(motivo) ||
    m.includes("línea") ||
    m.includes("linea") ||
    m.includes("rubro") ||
    m.includes("pendiente de revisión") ||
    m.includes("pendientes de revisión") ||
    m.includes("cuadratura")
  );
}

const cierreParcialFormValido = computed(
  () =>
    metaVerificado.value &&
    motivoCierreParcial.value.trim().length >= 8 &&
    cierreParcialAceptaIdentificacion.value &&
    cierreParcialAceptaPendientes.value
);

function resetCierreParcialForm(): void {
  motivoCierreParcial.value = "";
  cierreParcialAceptaIdentificacion.value = false;
  cierreParcialAceptaPendientes.value = false;
  cerrarRevisionError.value = "";
  pendingCierreParcial.value = false;
}

function scrollToIdentificacion(): void {
  document.getElementById("revision-identificacion")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openCerrarRevisionModal(): void {
  resetCierreParcialForm();
  cerrarRevisionModalOpen.value = true;
}

function proceedCierreCompleto(): void {
  cerrarRevisionModalOpen.value = false;
  aprobarIgnorarValidaciones.value = false;
  pendingCierreParcial.value = false;
  void openAprobarModal();
}

function accionAvanzadaEvaluar(): void {
  accionesAvanzadasOpen.value = false;
  void openEvaluarModal();
}

function accionAvanzadaReprocesar(): void {
  accionesAvanzadasOpen.value = false;
  void onReprocesar();
}

function accionAvanzadaReclasificar(): void {
  accionesAvanzadasOpen.value = false;
  openReclasificarModal();
}

function accionAvanzadaReinicio(): void {
  accionesAvanzadasOpen.value = false;
  openReinicioModal();
}

async function openEvaluarModal(): Promise<void> {
  evaluarModalOpen.value = true;
  evaluarLoading.value = true;
  valStepError.value = "";
  try {
    await refreshCaso();
    await loadLineas(false);
    await refreshAprobacionBlockers();
  } finally {
    evaluarLoading.value = false;
  }
}

async function refreshAprobacionBlockers(): Promise<void> {
  try {
    const check = await api.getPuedeAprobarFicha(casoId, aprobarIgnorarValidaciones.value);
    aprobacionBlockers.value = check.ok ? [] : check.motivos;
    aprobacionOkConIgnorar.value = aprobarIgnorarValidaciones.value ? check.ok : false;
  } catch {
    aprobacionBlockers.value = buildAprobacionCheckLocal().motivos;
    aprobacionOkConIgnorar.value = false;
  }
}

async function confirmCierreParcial(): Promise<void> {
  if (!cierreParcialFormValido.value || !caso.value) return;
  cerrarRevisionError.value = "";
  aprobarIgnorarValidaciones.value = true;
  pendingCierreParcial.value = true;

  resolverPendientesLoading.value = true;
  resolverPendientesEtapa.value = "Preparando cierre parcial…";
  approving.value = true;
  try {
    resolverPendientesEtapa.value = "Resolviendo pendientes…";
    await api.resolverPendientesRevision(casoId);

    resolverPendientesEtapa.value = "Generando ficha…";
    const motivo = motivoCierreParcial.value.trim();
    const ficha = await api.aprobarFicha(casoId, {
      version: caso.value.version ?? 0,
      observaciones: observaciones.value || undefined,
      ignorarValidacionesPendientes: true,
      cierreParcial: true,
      motivoCierreParcial: motivo,
    });

    aprobarResultVersion.value = ficha.version;
    ultimoCierreParcial.value = true;
    cerrarRevisionModalOpen.value = false;
    aprobarSuccessOpen.value = true;
    resetCierreParcialForm();
    await refreshCaso();
  } catch (e) {
    aprobarIgnorarValidaciones.value = false;
    pendingCierreParcial.value = false;
    ultimoCierreParcial.value = false;
    cerrarRevisionError.value = apiErrorMessage(e, "No se pudo cerrar la revisión");
  } finally {
    resolverPendientesLoading.value = false;
    resolverPendientesEtapa.value = "";
    approving.value = false;
  }
}

type RevisionSeccion = "identificacion" | "lineas" | "validaciones";

function motivoSeccion(motivo: string): RevisionSeccion | null {
  const m = motivo.toLowerCase();
  if (m.includes("metadato") || m.includes("identificación") || m.includes("empresa")) {
    return "identificacion";
  }
  if (
    m.includes("línea") ||
    m.includes("rubro") ||
    m.includes("activo") ||
    m.includes("pasivo") ||
    m.includes("patrimonio")
  ) {
    return "lineas";
  }
  if (
    m.includes("inconsistencia") ||
    m.includes("validación") ||
    m.includes("cuadratura") ||
    m.includes("sin confirmar")
  ) {
    return "validaciones";
  }
  return null;
}

async function irASeccionDesdeModal(seccion: RevisionSeccion): Promise<void> {
  aprobarModalOpen.value = false;
  if (seccion === "lineas") {
    await loadLineas(false);
    document.getElementById("revision-lineas")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (seccion === "identificacion") {
    scrollToIdentificacion();
    return;
  }
  await openEvaluarModal();
}

function openDocumentoModal(linea?: LineaContableDto): void {
  docModalLine.value = linea ?? null;
  docModalOpen.value = true;
}

function valEstadoResuelto(v: ValidacionResultadoDto): boolean {
  return v.confirmadaPorAnalista === true || v.confirmadaPorAnalista === false;
}

const VAL_TIPO_LABELS: Record<string, string> = {
  cuadratura: "Cuadratura",
  coherencia_estados: "Coherencia",
  integridad_agrupacion: "Integridad",
  debito_credito: "Débito / crédito",
  escala_no_declarada: "Escala",
  clasificacion_origen: "Clasificación",
  ejercicio_desactualizado: "Ejercicio",
  activo_sobrevalorado: "Activo",
};

const VAL_SEVERIDAD_LABELS: Record<string, string> = {
  critical: "Crítica",
  warning: "Advertencia",
  info: "Informativa",
};

function valTipoLabel(tipo: string): string {
  return VAL_TIPO_LABELS[tipo] ?? tipo.replace(/_/g, " ");
}

function valSeveridadLabel(severidad: string): string {
  return VAL_SEVERIDAD_LABELS[severidad] ?? severidad;
}

function valGuiaAccion(v: ValidacionResultadoDto): string {
  if (v.passed || valEstadoResuelto(v)) return "";
  switch (v.tipo) {
    case "ejercicio_desactualizado":
      return (
        "El balance es de un ejercicio antiguo. «Reconocer» = aceptás usar esos datos igual para esta ficha. " +
        "«No aplica» = el aviso no aplica (ej. el ejercicio es correcto). " +
        "Si el año está mal, corregilo en Identificación y confirmá de nuevo."
      );
    case "cuadratura":
      return (
        "Activo, pasivo o patrimonio no cierran. Revisá que cada línea tenga el rubro correcto en Líneas " +
        "(ej. si Activo = 0, probablemente faltan rubros de activo). Si el desbalance es aceptable para esta ficha, " +
        "usá «Reconocer» en Evaluar."
      );
    case "clasificacion_origen":
      return "Corregí razón social o RUT en Identificación, o «Reconocer» si la diferencia es esperada.";
    case "escala_no_declarada":
      return "Definí la escala (miles/millones) en Identificación y confirmá.";
    default:
      return "«Reconocer» registra que aceptás el hallazgo para esta ficha. «No aplica» descarta la alerta si ya la resolviste o no corresponde.";
  }
}

function valCardClass(v: ValidacionResultadoDto): string[] {
  if (v.passed) return ["val-card--ok"];
  if (valEstadoResuelto(v)) {
    return v.confirmadaPorAnalista ? ["val-card--resolved-ok"] : ["val-card--resolved-dismiss"];
  }
  return ["val-card--fail", `val-card--sev-${v.severidad}`];
}

function valCardIcon(v: ValidacionResultadoDto): string {
  if (v.passed) return "fas fa-circle-check";
  if (v.confirmadaPorAnalista === true) return "fas fa-user-check";
  if (v.confirmadaPorAnalista === false) return "fas fa-eye-slash";
  if (v.severidad === "critical") return "fas fa-circle-exclamation";
  if (v.severidad === "warning") return "fas fa-triangle-exclamation";
  return "fas fa-circle-info";
}

useCloseOnRouteLeave(valModalOpen);
useCloseOnRouteLeave(agregarLineaModalOpen);
useCloseOnRouteLeave(evaluarModalOpen);
useCloseOnRouteLeave(aprobarModalOpen);
useCloseOnRouteLeave(aprobarSuccessOpen);
useCloseOnRouteLeave(reclasificarModalOpen);
useCloseOnRouteLeave(accionesAvanzadasOpen);
useCloseOnRouteLeave(cerrarRevisionModalOpen);
useCloseOnRouteLeave(historialModalOpen);
useCloseOnRouteLeave(reinicioModalOpen);
useCloseOnRouteLeave(extraccionIaOpen);

useCloseOnRouteLeave(docModalOpen);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL");
}

const docUrl = computed(
  () => `/api/v1/casos/${casoId}/documentos/${documento.value?.id ?? ""}/file`
);

async function onConsolidar(origenId: string): Promise<void> {
  if (!confirm("¿Fusionar el otro caso en este? El origen quedará rechazado.")) return;
  metaStepError.value = "";
  metaStepMsg.value = "";
  try {
    const res = await api.consolidarCaso(casoId, origenId);
    metaStepMsg.value = `Consolidados ${res.documentosMovidos} documento(s)`;
    consolidables.value = await api.getCasosConsolidables(casoId);
    await refreshCaso();
    await loadLineas(false);
  } catch (e) {
    metaStepError.value = e instanceof Error ? e.message : "Error al consolidar";
  }
}

async function onReprocesar(): Promise<void> {
  if (!confirm("¿Devolver el caso a reprocesamiento?")) return;
  try {
    await api.devolverReprocesamiento(casoId);
    await refreshCaso();
  } catch (e) {
    metaStepError.value = e instanceof Error ? e.message : "Error al reprocesar";
    scrollToIdentificacion();
  }
}

function cerrarReinicioModal(): void {
  reinicioModalOpen.value = false;
}

watch(reinicioModalOpen, (open) => {
  if (!open) {
    reinicioSaving.value = false;
    reinicioError.value = "";
  }
});

function openReinicioModal(): void {
  reinicioSaving.value = false;
  reinicioMotivo.value = "";
  reinicioError.value = "";
  reinicioModalOpen.value = true;
}

async function confirmReinicio(): Promise<void> {
  reinicioSaving.value = true;
  reinicioError.value = "";
  try {
    await api.reiniciarFojaCero(casoId, reinicioMotivo.value.trim() || undefined);
    cerrarReinicioModal();
    await router.push({ name: "caso-expediente", params: { id: casoId }, query: { from: "casos" } });
  } catch (e) {
    reinicioError.value = apiErrorMessage(e, "No se pudo reiniciar el caso");
  } finally {
    reinicioSaving.value = false;
  }
}

function openValModal(v: ValidacionResultadoDto, confirmada: boolean): void {
  valModalTarget.value = v;
  valModalConfirmada.value = confirmada;
  valModalDone.value = false;
  valModalError.value = "";
  valModalOpen.value = true;
}

async function submitValModal(): Promise<void> {
  if (!valModalTarget.value) return;
  valModalSaving.value = true;
  valModalError.value = "";
  try {
    const targetId = valModalTarget.value.id;
    const confirmada = valModalConfirmada.value;
    await api.confirmValidacion(casoId, targetId, confirmada);
    const idx = validaciones.value.findIndex((v) => v.id === targetId);
    if (idx >= 0) {
      validaciones.value[idx] = { ...validaciones.value[idx], confirmadaPorAnalista: confirmada };
    }
    valModalDone.value = true;
    await refreshAprobacionBlockers();
  } catch (e) {
    valModalError.value = apiErrorMessage(e, "No se pudo registrar la confirmación");
  } finally {
    valModalSaving.value = false;
  }
}

function lineaYaProcesadaPorIa(l: LineaContableDto): boolean {
  return Boolean(l.clasificacionIaAt) || l.origenClasificacion === "ia_revision";
}

function lineaDudosaParaIa(l: LineaContableDto): boolean {
  if (l.excluirDeCuadratura) return false;
  if (!l.requiereRevision || l.estado === "aprobada") return false;
  if (lineaYaProcesadaPorIa(l)) return false;
  if (!l.rubroInstitucionalId) return true;
  return (l.confianzaClasificacion ?? 0) < umbralConfianza.value;
}

function lineaSinRubroParaIa(l: LineaContableDto): boolean {
  return lineaDudosaParaIa(l) && !l.rubroInstitucionalId;
}

function lineaBajaConfianzaParaIa(l: LineaContableDto): boolean {
  return lineaDudosaParaIa(l) && Boolean(l.rubroInstitucionalId);
}

function actualizarConteosLineasIa(pending: LineaContableDto[]): void {
  lineasPendientesCount.value = pending.length;
  lineasSinRubroIaCount.value = pending.filter(lineaSinRubroParaIa).length;
  lineasBajaConfianzaIaCount.value = pending.filter(lineaBajaConfianzaParaIa).length;
  lineasDudosasIaCount.value = pending.filter(lineaDudosaParaIa).length;
  lineasConRubroPendienteCount.value = pending.filter(
    (l) =>
      l.requiereRevision &&
      l.estado !== "aprobada" &&
      Boolean(l.rubroInstitucionalId) &&
      !lineaBajaConfianzaParaIa(l)
  ).length;
}

async function refreshLineasPendientes(): Promise<void> {
  try {
    const pending = await api.getCasoLineas(casoId, true);
    actualizarConteosLineasIa(pending);
  } catch {
    lineasPendientesCount.value = 0;
    lineasDudosasIaCount.value = 0;
    lineasSinRubroIaCount.value = 0;
    lineasBajaConfianzaIaCount.value = 0;
    lineasConRubroPendienteCount.value = 0;
  }
}

function buildAprobacionCheckLocal(): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (lineasPendientesCount.value > 0 && !aprobarIgnorarValidaciones.value) {
    motivos.push(`${lineasPendientesCount.value} línea(s) pendientes de revisión`);
  }
  if (validacionesPendientes.value.length > 0 && !aprobarIgnorarValidaciones.value) {
    motivos.push(`${validacionesPendientes.value.length} inconsistencia(s) sin confirmar por analista`);
  }
  if (!metaVerificado.value) {
    motivos.push("Identificación del documento sin confirmar por el analista");
  }
  return { ok: motivos.length === 0, motivos };
}

async function openAprobarModal(): Promise<void> {
  if (!caso.value || caso.value.estado === "informe_generado") return;
  if (caso.value.estado === "aprobado") {
    aprobarResultVersion.value = caso.value.version ?? 0;
    aprobarSuccessOpen.value = true;
    return;
  }
  aprobarModalError.value = "";
  aprobacionCheck.value = null;
  aprobarModalOpen.value = true;
  try {
    await refreshLineasPendientes();
    await refreshAprobacionBlockers();
    const motivos = aprobarIgnorarValidaciones.value
      ? aprobacionBlockers.value.filter((m) => !esMotivoValidacion(m))
      : [...aprobacionBlockers.value];
    if (validacionesPendientes.value.length > 0 && !aprobarIgnorarValidaciones.value) {
      motivos.push(`${validacionesPendientes.value.length} inconsistencia(s) sin confirmar por analista`);
    }
    if (!metaVerificado.value) {
      motivos.push("Identificación del documento sin confirmar por el analista");
    }
    aprobacionCheck.value = {
      ok: motivos.length === 0 && aprobarListo.value,
      motivos,
    };
  } catch {
    aprobacionCheck.value = buildAprobacionCheckLocal();
  }
}

function goBandeja(): void {
  aprobarSuccessOpen.value = false;
  router.push("/casos");
}

async function confirmAprobarFicha(): Promise<void> {
  if (!caso.value) return;
  approving.value = true;
  aprobarModalError.value = "";
  try {
    const esParcial = pendingCierreParcial.value;
    const ficha = await api.aprobarFicha(casoId, {
      version: caso.value.version ?? 0,
      observaciones: observaciones.value || undefined,
      ignorarValidacionesPendientes: aprobarIgnorarValidaciones.value || undefined,
      cierreParcial: esParcial || undefined,
      motivoCierreParcial: esParcial ? motivoCierreParcial.value.trim() : undefined,
    });
    aprobarResultVersion.value = ficha.version;
    ultimoCierreParcial.value = esParcial;
    aprobarModalOpen.value = false;
    aprobarSuccessOpen.value = true;
    pendingCierreParcial.value = false;
    await refreshCaso();
  } catch (e) {
    aprobarModalError.value = apiErrorMessage(e, "No se pudo aprobar la ficha");
  } finally {
    if (isMounted) approving.value = false;
  }
}

async function exportValidaciones(): Promise<void> {
  valStepError.value = "";
  try {
    await api.downloadValidacionesExport(casoId, "csv");
  } catch (e) {
    valStepError.value = e instanceof Error ? e.message : "Error al exportar";
  }
}

async function loadLineas(soloRevision = false): Promise<void> {
  lineas.value = await api.getCasoLineas(casoId, soloRevision);
  await refreshLineasPendientes();
}

function resetAgregarLineaForm(): void {
  nuevaLineaDenominacion.value = "";
  nuevaLineaMontoRaw.value = "";
  nuevaLineaRubroId.value = "";
  nuevaLineaPagina.value = 1;
  agregarLineaError.value = "";
}

function openAgregarLineaModal(): void {
  resetAgregarLineaForm();
  agregarLineaModalOpen.value = true;
}

async function confirmAgregarLinea(): Promise<void> {
  if (!documento.value || !agregarLineaFormValido.value) return;
  const monto = parseMontoInput(nuevaLineaMontoRaw.value);
  if (monto == null) {
    agregarLineaError.value = "Monto inválido";
    return;
  }
  agregarLineaSaving.value = true;
  agregarLineaError.value = "";
  lineaPanelMsg.value = "";
  lineaPanelError.value = "";
  try {
    await api.createLineaManual(casoId, {
      documentoId: documento.value.id,
      denominacionOriginal: nuevaLineaDenominacion.value.trim(),
      montoNormalizado: monto,
      rubroInstitucionalId: nuevaLineaRubroId.value,
      paginaNumero: nuevaLineaPagina.value || 1,
    });
    agregarLineaModalOpen.value = false;
    await refreshCaso();
    await loadLineas(false);
    await refreshAprobacionBlockers();
    lineaPanelMsg.value = "Línea agregada manualmente";
    document.getElementById("revision-lineas")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    agregarLineaError.value = apiErrorMessage(e, "No se pudo agregar la línea");
  } finally {
    agregarLineaSaving.value = false;
  }
}

async function loadProvenanceCaso(): Promise<void> {
  try {
    const resumen = await api.getCasoConfianzaResumen(casoId);
    provenanceCaso.value = resumen.provenance ?? null;
  } catch {
    provenanceCaso.value = null;
  }
}

async function refreshCaso(): Promise<void> {
  caso.value = await api.getCaso(casoId);
  void loadProvenanceCaso();
  validaciones.value = caso.value.validaciones ?? [];
  observaciones.value = caso.value.observaciones ?? "";
  metaMoneda.value = caso.value.moneda ?? "";
  metaEscala.value = caso.value.escala ?? "indeterminada";
  metaEjercicio.value = caso.value.periodoEjercicio;
  const doc = caso.value.documentos?.[0];
  const identidad = caso.value.identidadResuelta;
  metaRazonSocial.value =
    identidad?.razonSocial ||
    doc?.extractMetadata?.razonSocial ||
    caso.value.contribuyente?.razonSocial ||
    "";
  const rutResuelto = identidad?.rut && identidad.rut !== "—" ? identidad.rut : "";
  metaRut.value = rutResuelto || doc?.extractMetadata?.rut || caso.value.contribuyente?.rut || "";

  /* La confirmación es explícita por sesión — no restaurar desde auditoría al recargar. */
}

function goRevisionStep(index: number): void {
  if (index === 1 && !metaVerificado.value && !fichaCerrada.value) {
    metaStepError.value = "Confirmá la identificación antes de revisar líneas";
    scrollToIdentificacion();
    return;
  }
  metaStepError.value = "";
  revisionActiveStep.value = index;
  if (index === 0) {
    scrollToIdentificacion();
  }
}

async function reextraerMetadatosIa(): Promise<void> {
  metaStepMsg.value = "";
  metaStepError.value = "";
  metaReextrayendo.value = true;
  try {
    await api.reextraerMetadatos(casoId);
    await refreshCaso();
    metaConfirmado.value = false;
    metaStepMsg.value =
      "Datos re-leídos del PDF — revisá los valores y confirmá con el botón principal";
  } catch (e) {
    metaStepError.value = apiErrorMessage(e, "No se pudieron re-leer los datos del PDF");
  } finally {
    metaReextrayendo.value = false;
  }
}

async function confirmarIdentificacionMetadatos(): Promise<void> {
    await api.patchCasoMetadatos(casoId, {
      moneda: metaMoneda.value || undefined,
      escala: metaEscala.value,
      ejercicio: metaEjercicio.value,
      razonSocial: metaRazonSocial.value || undefined,
      rut: metaRut.value || undefined,
    });
    await refreshCaso();
  await loadLineas(false);
  metaGuardadoSnapshot.value = buildMetaSnapshot();
  metaConfirmado.value = true;
}

async function guardarMetadatos(): Promise<void> {
  metaSaving.value = true;
  metaStepMsg.value = "";
  metaStepError.value = "";
  try {
    await confirmarIdentificacionMetadatos();
    revisionActiveStep.value = 1;
    metaStepMsg.value =
      "Identificación confirmada — revisá las líneas y usá «Clasificar dudosas con IA» cuando quieras ayuda";
  } catch (e) {
    metaStepError.value = e instanceof Error ? e.message : "Error al guardar la identificación";
  } finally {
    metaSaving.value = false;
  }
}

function openReclasificarModal(): void {
  reclasificarDone.value = false;
  reclasificarError.value = "";
  reclasificarModalOpen.value = true;
}

function closeReclasificarModal(): void {
  reclasificarModalOpen.value = false;
  reclasificarDone.value = false;
  reclasificarError.value = "";
}

async function confirmReclasificarValidar(): Promise<void> {
  metaStepMsg.value = "";
  metaStepError.value = "";
  reclasificarError.value = "";
  reclasificarSaving.value = true;
  try {
    await api.reclasificarValidar(casoId);
    metaStepMsg.value = "Caso encolado para reclasificación y validación";
    reclasificarDone.value = true;
    await refreshCaso();
  } catch (e) {
    reclasificarError.value = e instanceof Error ? e.message : "No se pudo encolar la reclasificación";
  } finally {
    reclasificarSaving.value = false;
  }
}

async function init(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const cfg = await api.getConfig().catch(() => null);
    extractionProvider.value = cfg?.extractionProvider ?? "mock";
    umbralConfianza.value = cfg?.umbralConfianza ?? 85;
    await refreshCaso();
    if (!isMounted) return;
    documento.value = caso.value?.documentos?.[0] ?? null;
    if (!documento.value) {
      error.value = "El caso no tiene documentos";
      return;
    }
    rubros.value = await api.getCasoRubros(casoId);
    if (!isMounted) return;
    fichaHistorial.value = await api.getFichaHistorial(casoId).catch(() => []);
    consolidables.value = await api.getCasosConsolidables(casoId).catch(() => []);
    if (!isMounted) return;
    await loadLineas(false);
    if (isMounted) {
      revisionActiveStep.value = 0;
      metaConfirmado.value = false;
      metaGuardadoSnapshot.value = "";
      await refreshAprobacionBlockers();
      await syncClasificacionIaAlEntrar();
    }
  } catch (e) {
    if (!isMounted) return;
    error.value = e instanceof Error ? e.message : "Error al cargar";
  } finally {
    if (isMounted) loading.value = false;
  }
}

async function iniciarCargaManual(): Promise<void> {
  lineaPanelError.value = "";
  try {
    await api.iniciarCargaManual(casoId);
    await refreshCaso();
    await loadLineas(false);
    document.getElementById("revision-lineas")?.scrollIntoView({ behavior: "smooth", block: "start" });
    lineaPanelMsg.value = "Modo carga manual activado — agregue líneas abajo";
  } catch (e) {
    lineaPanelError.value = e instanceof Error ? e.message : "Error";
  }
}

async function onIaAplicada(): Promise<void> {
  lineaPanelMsg.value = "";
  lineaPanelError.value = "";
  try {
    await refreshCaso();
    await loadLineas(false);
    await refreshAprobacionBlockers();
    lineaPanelMsg.value = "Clasificación IA aplicada — revisá y aprobá si corresponde";
  } catch (e) {
    lineaPanelError.value = apiErrorMessage(e, "Error al refrescar líneas");
  }
}

async function openClasificacionIaConfirm(): Promise<void> {
  if (clasificacionIaMasivaLoading.value) return;
  await refreshLineasPendientes();
  if (lineasDudosasIaCount.value === 0) {
    lineaPanelMsg.value =
      lineasConRubroPendienteCount.value > 0
        ? "No hay líneas dudosas para IA — las pendientes tienen rubro con confianza suficiente"
        : "No hay líneas pendientes para clasificar con IA";
    return;
  }
  clasificacionIaConfirmOpen.value = true;
}

function truncarDenominacion(texto: string, max = 52): string {
  const t = texto.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function scrollToLineaRevision(lineaId: string): void {
  void nextTick(() => {
    document.getElementById(`revision-linea-${lineaId}`)?.scrollIntoView({ block: "center" });
  });
}

function aplicarProgresoClasificacionIaDesdeApi(p: ClasificacionIaProgresoDto): string | null {
  clasificacionIaProgresoTotal.value = p.total;
  clasificacionIaProgresoActual.value = p.procesadas;
  clasificacionIaTrabajandoEtapa.value =
    p.mensaje ??
    (p.lote === "sin_rubro"
      ? "Sin rubro"
      : p.lote === "baja_confianza"
        ? "Baja confianza"
        : "Clasificando con IA…");
  iaLineaEnCurso.value = p.lineaEnCurso ?? null;
  if (p.ultimasLineas?.length) {
    iaUltimasLineas.value = p.ultimasLineas;
    iaLineasRecientesIds.value = p.ultimasLineas
      .filter((e) => e.estado === "ok")
      .map((e) => e.lineaId)
      .slice(0, 20);
  }
  const cursoId = p.lineaEnCurso?.lineaId ?? p.lineaId ?? null;
  return cursoId;
}

function stopIaPollTimer(): void {
  if (iaPollTimer) {
    clearInterval(iaPollTimer);
    iaPollTimer = null;
  }
}

function startIaPollTimer(onTick?: (actual: number, total: number, etapa: string) => void): void {
  stopIaPollTimer();
  iaPollTimer = setInterval(() => {
    void tickClasificacionIaPoll(onTick).catch(() => {});
  }, 450);
}

async function onClasificacionIaTerminada(p: ClasificacionIaProgresoDto): Promise<void> {
  stopIaPollTimer();
  clasificacionIaMasivaLoading.value = false;
  await refreshCaso();
  await loadLineas(false);
  await refreshLineasPendientes();
  await refreshAprobacionBlockers();
  if (p.estado === "completado" && (p.actualizadas ?? 0) > 0) {
    lineaPanelMsg.value = `Clasificación IA lista — ${p.actualizadas} línea(s) actualizada(s)`;
  } else if (p.estado === "error") {
    lineaPanelError.value = p.error ?? p.mensaje ?? "Error en clasificación IA";
  }
  resetIaProgresoUi();
}

async function tickClasificacionIaPoll(
  onTick?: (actual: number, total: number, etapa: string) => void
): Promise<void> {
  const p = await api.getClasificacionIaProgreso(casoId);
  aplicarProgresoClasificacionIaDesdeApi(p);
  onTick?.(p.procesadas, p.total, clasificacionIaTrabajandoEtapa.value);

  if (p.estado === "en_curso") {
    if (p.procesadas > iaPollUltimoProcesadas.value && p.procesadas % 3 === 0) {
      iaPollUltimoProcesadas.value = p.procesadas;
      await loadLineas(false);
      await refreshLineasPendientes();
    } else if (p.procesadas > iaPollUltimoProcesadas.value) {
      iaPollUltimoProcesadas.value = p.procesadas;
    }
    return;
  }

  if (clasificacionIaMasivaLoading.value) {
    await onClasificacionIaTerminada(p);
  }
}

async function pollClasificacionIaProgreso(
  onTick?: (actual: number, total: number, etapa: string) => void
): Promise<void> {
  await tickClasificacionIaPoll(onTick);
}

async function syncClasificacionIaAlEntrar(): Promise<void> {
  try {
    const p = await api.getClasificacionIaProgreso(casoId);
    if (p.estado !== "en_curso") return;
    aplicarProgresoClasificacionIaDesdeApi(p);
    iaPollUltimoProcesadas.value = p.procesadas;
    clasificacionIaMasivaLoading.value = true;
    startIaPollTimer();
  } catch {
    /* ignorar — no bloquea la carga de revisión */
  }
}

function resetIaProgresoUi(): void {
  iaLineaEnCurso.value = null;
  iaUltimasLineas.value = [];
  iaLineasRecientesIds.value = [];
  iaPollUltimoProcesadas.value = 0;
  clasificacionIaProgresoActual.value = 0;
  clasificacionIaProgresoTotal.value = 0;
  clasificacionIaTrabajandoEtapa.value = "";
}

async function ejecutarClasificacionIaDudosas(opts?: {
  onProgreso?: (actual: number, total: number, etapa: string) => void;
}): Promise<{ actualizadas: number; errores: number; procesadas: number; omitidas?: number }> {
  if (lineasDudosasIaCount.value === 0) {
    return { actualizadas: 0, errores: 0, procesadas: 0 };
  }

  resetIaProgresoUi();
  clasificacionIaMasivaLoading.value = true;
  clasificacionIaProgresoTotal.value = lineasDudosasIaCount.value;
  clasificacionIaTrabajandoEtapa.value = "Iniciando clasificación en el servidor…";
  opts?.onProgreso?.(0, lineasDudosasIaCount.value, clasificacionIaTrabajandoEtapa.value);

  startIaPollTimer(opts?.onProgreso);

  try {
    const res = await api.clasificarLineasDudosasIa(casoId);
    await pollClasificacionIaProgreso(opts?.onProgreso);
    if (clasificacionIaMasivaLoading.value) {
      const p = await api.getClasificacionIaProgreso(casoId);
      await onClasificacionIaTerminada(p);
    } else {
      await refreshCaso();
      await loadLineas(false);
      await refreshAprobacionBlockers();
    }
    return {
      actualizadas: res.actualizadas,
      errores: res.errores,
      procesadas: res.procesadas,
      omitidas: res.omitidas,
    };
  } catch (e) {
    stopIaPollTimer();
    clasificacionIaMasivaLoading.value = false;
    resetIaProgresoUi();
    throw e;
  }
}

async function confirmClasificacionIa(): Promise<void> {
  if (clasificacionIaMasivaLoading.value || lineasDudosasIaCount.value === 0) return;
  clasificacionIaConfirmOpen.value = false;
  lineaPanelMsg.value = "";
  lineaPanelError.value = "";

  try {
    const res = await ejecutarClasificacionIaDudosas();
    if (res.procesadas === 0) {
      lineaPanelMsg.value = "No hay líneas dudosas para clasificar con IA";
      await refreshLineasPendientes();
      return;
    }
    const omitidasTxt =
      res.omitidas && res.omitidas > 0 ? ` · ${res.omitidas} ya estaban clasificadas por IA (omitidas)` : "";
    if (res.errores > 0) {
      lineaPanelMsg.value = `IA: ${res.actualizadas} guardada(s), ${res.errores} error(es)${omitidasTxt} — revisá las pendientes`;
    } else if (res.actualizadas === 0 && res.omitidas && res.omitidas > 0) {
      lineaPanelMsg.value = `Todas las líneas dudosas ya fueron clasificadas por IA (${res.omitidas}) — revisá y confirmá`;
    } else {
      lineaPanelMsg.value = `IA clasificó y guardó ${res.actualizadas} línea(s)${omitidasTxt} — revisá y confirmá`;
    }
  } catch (e) {
    lineaPanelError.value = apiErrorMessage(e, "Error en clasificación con IA");
  }
}

async function onAnalizarBalance(): Promise<void> {
  balanceAnalisisError.value = null;
  balanceAnalisisLoading.value = true;
  try {
    balanceAnalisis.value = await api.getBalanceAnalisis(casoId, { diagnosticoIa: true });
  } catch (e) {
    balanceAnalisisError.value = apiErrorMessage(e, "No se pudo analizar el balance");
  } finally {
    balanceAnalisisLoading.value = false;
  }
}

async function onReconciliarBalance(): Promise<void> {
  balanceReconciliarMsg.value = null;
  balanceAnalisisError.value = null;
  const ok = confirm(
    "Reconciliar balance: excluir totales/ER/flujo fuera del balance objetivo, eliminar duplicados ×1000, reclasificar patrimonio mal ubicado y crear ajuste en 3.9 si hace falta.\n\n¿Continuar?"
  );
  if (!ok) return;

  balanceReconciliarLoading.value = true;
  try {
    const res = await api.reconciliarBalance(casoId, { crearAjuste: true });
    balanceAnalisis.value = res.analisis;
    balanceReconciliarMsg.value = res.mensaje;
    await refreshCaso();
    await loadLineas(false);
    await refreshLineasPendientes();
    await refreshAprobacionBlockers();
    lineaPanelMsg.value = res.mensaje;
  } catch (e) {
    balanceAnalisisError.value = apiErrorMessage(e, "No se pudo reconciliar el balance");
  } finally {
    balanceReconciliarLoading.value = false;
  }
}

async function onEliminarDuplicados(): Promise<void> {
  lineaPanelMsg.value = "";
  lineaPanelError.value = "";

  const { duplicadasCount, gruposCount } = analisisDuplicadosLineas.value;
  if (duplicadasCount === 0) {
    lineaPanelMsg.value = "No hay duplicados para eliminar";
    return;
  }

  const ok = confirm(
    `Hay ${duplicadasCount} fila(s) duplicada(s) en ${gruposCount} grupo(s) (mismo concepto y monto).\n\nSe conservará en cada grupo la fila con mejor rubro y confianza.\n\n¿Eliminar duplicados?`
  );
  if (!ok) return;

  eliminarDuplicadosLoading.value = true;
  try {
    const res = await api.eliminarDuplicadosLineas(casoId);
    await refreshCaso();
    await loadLineas(false);
    await refreshLineasPendientes();
    await refreshAprobacionBlockers();
    lineaPanelMsg.value =
      res.eliminadas > 0
        ? `Se eliminaron ${res.eliminadas} duplicado(s) en ${res.grupos} grupo(s)`
        : "No había duplicados para eliminar";
  } catch (e) {
    lineaPanelError.value = apiErrorMessage(e, "No se pudieron eliminar los duplicados");
  } finally {
    eliminarDuplicadosLoading.value = false;
  }
}

async function onEliminarLinea(linea: LineaContableDto): Promise<void> {
  lineaPanelMsg.value = "";
  lineaPanelError.value = "";

  const monto = linea.montoNormalizado ?? linea.montoOriginal;
  const clave = lineaDuplicadoKey(linea);
  const similares = lineas.value.filter((l) => lineaDuplicadoKey(l) === clave);

  const conceptoCorto =
    linea.denominacionOriginal.length > 72
      ? `${linea.denominacionOriginal.slice(0, 72)}…`
      : linea.denominacionOriginal;

  let eliminarSimilares = false;
  if (similares.length > 1) {
    eliminarSimilares = confirm(
      `Hay ${similares.length} filas con el mismo concepto y monto.\n\n«${conceptoCorto}»\n\n¿Eliminar todas?\n\nAceptar = todas · Cancelar = solo esta fila`
    );
  } else if (!confirm(`¿Eliminar esta línea?\n\n«${conceptoCorto}»`)) {
    return;
  }

  try {
    const res = await api.deleteCasoLinea(casoId, linea.id, { eliminarSimilares });
    await refreshCaso();
    await loadLineas(false);
    await refreshLineasPendientes();
    await refreshAprobacionBlockers();
    lineaPanelMsg.value =
      res.eliminadas > 1
        ? `Se eliminaron ${res.eliminadas} líneas duplicadas`
        : "Línea eliminada";
  } catch (e) {
    lineaPanelError.value = apiErrorMessage(e, "No se pudo eliminar la línea");
  }
}

async function onPatchLinea(lineaId: string, data: Record<string, unknown>): Promise<void> {
  lineaPanelMsg.value = "";
  lineaPanelError.value = "";
  try {
    await api.patchCasoLinea(casoId, lineaId, data);
    await refreshCaso();
    await loadLineas(false);
    await refreshAprobacionBlockers();
    lineaPanelMsg.value = "Línea actualizada";
  } catch (e) {
    lineaPanelError.value = e instanceof Error ? e.message : "Error al guardar";
  }
}

async function onReclasificarMasiva(
  lineaId: string,
  data: { rubroInstitucionalId: string; motivo?: string }
): Promise<void> {
  lineaPanelMsg.value = "";
  lineaPanelError.value = "";
  try {
    const res = await api.reclasificarMasiva(casoId, {
      lineaOrigenId: lineaId,
      ...data,
    });
    await refreshCaso();
    await loadLineas(false);
    lineaPanelMsg.value = `${res.actualizadas} línea(s) reclasificadas`;
  } catch (e) {
    lineaPanelError.value = e instanceof Error ? e.message : "Error en reclasificación masiva";
  }
}

async function onApproveLinea(lineaId: string): Promise<void> {
  lineaPanelMsg.value = "";
  lineaPanelError.value = "";
  try {
    await api.approveCasoLinea(casoId, lineaId);
    await refreshCaso();
    await loadLineas(false);
    await refreshAprobacionBlockers();
    if (lineasPendientesCount.value === 0) {
      lineaPanelMsg.value = "Todas las líneas revisadas — podés aprobar la ficha";
    } else {
      lineaPanelMsg.value = `Aprobada · quedan ${lineasPendientesCount.value} pendiente(s)`;
    }
  } catch (e) {
    lineaPanelError.value = apiErrorMessage(e, "No se pudo aprobar la línea");
  }
}

onMounted(() => {
  isMounted = true;
  void init();
});

onUnmounted(() => {
  isMounted = false;
  stopIaPollTimer();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
  gap: 1rem;
}

.back {
  font-size: 0.875rem;
  color: var(--brand);
  text-decoration: none;
}

h1 {
  margin: 0.25rem 0;
}

.metadatos-card h3 {
  margin-top: 0;
}

.revision-ident-unified {
  border-left-width: 4px;
  border-left-style: solid;
  border-left-color: var(--line-2);
}

.revision-ident-unified--ok {
  border-left-color: var(--ok);
}

.revision-ident-unified--warn {
  border-left-color: var(--warn);
}

.revision-ident-unified--err {
  border-left-color: var(--bad);
}

.revision-ident-unified__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
  align-items: center;
  gap: 1rem 1.25rem;
  margin-bottom: 0.85rem;
}

.revision-ident-unified__head-left {
  min-width: 0;
}

.revision-ident-unified__head--no-empresa {
  grid-template-columns: minmax(0, 1fr) auto;
}

.revision-ident-unified__status {
  align-self: start;
}

.revision-empresa-titulo {
  margin: 0;
  padding: 0 0.5rem;
  text-align: center;
  font-size: clamp(1.15rem, 2.2vw, 1.55rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--brand-ink, var(--ink));
  word-break: break-word;
}

.revision-ident-unified__head h2 {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
}

.revision-ident-unified__ref {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.revision-ident-unified__num {
  margin-left: 0.35rem;
  font-weight: 600;
  color: var(--ink);
}

.revision-ident-unified__doc {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: var(--ink-faint);
}

.revision-ident-unified__hint {
  margin: 0 0 0.85rem;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.acciones-avanzadas__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.acciones-avanzadas__btn {
  width: 100%;
  justify-content: flex-start;
  gap: 0.5rem;
}

.acciones-avanzadas__btn--danger {
  color: var(--bad);
}

.cerrar-parcial-check {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 0.65rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.meta-fields {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.45rem 0.65rem;
}

.meta-fields .label {
  font-size: 0.7rem;
  margin-bottom: 0.15rem;
}

.meta-fields .input {
  font-size: 0.75rem;
  padding: 0.32rem 0.45rem;
}

.meta-field {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.meta-field__hint {
  margin: 0;
  font-size: 0.62rem;
  line-height: 1.25;
  color: var(--ink-faint);
}

.meta-provider-warn {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0.75rem 0 0;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--ink-soft);
  background: color-mix(in srgb, var(--warn) 10%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--warn) 30%, var(--line));
}

.meta-provider-warn i {
  color: var(--warn);
  margin-top: 0.1rem;
}

.meta-actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  align-items: center;
}

.meta-actions-info-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--line-2);
  border-radius: 999px;
  background: var(--panel);
  color: var(--brand);
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.meta-actions-info-btn:hover {
  background: var(--brand-soft);
  border-color: var(--brand-line);
  color: var(--brand-ink);
}

.meta-actions-info-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.val-panel {
  display: grid;
  gap: 1rem;
}

.val-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.val-summary__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--ink-soft);
}

.val-summary__chip strong {
  color: var(--ink);
  font-weight: 700;
}

.val-summary__chip--ok {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
  background: var(--ok-bg);
  color: var(--ok);
}

.val-summary__chip--pending {
  border-color: color-mix(in srgb, var(--bad) 35%, var(--line));
  background: var(--bad-bg);
  color: var(--bad);
}

.val-summary__chip--resolved {
  border-color: color-mix(in srgb, var(--brand) 30%, var(--line));
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
  color: var(--brand-ink, var(--brand));
}

.val-cards {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.65rem;
}

.val-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel);
  border-left-width: 4px;
}

.val-card--ok {
  border-left-color: var(--ok);
  background: color-mix(in srgb, var(--ok) 6%, var(--panel));
}

.val-card--fail.val-card--sev-critical {
  border-left-color: var(--bad);
  background: color-mix(in srgb, var(--bad) 8%, var(--panel));
}

.val-card--fail.val-card--sev-warning {
  border-left-color: var(--warn);
  background: color-mix(in srgb, var(--warn) 10%, var(--panel));
}

.val-card--fail.val-card--sev-info {
  border-left-color: color-mix(in srgb, var(--brand) 70%, var(--line));
  background: color-mix(in srgb, var(--brand) 6%, var(--panel));
}

.val-card--resolved-ok {
  border-left-color: var(--ok);
  opacity: 0.92;
}

.val-card--resolved-dismiss {
  border-left-color: var(--line-2);
  background: var(--panel-2);
  opacity: 0.85;
}

.val-card__icon {
  width: 2.1rem;
  height: 2.1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  flex-shrink: 0;
  font-size: 1rem;
}

.val-card--ok .val-card__icon {
  background: var(--ok-bg);
  color: var(--ok);
}

.val-card--fail.val-card--sev-critical .val-card__icon {
  background: var(--bad-bg);
  color: var(--bad);
}

.val-card--fail.val-card--sev-warning .val-card__icon {
  background: var(--warn-bg);
  color: var(--warn);
}

.val-card--fail.val-card--sev-info .val-card__icon {
  background: color-mix(in srgb, var(--brand) 12%, var(--panel));
  color: var(--brand);
}

.val-card--resolved-ok .val-card__icon {
  background: var(--ok-bg);
  color: var(--ok);
}

.val-card--resolved-dismiss .val-card__icon {
  background: var(--panel-2);
  color: var(--ink-faint);
}

.val-card__body {
  min-width: 0;
}

.val-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
}

.val-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--ink-soft);
}

.val-badge--tipo {
  background: var(--panel-2);
  color: var(--ink);
}

.val-badge--critical {
  border-color: color-mix(in srgb, var(--bad) 40%, var(--line));
  background: var(--bad-bg);
  color: var(--bad);
}

.val-badge--warning {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--line));
  background: var(--warn-bg);
  color: var(--warn);
}

.val-badge--info {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand) 10%, var(--panel));
  color: var(--brand-ink, var(--brand));
}

.val-badge--ok {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
  background: var(--ok-bg);
  color: var(--ok);
}

.val-card__msg {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--ink);
  font-weight: 500;
}

.val-card__status {
  margin: 0.35rem 0 0;
  font-size: 0.74rem;
  color: var(--ink-soft);
  line-height: 1.4;
}

.val-card__actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex-shrink: 0;
  align-self: center;
}

.val-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-width: 7.5rem;
  white-space: nowrap;
}

.val-btn--confirm {
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line));
  background: color-mix(in srgb, var(--warn) 12%, var(--panel));
  color: var(--ink);
}

.val-btn--confirm:hover:not(:disabled) {
  background: color-mix(in srgb, var(--warn) 22%, var(--panel));
  border-color: var(--warn);
}

.val-btn--dismiss {
  border: 1px solid var(--line-2);
  background: var(--panel-2);
  color: var(--ink-soft);
}

.val-btn--dismiss:hover:not(:disabled) {
  background: var(--panel);
  color: var(--ink);
}

.val-card__badge-done {
  align-self: center;
  flex-shrink: 0;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--ink-soft);
}

.val-card--resolved-ok .val-card__badge-done {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
  background: var(--ok-bg);
  color: var(--ok);
}

.revision-unified {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.revision-unified--with-footer {
  padding-bottom: 5.5rem;
}

.revision-section {
  margin-bottom: 0;
}

.revision-section__head {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  margin-bottom: 1rem;
}

.revision-section__head-main {
  flex: 1 1 auto;
  min-width: 0;
}

.revision-section__head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.revision-section__head-row--with-empresa {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) minmax(0, auto);
  align-items: center;
  gap: 0.75rem 1rem;
}

.revision-section__head-row--with-empresa .revision-section__head-actions {
  justify-self: end;
}

.revision-section__head-row--no-empresa {
  grid-template-columns: minmax(0, 1fr) minmax(0, auto);
}

@media (max-width: 900px) {
  .revision-ident-unified__head:not(.revision-ident-unified__head--no-empresa) {
    grid-template-columns: 1fr;
  }

  .revision-ident-unified__head .revision-empresa-titulo {
    order: -1;
    padding: 0.25rem 0 0.5rem;
  }

  .revision-section__head-row--with-empresa:not(.revision-section__head-row--no-empresa) {
    grid-template-columns: 1fr;
  }

  .revision-section__head-row--with-empresa .revision-empresa-titulo {
    order: -1;
    margin-bottom: 0.25rem;
  }

  .revision-section__head-row--with-empresa .revision-section__head-actions {
    justify-self: start;
  }
}

.revision-section__head-row h2 {
  margin: 0;
  font-size: 1.05rem;
  white-space: nowrap;
}

.revision-section__head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.revision-ia-masiva-btn {
  border: 1px solid color-mix(in srgb, var(--brand) 40%, var(--line));
  background: color-mix(in srgb, var(--brand) 10%, var(--panel));
  color: var(--brand);
  font-weight: 600;
}

.revision-ia-masiva-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--brand) 20%, var(--panel));
}

.revision-ia-masiva-btn__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.25rem;
  margin-left: 0.2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 25%, var(--panel));
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
}

.revision-section__head--lineas {
  margin-bottom: 0.75rem;
}

.revision-lineas-hint {
  margin: 0.45rem 0 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--ink-soft);
}

.revision-lineas-layout {
  display: block;
}

.revision-lineas-layout--split {
  display: grid;
  grid-template-columns: minmax(280px, 38%) 1fr;
  gap: 0.85rem;
  align-items: start;
}

.revision-lineas-layout__doc {
  position: sticky;
  top: 0.5rem;
  max-height: calc(100vh - 7rem);
  min-height: 420px;
}

.revision-lineas-layout__main {
  min-width: 0;
}

.revision-lineas--locked .revision-lineas-layout__main {
  pointer-events: none;
  opacity: 0.45;
  filter: grayscale(0.15);
}

.revision-step-gate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.85rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--warn) 40%, var(--line));
  background: color-mix(in srgb, var(--warn) 10%, var(--panel));
  font-size: 0.82rem;
  color: var(--ink-soft);
}

@media (max-width: 960px) {
  .revision-lineas-layout--split {
    grid-template-columns: 1fr;
  }

  .revision-lineas-layout__doc {
    position: relative;
    max-height: 420px;
  }
}

.revision-section__head p {
  margin: 0.3rem 0 0;
  font-size: 0.84rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.revision-section__hint {
  display: block;
  margin-top: 0.25rem;
  color: var(--brand);
  font-size: 0.8rem;
}

.revision-section--obs {
  padding-bottom: 1.25rem;
}

.revision-cuadratura__panel {
  border-radius: 12px;
  border: 1px solid var(--line);
  padding: 1rem 1.15rem;
  background: var(--panel-2);
}

.revision-cuadratura__panel--ok {
  border-color: color-mix(in srgb, var(--ok) 40%, var(--line));
  background: var(--ok-bg);
}

.revision-cuadratura__panel--fail {
  border-color: color-mix(in srgb, var(--bad) 40%, var(--line));
  background: var(--bad-bg);
}

.revision-cuadratura__verdict {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
  font-size: 1rem;
}

.revision-cuadratura__panel--ok .revision-cuadratura__verdict {
  color: var(--ok);
}

.revision-cuadratura__panel--fail .revision-cuadratura__verdict {
  color: var(--bad);
}

.revision-cuadratura__formula {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.55rem 0.75rem;
}

.revision-cuadratura__term {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.revision-cuadratura__num {
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

.revision-cuadratura__label {
  font-size: 0.72rem;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.revision-cuadratura__monto {
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.revision-cuadratura__op {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink-soft);
  padding-bottom: 0.15rem;
}

.revision-cuadratura__preview {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--warn);
}

.revision-cuadratura__hint {
  margin: 0.85rem 0 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

@media (max-width: 640px) {
  .revision-cuadratura__formula {
    flex-direction: column;
    align-items: flex-start;
  }

  .revision-cuadratura__op {
    display: none;
  }
}

.revision-form-footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.75rem 1.25rem;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border-top: 1px solid var(--line);
  backdrop-filter: blur(8px);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.06);
}

.revision-form-footer--closed {
  justify-content: flex-end;
}

.revision-form-footer__status {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-width: 0;
}

.revision-form-footer__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  font-size: 0.75rem;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--ink-soft);
}

.revision-form-footer__chip--ok {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
  background: var(--ok-bg);
  color: var(--ok);
}

.revision-form-footer__chip--warn {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--line));
  background: var(--warn-bg);
  color: var(--warn);
}

.revision-form-footer__chip--fail {
  border-color: color-mix(in srgb, var(--bad) 35%, var(--line));
  background: var(--bad-bg);
  color: var(--bad);
}

.revision-form-footer__actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-left: auto;
}

.revision-form-footer__override {
  display: inline-flex;
  align-items: flex-start;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--ink-soft);
  max-width: 16rem;
  line-height: 1.35;
  cursor: pointer;
}

.revision-form-footer__override input {
  margin-top: 0.15rem;
  flex-shrink: 0;
}

.revision-form-footer__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--warn);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
}

.evaluar-modal__toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.evaluar-modal__lead {
  margin: 0;
  font-size: 0.84rem;
  color: var(--ink-soft);
  line-height: 1.45;
  flex: 1;
}

.val-panel--modal {
  max-height: min(72vh, 680px);
  overflow-y: auto;
}

.agregar-linea-modal__row {
  display: grid;
  grid-template-columns: 1fr 6rem;
  gap: 0.75rem;
}

.agregar-linea-modal__field {
  min-width: 0;
}

.agregar-linea-modal__monto {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.revision-step {
  margin-bottom: 1rem;
}

.revision-step__head {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  margin-bottom: 1rem;
}

.revision-step__head > div:not(.revision-step__num) {
  flex: 1;
  min-width: 0;
}

.revision-step__head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.revision-step__head p {
  margin: 0.3rem 0 0;
  font-size: 0.84rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.revision-step__num {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
}

.revision-step__foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}

.revision-step__empty {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.88rem;
}

.historial-modal {
  display: grid;
  gap: 0.85rem;
}

.historial-modal__card {
  padding: 0.85rem 0.95rem;
  border-radius: 8px;
  background: var(--panel);
  border: 1px solid var(--line);
}

.historial-modal__card h4 {
  margin: 0 0 0.35rem;
  font-size: 0.84rem;
  color: var(--ink);
}

.historial-modal__desc {
  margin: 0 0 0.65rem;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--ink-soft);
}

.historial-modal__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
}

.historial-modal__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  background: var(--panel-2);
  font-size: 0.8rem;
  color: var(--ink-soft);
}

.aprobar-panel {
  display: grid;
  gap: 1rem;
  margin-bottom: 1.25rem;
  padding: 1rem 1.1rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--brand) 5%, var(--panel)) 0%,
    var(--panel-2) 100%
  );
}

.aprobar-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.aprobar-panel__title {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  color: var(--ink);
}

.aprobar-panel__lead {
  margin: 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.aprobar-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.aprobar-card {
  padding: 0.85rem 0.95rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel);
}

.aprobar-card--wide {
  grid-column: 1 / -1;
}

.aprobar-card h4 {
  margin: 0 0 0.55rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.aprobar-card h4 i {
  color: var(--brand);
  font-size: 0.85rem;
}

.aprobar-dl {
  margin: 0;
  display: grid;
  gap: 0.4rem;
}

.aprobar-dl div {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.aprobar-dl dt {
  margin: 0;
  color: var(--ink-faint);
  font-weight: 500;
}

.aprobar-dl dd {
  margin: 0;
  color: var(--ink);
  font-weight: 600;
  word-break: break-word;
}

.aprobar-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
}

.aprobar-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  padding: 0.55rem 0.4rem;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--panel-2);
  text-align: center;
}

.aprobar-stat strong {
  font-size: 1.15rem;
  line-height: 1;
  color: var(--ink);
}

.aprobar-stat span {
  font-size: 0.68rem;
  color: var(--ink-soft);
  line-height: 1.25;
}

.aprobar-stat--ok {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
  background: var(--ok-bg);
}

.aprobar-stat--ok strong {
  color: var(--ok);
}

.aprobar-stat--warn {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--line));
  background: var(--warn-bg);
}

.aprobar-stat--warn strong {
  color: var(--warn);
}

.aprobar-stat--neutral strong {
  color: var(--brand-ink, var(--brand));
}

.aprobar-blockers {
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.4rem;
}

.aprobar-blockers__item {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  font-size: 0.82rem;
  color: var(--bad);
  background: var(--bad-bg);
  border: 1px solid color-mix(in srgb, var(--bad) 30%, var(--line));
}

.aprobar-blockers__item i {
  margin-top: 0.15rem;
  flex-shrink: 0;
}

.aprobar-checklist {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.4rem;
}

.aprobar-checklist li {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  font-size: 0.82rem;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--ink-soft);
}

.aprobar-checklist__item--ok {
  border-color: color-mix(in srgb, var(--ok) 35%, var(--line));
  background: color-mix(in srgb, var(--ok) 8%, var(--panel));
  color: var(--ok);
  font-weight: 600;
}

.aprobar-checklist__item--fail {
  border-color: color-mix(in srgb, var(--bad) 30%, var(--line));
  background: color-mix(in srgb, var(--bad) 6%, var(--panel));
  color: var(--bad);
}

.aprobar-checklist__warn {
  margin-left: 0.25rem;
  font-weight: 700;
}

.aprobar-blocked {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  font-size: 0.82rem;
  color: var(--warn);
  background: var(--warn-bg);
  border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line));
}

.aprobar-modal-resumen {
  display: grid;
  gap: 0.45rem;
  padding: 0.75rem 0.85rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--brand) 25%, var(--line));
  background: color-mix(in srgb, var(--brand) 6%, var(--panel-2));
  margin-bottom: 0.25rem;
}

.aprobar-modal-resumen__row {
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 0.65rem;
  font-size: 0.82rem;
  align-items: baseline;
}

.aprobar-modal-resumen__label {
  color: var(--ink-faint);
  font-weight: 500;
}

.aprobar-modal-resumen__row strong,
.aprobar-modal-resumen__row em {
  color: var(--ink);
  font-style: normal;
  word-break: break-word;
}

.aprobar-modal-resumen__row--obs em {
  font-style: italic;
  color: var(--ink-soft);
  font-weight: 500;
}

.checklist-warn {
  color: var(--warn);
  font-weight: 600;
}

.step-inline-msg {
  margin: 0.65rem 0 0;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  font-size: 0.84rem;
}

.step-inline-msg--ok {
  background: var(--ok-bg);
  color: var(--ok);
  border: 1px solid color-mix(in srgb, var(--ok) 30%, var(--line));
}

.step-inline-msg--err {
  background: var(--bad-bg);
  color: var(--bad);
  border: 1px solid color-mix(in srgb, var(--bad) 25%, var(--line));
}

.revision-modal__ok-hint {
  margin: 0.75rem 0 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  background: var(--ok-bg);
  border: 1px solid color-mix(in srgb, var(--ok) 30%, var(--line));
  font-size: 0.84rem;
  color: var(--ink-soft);
}

.obs {
  width: 100%;
  margin-bottom: 1rem;
  resize: vertical;
}

.badge.verde,
.badge.amarillo,
.badge.rojo {
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-size: 0.75rem;
}

.loading {
  color: var(--ink-soft);
}

.alert-calidad {
  border-left: 4px solid #f59e0b;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.revision-head {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 52rem;
}

.revision-head__lead {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--ink);
  font-weight: 500;
}

.revision-head__sem {
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.revision-head__meta {
  margin: 0;
  font-size: 0.84rem;
  color: var(--ink-soft);
  line-height: 1.4;
}

.revision-head__meta strong {
  color: var(--ink);
  font-weight: 600;
}

.revision-head__pill {
  display: inline-block;
  padding: 0.08rem 0.45rem;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-weight: 600;
  color: var(--ink);
}

.revision-head__times {
  margin: 0;
  font-size: 0.78rem;
  color: var(--ink-faint);
}

.revision-meta-strip {
  margin-bottom: 0.75rem;
  padding: 0.55rem 0.7rem;
  border-width: 1px;
  border-style: solid;
  width: 100%;
  box-sizing: border-box;
}

.revision-meta-strip--ok {
  border-color: color-mix(in srgb, var(--ok) 40%, var(--line));
  background: color-mix(in srgb, var(--ok) 6%, var(--panel));
}

.revision-meta-strip--warn {
  border-color: color-mix(in srgb, var(--warn) 45%, var(--line));
  background: color-mix(in srgb, var(--warn) 8%, var(--panel));
}

.revision-meta-strip--err {
  border-color: color-mix(in srgb, var(--bad) 35%, var(--line));
  background: color-mix(in srgb, var(--bad) 5%, var(--panel));
}

.revision-meta-strip__line {
  display: grid;
  grid-template-columns:
    minmax(0, 1.25fr)
    minmax(0, 0.85fr)
    minmax(0, 1.05fr)
    minmax(0, 0.55fr)
    minmax(0, 0.5fr)
    minmax(0, 0.95fr)
    minmax(0, 0.62fr)
    minmax(0, 1.15fr);
  gap: 0 0.55rem;
  align-items: stretch;
  width: 100%;
  margin: 0;
}

.revision-meta-strip__line--pending {
  grid-template-columns:
    minmax(0, 1.15fr)
    minmax(0, 0.8fr)
    minmax(0, 1fr)
    minmax(0, 0.5fr)
    minmax(0, 0.48fr)
    minmax(0, 0.9fr)
    minmax(0, 0.58fr)
    minmax(0, 1.05fr)
    auto;
}

.revision-meta-strip__cell {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.14rem;
  min-width: 0;
  padding: 0.15rem 0.55rem;
  border-left: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
}

.revision-meta-strip__cell:first-child {
  padding-left: 0;
  border-left: none;
}

.revision-meta-strip__cell--action {
  justify-content: center;
  padding-right: 0;
  border-left: 1px solid color-mix(in srgb, var(--line) 75%, transparent);
}

.revision-meta-strip__action-btn {
  white-space: nowrap;
}

.revision-meta-strip__ref {
  display: block;
  margin: 0;
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revision-meta-strip__num {
  display: block;
  margin-top: 0.08rem;
  font-size: 0.64rem;
  font-weight: 500;
  line-height: 1.15;
  color: var(--ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revision-meta-strip__cell dt {
  margin: 0;
  font-size: 0.56rem;
  text-transform: uppercase;
  letter-spacing: 0.045em;
  color: var(--ink-faint);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.revision-meta-strip__cell dd {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revision-meta-strip__cell--status dd {
  overflow: visible;
}

.revision-meta-strip__cell--status .meta-status {
  display: inline-flex;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-status {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.12rem 0.4rem;
  border-radius: 999px;
}

.meta-status--ok {
  color: var(--ok);
  background: var(--ok-bg);
}

.meta-status--warn {
  color: var(--warn);
  background: var(--warn-bg);
}

.meta-status--pending {
  color: var(--bad);
  background: var(--bad-bg);
}

.meta-value--warn {
  color: var(--warn);
}

.meta-value--err {
  color: var(--bad);
  font-weight: 600;
}

.meta-missing-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0 0 0.85rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--bad);
  background: var(--bad-bg);
  border: 1px solid color-mix(in srgb, var(--bad) 30%, var(--line));
}

.meta-missing-banner i {
  margin-top: 0.1rem;
}

.meta-field--error .label {
  color: var(--bad);
}

.meta-field .req {
  color: var(--bad);
}

.input--error {
  border-color: var(--bad);
  background: color-mix(in srgb, var(--bad) 4%, var(--panel));
}

.val-card__guide {
  margin: 0.4rem 0 0;
  padding: 0.45rem 0.55rem;
  border-radius: 6px;
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--ink-soft);
  background: color-mix(in srgb, var(--brand) 6%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--brand) 18%, var(--line));
}

.aprobar-motivo-link {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--brand);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.meta-doc-name {
  font-weight: 500;
  font-size: 0.68rem;
  color: var(--ink-soft);
}

.revision-meta-strip__hint {
  margin: 0.35rem 0 0;
  padding-top: 0.35rem;
  border-top: 1px dashed color-mix(in srgb, var(--line) 80%, transparent);
  font-size: 0.68rem;
  line-height: 1.35;
  color: var(--ink-soft);
}

.metadatos-card h3 {
  margin-top: 0;
}

.historial-bar {
  margin-bottom: 1rem;
  font-size: 0.875rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.hist-item {
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}

.revision-modal__lead {
  margin: 0;
  font-size: 0.92rem;
  color: var(--ink-soft);
  line-height: 1.5;
}

.revision-modal__alert {
  margin: 0;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: var(--bad-bg);
  border: 1px solid color-mix(in srgb, var(--bad) 25%, var(--line));
  color: var(--ink);
  font-size: 0.88rem;
  line-height: 1.45;
}

.revision-modal__box {
  margin-top: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--line);
}

.revision-modal__box h4 {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--ink);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.revision-modal__box p {
  margin: 0;
  font-size: 0.86rem;
  color: var(--ink-soft);
  line-height: 1.5;
}

.revision-modal__list {
  margin: 0;
  padding-left: 1.15rem;
  font-size: 0.86rem;
  color: var(--ink-soft);
  line-height: 1.55;
}

.revision-modal__list li + li {
  margin-top: 0.3rem;
}

.revision-modal__warn {
  margin-top: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  background: var(--warn-bg);
  border: 1px solid color-mix(in srgb, var(--warn) 30%, var(--line));
  font-size: 0.84rem;
  color: var(--ink-soft);
}

.revision-modal__warn ul {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
}

.revision-modal__success {
  margin: 0;
  font-size: 0.95rem;
  color: var(--ok);
  line-height: 1.5;
}

.revision-modal__hint {
  margin: 0.65rem 0 0;
  font-size: 0.84rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.revision-modal__box--muted {
  background: var(--panel-2);
  border-style: dashed;
}

.revision-modal__box--muted h4 {
  color: var(--ink-soft);
}

.modal-form__actions .btn-primary {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.revision-ia-banner-top {
  position: sticky;
  top: 0.5rem;
  z-index: 25;
  margin: 0 0 0.85rem;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--brand) 12%, transparent);
}

.revision-ia-banner-top__title {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.35;
  color: var(--ink);
}

.revision-ia-banner-top__hint {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--ink-soft);
}

.revision-ia-banner-top__goto {
  margin-top: 0.55rem;
  font-size: 0.78rem;
}

.revision-ia-live {
  margin-bottom: 0.85rem;
  padding: 0.75rem 0.85rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--brand) 35%, var(--line));
  background: color-mix(in srgb, var(--brand-soft) 40%, var(--panel));
}

.revision-ia-live__head {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
}

.revision-ia-live__spinner {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 14%, var(--panel-2));
  color: var(--brand);
  flex-shrink: 0;
}

.revision-ia-live__main {
  flex: 1;
  min-width: 0;
}

.revision-ia-live__count {
  margin-left: 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--brand);
}

.revision-ia-live__curso {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  color: var(--brand-ink);
  font-weight: 600;
}

.revision-ia-live__curso--muted {
  color: var(--ink-soft);
  font-weight: 500;
}

.revision-ia-live__feed {
  margin: 0.65rem 0 0;
  padding: 0;
  list-style: none;
  max-height: 8.5rem;
  overflow-y: auto;
  border-top: 1px solid var(--line);
}

.revision-ia-live__feed-item {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.35rem 0;
  font-size: 0.72rem;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
}

.revision-ia-live__feed-item--ok i {
  color: var(--ok);
}

.revision-ia-live__feed-item--err i {
  color: var(--bad);
}

.revision-ia-live__feed-concepto {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revision-ia-live__feed-rubro {
  color: var(--ink-soft);
  white-space: nowrap;
}

.revision-ia-live__hint {
  margin: 0.45rem 0 0;
  font-size: 0.68rem;
  color: var(--ink-faint);
}

@media (max-width: 960px) {
  .aprobar-grid {
    grid-template-columns: 1fr;
  }

  .aprobar-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .meta-fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.btn-reinicio {
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 40%, var(--line));
}

.reinicio-modal__lead {
  margin: 0 0 0.75rem;
  line-height: 1.45;
}

.reinicio-modal__list {
  margin: 0 0 1rem;
  padding-left: 1.2rem;
  font-size: 0.875rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.btn-reinicio-confirm {
  background: var(--warn);
  border-color: var(--warn);
}

@media (max-width: 400px) {
  .meta-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 320px) {
  .meta-fields {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .val-card {
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
  }

  .val-card__actions,
  .val-card__badge-done {
    grid-column: 1 / -1;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .val-btn {
    min-width: 0;
    flex: 1 1 auto;
  }

  .revision-form-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .revision-form-footer__actions {
    margin-left: 0;
    justify-content: stretch;
  }

  .revision-form-footer__actions .btn-primary {
    flex: 1;
  }
}
</style>
