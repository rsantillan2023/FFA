<template>
  <div>
    <PageHeader page-key="casos">
      <template #actions>
        <button
          class="btn btn-ghost btn-action-stack btn-action-stack--header"
          type="button"
          title="Actualizar bandeja"
          aria-label="Actualizar bandeja"
          :disabled="loading"
          @click="load"
        >
          <i :class="['fas fa-arrows-rotate', { 'fa-spin': loading }]" aria-hidden="true"></i>
          <span>Actualizar</span>
        </button>
        <button
          v-if="casosTrabados.length"
          class="btn btn-ghost btn-action-stack btn-action-stack--header btn-trabados"
          type="button"
          :title="`Reprocesar ${casosTrabados.length} trabados`"
          :disabled="bulkReinicioRunning"
          @click="abrirBulkReinicio"
        >
          <i class="fas fa-rotate-left" aria-hidden="true"></i>
          <span>Trabados ({{ casosTrabados.length }})</span>
        </button>
        <button
          class="btn btn-ghost btn-action-stack btn-action-stack--header"
          type="button"
          title="Asistente IA"
          @click="openUploadAssist"
        >
          <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
          <span>Asistente</span>
        </button>
        <button
          class="btn btn-primary btn-action-stack btn-action-stack--header"
          type="button"
          title="Cargar documentos"
          @click="showUpload = true"
        >
          <i class="fas fa-cloud-arrow-up" aria-hidden="true"></i>
          <span>Cargar</span>
        </button>
      </template>
    </PageHeader>

    <CreateFormModal
      v-if="showUpload"
      v-model="showUpload"
      title="Cargar documentos"
      subtitle="Subí fichas en PDF o imagen. Se crearán casos nuevos y entrarán al procesamiento automático."
      assist-flow-id="cargar-ficha"
      :assist-context="uploadAssistContext"
      @focus-field="focusUploadField"
    >
      <form class="modal-form" @submit.prevent="onUpload">
        <label class="label">Nombre de referencia</label>
        <input
          v-model="referenciaCarga"
          class="input"
          type="text"
          required
          maxlength="160"
          placeholder="Ej. Balance TGS, Balance Clínica, Balance Loma Negra"
          data-assist-field="referencia"
        />
        <p class="hint">Nombre con el que identificás esta ficha en la bandeja.</p>
        <div data-assist-field="files">
          <FileDropzone
            v-model="selectedFiles"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            title="Arrastrá tus fichas acá o elegí archivos"
            hint="PDF, JPEG, PNG o WebP — hasta 50 MB por archivo."
            :busy="uploading"
          />
        </div>
        <label class="label">Email remitente (opcional — acuse)</label>
        <input
          v-model="remitenteEmail"
          class="input"
          type="email"
          placeholder="cliente@empresa.cl"
          data-assist-field="remitenteEmail"
        />
        <p v-if="uploadError" class="error-msg">{{ uploadError }}</p>
        <p v-if="uploadSuccess" class="success-msg">{{ uploadSuccess }}</p>
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" @click="showUpload = false">Cancelar</button>
          <button
            class="btn btn-primary"
            type="submit"
            data-assist-field="submit"
            :disabled="uploading || !puedeEnviarCarga"
          >
            {{ uploading ? "Subiendo…" : "Enviar a procesamiento" }}
          </button>
        </div>
      </form>
    </CreateFormModal>

    <div class="card filters">
      <label class="label">Estado</label>
      <select v-model="filtroEstado" class="input" @change="load()">
        <option :value="FILTRO_SIN_ERROR">Todos menos error</option>
        <option value="">Todos (incl. error)</option>
        <option v-for="(label, key) in ESTADO_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
      <label class="label">Confianza</label>
      <select v-model="filtroSemaforo" class="input" @change="load()">
        <option value="">Todas</option>
        <option value="verde">Alta</option>
        <option value="amarillo">Media — revisar</option>
        <option value="rojo">Baja — alerta</option>
      </select>
      <label class="checkbox-label">
        <input v-model="soloColaRevision" type="checkbox" @change="load()" />
        Solo cola revisión
      </label>
      <label class="checkbox-label">
        <input v-model="soloPendientesAnalista" type="checkbox" @change="load()" />
        Pendientes analista (Q.4)
      </label>
      <input
        v-model="busquedaGlobal"
        class="input search-global"
        placeholder="Buscar referencia, caso o contribuyente…"
        @input="onBuscar"
      />
      <button
        class="btn btn-ghost btn-refresh"
        type="button"
        title="Actualizar lista"
        aria-label="Actualizar lista"
        :disabled="loading"
        @click="load"
      >
        <i :class="['fas fa-arrows-rotate', { 'fa-spin': loading }]" aria-hidden="true"></i>
        <span class="btn-refresh__label">Actualizar</span>
      </button>
    </div>
    <div v-if="casosTrabados.length && !bulkReinicioRunning" class="card trabados-banner">
      <div class="trabados-banner__text">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <span>
          <strong>{{ casosTrabados.length }}</strong>
          {{ casosTrabados.length === 1 ? "ficha trabada" : "fichas trabadas" }}
          en procesamiento o error — podés reiniciarlas en fila con foja cero.
        </span>
      </div>
      <button class="btn btn-primary btn-sm" type="button" @click="abrirBulkReinicio">
        Reprocesar todas
      </button>
    </div>
    <div v-if="bulkReinicioRunning" class="card trabados-banner trabados-banner--running">
      <div class="trabados-banner__text">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span>
          Reiniciando <strong>{{ bulkReinicioActual }}</strong>
          ({{ bulkReinicioDone }}/{{ bulkReinicioTotal }})…
        </span>
      </div>
      <div class="trabados-banner__progress">
        <div
          class="trabados-banner__fill"
          :style="{ width: `${bulkReinicioPct}%` }"
        />
      </div>
    </div>
    <p v-if="listError" class="error-msg">{{ listError }}</p>
    <div v-if="resultadosBusqueda" class="search-results">
      <div v-if="resultadosBusqueda.casos.length">
        <strong>Casos</strong>
        <ul>
          <li v-for="c in resultadosBusqueda.casos" :key="c.id">
            <button type="button" class="link-btn" @click="irACaso(c.id)">
              {{ c.referencia || c.numero }} — {{ c.numero }} ({{ estadoLabel(c.estado) }})
            </button>
          </li>
        </ul>
      </div>
      <div v-if="resultadosBusqueda.contribuyentes.length">
        <strong>Contribuyentes</strong>
        <ul>
          <li v-for="ct in resultadosBusqueda.contribuyentes" :key="ct.id">
            <button type="button" class="link-btn" @click="filtrarPorContribuyente(ct.id)">
              {{ ct.razonSocial }} {{ ct.rut ? `(${ct.rut})` : "" }}
            </button>
          </li>
        </ul>
      </div>
      <p
        v-if="!resultadosBusqueda.casos.length && !resultadosBusqueda.contribuyentes.length"
        class="hint"
      >
        Sin resultados
      </p>
    </div>

    <CasosIngestFlow
      :counts="conteoPorEstado"
      :active-filter="filtroEstadoFlowActivo"
      @filter="filtrarDesdeFlow"
    />

    <div class="card casos-table-wrap">
      <table v-if="items.length" class="casos-table">
        <thead>
          <tr>
            <th>Número</th>
            <th>Referencia</th>
            <th class="th-compact th-canal">Canal</th>
            <th class="th-estado">Estado</th>
            <th title="Verde: lectura confiable · Amarillo: revisar · Rojo: requiere atención. El % es la confianza de clasificación.">
              Semáforo
            </th>
            <th class="th-compact">Progreso</th>
            <th title="Verde: listo · Azul: procesando · Rojo: detenido · Gris: pendiente. Pasá el mouse para el detalle.">
              Etapas
            </th>
            <th
              class="th-compact th-filas"
              title="Cuántas filas contables trae el PDF: cuentas, rubros y montos que el sistema pudo leer"
            >
              Filas que trae
            </th>
            <th class="th-compact th-fecha">Creado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in items" :key="c.id" :class="{ 'row-processing': casoEnProceso(c) }">
            <td class="td-numero">
              <span class="td-numero__line">
                <strong>{{ c.numero }}</strong>
                <span
                  v-if="casoEnProceso(c)"
                  class="badge processing badge--icon"
                  title="Procesando documento"
                >
                  <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                </span>
                <span v-if="c.procesamientoPausado" class="badge pausado">Pausado</span>
                <span v-if="c.prioridad" class="badge prio">P{{ c.prioridad }}</span>
              </span>
            </td>
            <td class="td-referencia" :title="referenciaGrilla(c) || undefined">
              {{ referenciaGrilla(c) || "—" }}
            </td>
            <td class="td-canal" :title="canalLabel(c.canal)">{{ canalLabelCompacto(c.canal) }}</td>
            <td class="td-estado">
              <span class="badge badge--estado" :class="c.estado" :title="estadoLabel(c.estado)">
                {{ estadoLabel(c.estado) }}
              </span>
            </td>
            <td class="td-confianza">
              <button
                type="button"
                class="td-confianza__btn"
                :aria-label="`Ver desglose de confianza: ${c.confianzaGlobal != null ? `${c.confianzaGlobal}%` : 'sin dato'}`"
                :title="`${confianzaSemaforoTooltip(c.confianzaGlobal, c.semaforo)} · Clic para ver desglose`"
                @click.stop="abrirConfianzaPanel(c, $event)"
              >
                <span class="td-confianza__stack">
                  <SemaforoIndicator
                    :value="semaforoGrillaDisplay(c)"
                    :hint="confianzaSemaforoTooltip(c.confianzaGlobal, c.semaforo)"
                  />
                  <span class="td-confianza__pct">
                    {{ c.confianzaGlobal != null ? `${c.confianzaGlobal}%` : "—" }}
                  </span>
                </span>
              </button>
            </td>
            <td class="td-progreso">
              <button
                v-if="casoEnProceso(c)"
                type="button"
                class="progress-cell progress-cell--active progress-cell--clickable"
                :title="`Ver estado del procesamiento · ${progresoEtapaLabel(c)} · ${progresoPct(c)}%`"
                @click="abrirProcesamiento(c)"
              >
                <span class="progress-label">
                  <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                  {{ progresoEtapaLabel(c) }}
                </span>
                <div class="progress-cell__bar">
                  <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: `${progresoPct(c)}%` }" />
                  </div>
                  <span class="progress-pct">{{ progresoPct(c) }}%</span>
                </div>
              </button>
              <div
                v-else-if="progresoCompletado(c)"
                class="progress-cell progress-cell--done"
              >
                <i class="fas fa-check-circle progress-done-icon" aria-hidden="true"></i>
                <span>100%</span>
              </div>
              <span v-else>—</span>
            </td>
            <td class="td-f1-lights">
              <PipelineF1Lights
                :etapas="pipelineMap[c.id]"
                :caso-label="tituloEtapasCaso(c)"
                :procesando="casoEnProceso(c)"
                @select="(etapa) => abrirDetalleEtapa(c.id, etapa)"
              />
            </td>
            <td
              class="td-filas"
              :title="`${c.lineasCount ?? 0} filas contables que trae este expediente (leídas del PDF)`"
            >
              {{ c.lineasCount ?? 0 }}
            </td>
            <td class="td-fecha">{{ formatDateCompacto(c.createdAt) }}</td>
            <td class="actions-cell">
              <button
                class="btn btn-ghost btn-action-stack"
                type="button"
                title="Editar ficha"
                @click="abrirEditar(c)"
              >
                <i class="fas fa-pen" aria-hidden="true"></i>
                <span>Editar</span>
              </button>
              <button
                class="btn btn-ghost btn-action-stack"
                type="button"
                title="Ver detalle"
                @click="verDetalle(c.id)"
              >
                <i class="fas fa-circle-info" aria-hidden="true"></i>
                <span>Detalle</span>
              </button>
              <RouterLink
                :to="{ name: 'caso-expediente', params: { id: c.id }, query: { from: 'casos' } }"
                class="btn btn-ghost btn-action-stack"
                title="Expediente"
              >
                <i class="fas fa-folder-open" aria-hidden="true"></i>
                <span>Exped.</span>
              </RouterLink>
              <RouterLink
                v-if="puedeIrARevision(c.estado)"
                :to="{ name: 'caso-revision', params: { id: c.id } }"
                :class="[
                  'btn btn-action-stack',
                  c.estado === CasoEstado.EN_REVISION ? 'btn-primary' : 'btn-ghost',
                ]"
                :title="c.estado === CasoEstado.EN_REVISION ? 'Revisar' : 'Revisión'"
              >
                <i class="fas fa-clipboard-check" aria-hidden="true"></i>
                <span>{{ c.estado === CasoEstado.EN_REVISION ? "Revisar" : "Revisión" }}</span>
              </RouterLink>
              <RouterLink
                v-if="puedeVerInforme(c.hasInforme)"
                :to="{ name: 'caso-informe', params: { id: c.id } }"
                class="btn btn-primary btn-action-stack"
                title="Ver informe"
              >
                <i class="fas fa-file-lines" aria-hidden="true"></i>
                <span>Informe</span>
              </RouterLink>
              <button
                v-if="casoTieneFalloExtraccionVisible(c.estado)"
                class="btn btn-action-stack btn-error-outline"
                type="button"
                :title="c.estado === CasoEstado.PENDIENTE_CALIDAD ? 'Ver detalle de la extracción fallida' : 'Ver error'"
                @click="verError(c.id)"
              >
                <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <span>{{ c.estado === CasoEstado.PENDIENTE_CALIDAD ? "Fallo" : "Error" }}</span>
              </button>
              <button
                v-if="puedeReiniciarFojaCero(c)"
                class="btn btn-action-stack btn-reinicio-grid"
                type="button"
                :title="reinicioPorProcesamientoMuerto(c.estado) ? 'Procesamiento trabado — volver a foja cero' : 'Reiniciar a foja cero'"
                @click="abrirReinicio(c)"
              >
                <i class="fas fa-rotate-left" aria-hidden="true"></i>
                <span>Foja 0</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loading" class="empty">Sin casos</p>
      <p v-if="loading">Cargando…</p>
      <p class="total">{{ total }} caso(s)</p>
    </div>

    <CreateFormModal
      v-if="showErrorModal"
      v-model="showErrorModal"
      :title="errorInfo?.titulo ?? 'Error del caso'"
      :subtitle="errorInfo ? `${errorInfo.numero}${errorInfo.referencia ? ` · ${errorInfo.referencia}` : ''}` : ''"
    >
      <div v-if="errorModalLoading" class="error-modal-loading">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        Cargando detalle del error…
      </div>
      <p v-else-if="errorModalFetchError" class="error-msg">{{ errorModalFetchError }}</p>
      <div v-else-if="errorInfo" class="error-modal-body">
        <p v-if="errorInfo.fecha" class="error-modal-fecha">
          {{ formatErrorFecha(errorInfo.fecha) }}
        </p>
        <div
          class="error-modal-msg"
          :class="{
            'error-modal-msg--duplicado': errorInfo.esDuplicado,
            'error-modal-msg--extraccion': errorInfo.esExtraccionFallida && !errorInfo.esDuplicado,
          }"
        >
          <i
            :class="errorInfo.esDuplicado ? 'fas fa-copy' : 'fas fa-circle-exclamation'"
            aria-hidden="true"
          ></i>
          <div>
            <p v-if="errorInfo.codigo" class="error-modal-codigo">{{ errorInfo.codigo }}</p>
            <p class="error-modal-msg__text">{{ errorInfo.mensaje }}</p>
          </div>
        </div>
        <div v-if="errorInfo.archivo" class="error-modal-archivo">
          <strong>Archivo</strong>
          <span>{{ errorInfo.archivo.nombre }}</span>
          <span v-if="errorInfo.archivo.tamanoMb != null">
            · {{ errorInfo.archivo.tamanoMb }} MB
          </span>
          <span v-if="errorInfo.archivo.paginas != null">
            · {{ errorInfo.archivo.paginas }} pág.
          </span>
        </div>
        <p v-if="errorInfo.esDuplicado" class="error-modal-hint">
          Este PDF ya existe en el sistema. Buscá el caso original en la bandeja o subí un archivo
          distinto.
        </p>
        <div v-if="errorInfo.detalles.length" class="error-modal-section">
          <p class="error-modal-section__title">Detalle</p>
          <ul class="error-modal-detalles">
            <li v-for="(det, idx) in errorInfo.detalles" :key="idx">{{ det }}</li>
          </ul>
        </div>
        <div v-if="errorInfo.sugerencias.length" class="error-modal-section">
          <p class="error-modal-section__title">Qué podés hacer</p>
          <ul class="error-modal-sugerencias">
            <li v-for="(sug, idx) in errorInfo.sugerencias" :key="idx">{{ sug }}</li>
          </ul>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" type="button" @click="showErrorModal = false">Cerrar</button>
        <button
          v-if="errorInfo && !errorModalLoading"
          class="btn btn-ghost"
          type="button"
          @click="verDetalleDesdeError"
        >
          Ver detalle completo
        </button>
      </template>
    </CreateFormModal>

    <CreateFormModal
      v-if="showReinicioModal"
      v-model="showReinicioModal"
      title="Volver a foja cero — re-leer PDF con IA"
      :subtitle="reinicioCaso ? `${reinicioCaso.numero}${reinicioCaso.referencia ? ` · ${reinicioCaso.referencia}` : ''}` : ''"
    >
      <div v-if="reinicioCaso" class="reinicio-modal">
        <p class="reinicio-modal__lead">
          El sistema <strong>vuelve a leer el archivo original con IA</strong> y arranca todo como si
          recién lo hubieras subido: preproceso, extracción, clasificación y validación.
        </p>
        <ul class="reinicio-modal__list">
          <li>Se borran líneas, metadatos extraídos y validaciones previas</li>
          <li>El PDF en storage se reutiliza — no hace falta volver a cargarlo</li>
          <li v-if="reinicioArchivaFichaInforme(reinicioCaso.estado)">
            La ficha e informe actuales quedan archivados; habrá que aprobar de nuevo
          </li>
          <li v-else>Útil si el procesamiento quedó trabado, falló o querés empezar de cero</li>
        </ul>
        <label class="label" for="casos-reinicio-motivo">Motivo (opcional)</label>
        <textarea
          id="casos-reinicio-motivo"
          v-model="reinicioMotivo"
          class="input textarea"
          rows="2"
          placeholder="Ej. procesamiento trabado, documento incorrecto…"
        />
        <p v-if="reinicioError" class="error-msg">{{ reinicioError }}</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" type="button" :disabled="reinicioSaving" @click="cerrarReinicioModal">
          Cancelar
        </button>
        <button
          class="btn btn-primary btn-reinicio-confirm"
          type="button"
          :disabled="reinicioSaving"
          @click="confirmReinicio"
        >
          {{ reinicioSaving ? "Reiniciando…" : "Sí, volver a foja cero" }}
        </button>
      </template>
    </CreateFormModal>

    <CreateFormModal
      v-if="showBulkReinicioModal"
      v-model="showBulkReinicioModal"
      title="Reprocesar fichas trabadas"
      :subtitle="`${casosTrabados.length} caso(s) en cola de reinicio`"
    >
      <div class="reinicio-modal">
        <p class="reinicio-modal__lead">
          Cada ficha vuelve a <strong>foja cero</strong>: se re-lee el PDF con IA y entra al
          pipeline de a uno (preproceso → extracción → clasificación → validación).
        </p>
        <ul class="reinicio-modal__list">
          <li>No hace falta volver a subir los archivos</li>
          <li>Los reinicios se encolan en serie — puede tardar varios minutos por PDF</li>
          <li>Fichas ya aprobadas o con informe no se incluyen</li>
        </ul>
        <p class="label">Casos a reiniciar</p>
        <ul class="bulk-reinicio-list">
          <li v-for="c in casosTrabados" :key="c.id">
            <span class="bulk-reinicio-list__num">{{ c.numero }}</span>
            <span v-if="c.referencia" class="bulk-reinicio-list__ref">{{ c.referencia }}</span>
            <span class="badge" :class="c.estado">{{ estadoLabel(c.estado) }}</span>
          </li>
        </ul>
        <p v-if="bulkReinicioError" class="error-msg">{{ bulkReinicioError }}</p>
      </div>
      <template #footer>
        <button
          class="btn btn-ghost"
          type="button"
          :disabled="bulkReinicioRunning"
          @click="showBulkReinicioModal = false"
        >
          Cancelar
        </button>
        <button
          class="btn btn-primary btn-reinicio-confirm"
          type="button"
          :disabled="bulkReinicioRunning || !casosTrabados.length"
          @click="confirmBulkReinicio"
        >
          {{ bulkReinicioRunning ? "Reiniciando…" : `Sí, reprocesar ${casosTrabados.length}` }}
        </button>
      </template>
    </CreateFormModal>

    <CreateFormModal
      v-if="showEditModal"
      v-model="showEditModal"
      title="Editar ficha"
      :subtitle="editCaso ? `${editCaso.numero}${editCaso.referencia ? ` · ${editCaso.referencia}` : ''}` : ''"
    >
      <form v-if="editCaso" class="modal-form" @submit.prevent="guardarEdicion">
        <label class="label" for="edit-referencia">Referencia</label>
        <input
          id="edit-referencia"
          v-model="editReferencia"
          class="input"
          type="text"
          required
          maxlength="160"
          placeholder="Nombre identificatorio en la bandeja"
        />
        <label class="label" for="edit-canal">Canal de recepción</label>
        <select id="edit-canal" v-model="editCanal" class="input">
          <option v-for="opt in CANAL_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <label class="label" for="edit-prioridad">Prioridad</label>
        <input
          id="edit-prioridad"
          v-model.number="editPrioridad"
          class="input"
          type="number"
          min="0"
          max="9"
          placeholder="0 = normal"
        />
        <p class="hint">Valores 1–9 elevan la ficha en la cola de procesamiento.</p>
        <label class="label" for="edit-obs">Observaciones</label>
        <textarea
          id="edit-obs"
          v-model="editObservaciones"
          class="input textarea"
          rows="3"
          maxlength="2000"
          placeholder="Notas internas del equipo (opcional)"
        />
        <p v-if="editError" class="error-msg">{{ editError }}</p>
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" :disabled="editSaving" @click="showEditModal = false">
            Cancelar
          </button>
          <button class="btn btn-primary" type="submit" :disabled="editSaving">
            {{ editSaving ? "Guardando…" : "Guardar cambios" }}
          </button>
        </div>
      </form>
    </CreateFormModal>

    <PipelineEtapaModal
      v-model="pipelineEtapaModalOpen"
      :loading="pipelineEtapaLoading"
      :error="pipelineEtapaError"
      :detalle="pipelineEtapaDetalle"
    />

    <ProcesamientoModal
      v-model="procesamientoModalOpen"
      :caso-numero="procesamientoCaso?.numero"
      :caso-id="procesamientoCaso?.id"
      :loading="procesamientoLoading"
      :error="procesamientoError"
      :progreso="procesamientoProgreso"
      :pipeline-etapas="procesamientoPipeline"
      @ver-detalle="verDetalleDesdeProcesamiento"
    />

    <ConfianzaSemaforoPanel
      :open="!!confianzaPanel"
      :caso-id="confianzaPanel?.casoId ?? ''"
      :confianza-global="confianzaPanel?.confianzaGlobal"
      :semaforo="confianzaPanel?.semaforo"
      :anchor-rect="confianzaPanel?.rect ?? null"
      @close="cerrarConfianzaPanel"
    />

    <CasoDetalleModal
      v-model="showDetalleModal"
      :loading="detalleLoading"
      :error="detalleError"
      :detalle="detalle"
      :lineas="lineas"
      :lineas-loading="detalleLineasLoading"
      :progreso="detalleProgreso"
      :pipeline-etapas="pipelineEtapas"
      @update:model-value="onDetalleModalChange"
    />
  </div>
</template>

<script setup lang="ts">
import {
  CasoEstado,
  casoReferenciaGrilla,
  confianzaSemaforoTooltip,
  semaforoDesdeConfianza,
  type CasoDto,
  type LineaContableDto,
} from "@ffa/shared";
import type {
  CasoProgresoDto,
  PipelineEtapaDetalleDto,
  PipelineEtapaDto,
} from "@ffa/shared";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { api, type CasoDetalleDto } from "../api/client";
import CasoDetalleModal from "../components/CasoDetalleModal.vue";
import PipelineEtapaModal from "../components/PipelineEtapaModal.vue";
import ProcesamientoModal from "../components/ProcesamientoModal.vue";
import CasosIngestFlow from "../components/CasosIngestFlow.vue";
import PipelineF1Lights from "../components/PipelineF1Lights.vue";
import ConfianzaSemaforoPanel from "../components/ConfianzaSemaforoPanel.vue";
import SemaforoIndicator from "../components/SemaforoIndicator.vue";
import CreateFormModal from "../components/CreateFormModal.vue";
import FileDropzone from "../components/FileDropzone.vue";
import PageHeader from "../components/PageHeader.vue";
import { useCloseOnRouteLeave } from "../composables/useCloseOnRouteLeave";
import { useCreateAssistListener } from "../utils/useCreateAssistListener";
import { apiErrorMessage } from "../utils/apiError";
import {
  esCasoTrabadoRecuperable,
  MOTIVO_REINICIO_TRABADO,
  puedeIrARevision,
  puedeReiniciarFojaCero,
  puedeVerInforme,
  reinicioArchivaFichaInforme,
  reinicioPorProcesamientoMuerto,
} from "../utils/casoAcciones";
import { CASO_ESTADO_LABELS, casoEstadoLabel } from "../utils/casoEstadoDisplay";
import {
  casoTieneFalloExtraccionVisible,
  extractCasoErrorInfo,
  type CasoErrorInfo,
} from "../utils/casoError";

const CANAL_OPTIONS = [
  { value: "portal", label: "Portal" },
  { value: "correo", label: "Correo" },
  { value: "manual_alternativa", label: "Manual / alternativa" },
] as const;

/** Valor especial de filtro — API excluye casos en estado error. */
const FILTRO_SIN_ERROR = "sin_error";

const ESTADO_LABELS = CASO_ESTADO_LABELS;

const SEMAFORO_RANK: Record<string, number> = { rojo: 3, amarillo: 2, verde: 1 };

/** Semáforo de grilla: el más restrictivo entre confianza % y validación contable. */
function semaforoGrillaDisplay(c: CasoDto): string | undefined {
  const fromPct = semaforoDesdeConfianza(c.confianzaGlobal);
  const validacion = c.semaforo;
  if (!fromPct && !validacion) return undefined;
  if (!fromPct) return validacion;
  if (!validacion) return fromPct;
  return (SEMAFORO_RANK[fromPct] ?? 0) >= (SEMAFORO_RANK[validacion] ?? 0) ? fromPct : validacion;
}

const showReinicioModal = ref(false);
const reinicioCaso = ref<CasoDto | null>(null);
const reinicioMotivo = ref("");
const reinicioSaving = ref(false);
const reinicioError = ref("");

const casosTrabados = ref<CasoDto[]>([]);
const showBulkReinicioModal = ref(false);
const bulkReinicioRunning = ref(false);
const bulkReinicioError = ref("");
const bulkReinicioDone = ref(0);
const bulkReinicioTotal = ref(0);
const bulkReinicioActual = ref("");
const bulkReinicioPct = computed(() =>
  bulkReinicioTotal.value
    ? Math.round((bulkReinicioDone.value / bulkReinicioTotal.value) * 100)
    : 0
);

const showEditModal = ref(false);
const editCaso = ref<CasoDto | null>(null);
const editReferencia = ref("");
const editCanal = ref("portal");
const editPrioridad = ref(0);
const editObservaciones = ref("");
const editSaving = ref(false);
const editError = ref("");

const items = ref<CasoDto[]>([]);
const total = ref(0);
const loading = ref(false);
const listError = ref("");
const showUpload = ref(false);
const uploading = ref(false);
const uploadError = ref<string | null>(null);
const uploadSuccess = ref<string | null>(null);
const referenciaCarga = ref("");
const remitenteEmail = ref("");
const selectedFiles = ref<File[]>([]);
const puedeEnviarCarga = computed(
  () => referenciaCarga.value.trim().length >= 2 && selectedFiles.value.length > 0
);
const uploadAssistContext = computed(() => ({
  referencia: referenciaCarga.value.trim(),
  filesCount: selectedFiles.value.length,
  remitenteEmail: remitenteEmail.value.trim(),
  submit: puedeEnviarCarga.value,
}));

function openUploadAssist(): void {
  showUpload.value = true;
}

function focusUploadField(field: string): void {
  showUpload.value = true;
  if (field === "files" || field === "referencia") return;
}

useCreateAssistListener("cargar-ficha", () => {
  showUpload.value = true;
}, focusUploadField);

useCloseOnRouteLeave(showUpload);
useCloseOnRouteLeave(showEditModal);
useCloseOnRouteLeave(showReinicioModal);
useCloseOnRouteLeave(showBulkReinicioModal);
const filtroEstado = ref(FILTRO_SIN_ERROR);

const conteoPorEstado = computed(() => {
  const map: Record<string, number> = {};
  for (const c of items.value) {
    map[c.estado] = (map[c.estado] ?? 0) + 1;
  }
  return map;
});

const filtroEstadoFlowActivo = computed(() =>
  filtroEstado.value === FILTRO_SIN_ERROR ? "" : filtroEstado.value
);

function filtrarDesdeFlow(estado: string): void {
  if (!estado) {
    filtroEstado.value = FILTRO_SIN_ERROR;
  } else {
    filtroEstado.value = estado;
  }
  soloColaRevision.value = false;
  soloPendientesAnalista.value = false;
  void load();
}
const filtroSemaforo = ref("");
const soloColaRevision = ref(false);
const soloPendientesAnalista = ref(false);
const busquedaGlobal = ref("");
const resultadosBusqueda = ref<{
  casos: Array<{ id: string; numero: string; referencia?: string; estado: string }>;
  contribuyentes: Array<{ id: string; rut?: string; razonSocial: string }>;
} | null>(null);
let buscarTimer: ReturnType<typeof setTimeout> | null = null;
const showErrorModal = ref(false);
const errorModalLoading = ref(false);
const errorModalFetchError = ref("");
const errorInfo = ref<CasoErrorInfo | null>(null);
const errorCasoId = ref<string | null>(null);
const showDetalleModal = ref(false);
const confianzaPanel = ref<{
  casoId: string;
  confianzaGlobal?: number | null;
  semaforo?: string;
  rect: DOMRect;
} | null>(null);
const detalleLoading = ref(false);
const detalleError = ref<string | null>(null);
const detalle = ref<CasoDetalleDto | null>(null);
const lineas = ref<LineaContableDto[]>([]);
const detalleLineasLoading = ref(false);
const progresoMap = ref<Record<string, number>>({});
const progresoEtapaMap = ref<Record<string, string>>({});
/** Casos recién subidos o en pipeline — seguir polling hasta terminar. */
const procesandoIds = ref<Record<string, true>>({});
const detalleProgreso = ref<CasoProgresoDto | null>(null);
const pipelineEtapas = ref<PipelineEtapaDto[]>([]);
const pipelineMap = ref<Record<string, PipelineEtapaDto[]>>({});
const pipelineEtapaModalOpen = ref(false);
const pipelineEtapaLoading = ref(false);
const pipelineEtapaError = ref<string | null>(null);
const pipelineEtapaDetalle = ref<PipelineEtapaDetalleDto | null>(null);
const procesamientoModalOpen = ref(false);
const procesamientoLoading = ref(false);
const procesamientoError = ref<string | null>(null);
const procesamientoProgreso = ref<CasoProgresoDto | null>(null);
const procesamientoPipeline = ref<PipelineEtapaDto[]>([]);
const procesamientoCaso = ref<CasoDto | null>(null);
useCloseOnRouteLeave(showDetalleModal);
useCloseOnRouteLeave(pipelineEtapaModalOpen);
useCloseOnRouteLeave(procesamientoModalOpen);
useCloseOnRouteLeave(showErrorModal);
let progresoTimer: ReturnType<typeof setInterval> | null = null;
let detalleProgresoTimer: ReturnType<typeof setInterval> | null = null;
let procesamientoTimer: ReturnType<typeof setInterval> | null = null;
let isMounted = false;

const PROCESSING_ESTADOS = new Set([
  CasoEstado.RECIBIDO,
  CasoEstado.EN_COLA,
  CasoEstado.PREPROCESANDO,
  CasoEstado.EXTRAYENDO,
  CasoEstado.NORMALIZANDO,
  CasoEstado.CLASIFICANDO,
  CasoEstado.VALIDANDO,
]);

function isProcessing(estado: string): boolean {
  return PROCESSING_ESTADOS.has(estado as CasoEstado);
}

function progresoPct(c: CasoDto): number {
  return progresoMap.value[c.id] ?? 0;
}

const ETAPA_PROGRESO_LABELS: Record<string, string> = {
  recibido: "Recibido",
  en_cola: "En cola",
  preprocess: "Preproceso",
  extract: "Extracción IA",
  normalize: "Normalización",
  classify: "Clasificación",
  validate: "Validación",
  en_revision: "Listo p/ revisión",
  completado: "Completado",
  reinicio: "Reinicio",
};

function progresoEtapaLabel(c: CasoDto): string {
  const key = progresoEtapaMap.value[c.id];
  if (key && ETAPA_PROGRESO_LABELS[key]) return ETAPA_PROGRESO_LABELS[key];
  return estadoLabel(c.estado);
}

function casoEnProceso(c: CasoDto): boolean {
  if (procesandoIds.value[c.id]) return true;
  if (isProcessing(c.estado)) return true;
  const pct = progresoMap.value[c.id];
  return pct != null && pct < 100 && !puedeIrARevision(c.estado);
}

function progresoCompletado(c: CasoDto): boolean {
  return !casoEnProceso(c) && progresoMap.value[c.id] === 100;
}

function marcarProcesando(id: string, pct = 5): void {
  procesandoIds.value = { ...procesandoIds.value, [id]: true };
  progresoMap.value = { ...progresoMap.value, [id]: progresoMap.value[id] ?? pct };
}

function desmarcarProcesando(id: string): void {
  const next = { ...procesandoIds.value };
  delete next[id];
  procesandoIds.value = next;
}

function patchCasoDto(detalle: CasoDetalleDto): CasoDto {
  const { estadoHistorial: _h, documentos: _d, validaciones: _v, ...caso } = detalle;
  return caso;
}

async function actualizarCasoEnLista(id: string): Promise<void> {
  try {
    const fresh = await api.getCaso(id);
    if (!isMounted) return;
    const idx = items.value.findIndex((c) => c.id === id);
    if (idx >= 0) {
      const next = [...items.value];
      next[idx] = patchCasoDto(fresh);
      items.value = next;
    }
    if (isProcessing(fresh.estado)) {
      marcarProcesando(id, progresoMap.value[id]);
    } else {
      desmarcarProcesando(id);
      if (puedeIrARevision(fresh.estado)) {
        progresoMap.value = { ...progresoMap.value, [id]: 100 };
        progresoEtapaMap.value = { ...progresoEtapaMap.value, [id]: "en_revision" };
      }
    }
    void refreshPipelineCasos([id]);
  } catch {
    /* ignore */
  }
}

function estadoLabel(estado: string): string {
  return casoEstadoLabel(estado);
}

function referenciaGrilla(c: CasoDto): string {
  return casoReferenciaGrilla(c);
}

function tituloEtapasCaso(c: CasoDto): string {
  return c.referencia?.trim() || c.numero;
}

function canalLabel(canal: string): string {
  return CANAL_OPTIONS.find((o) => o.value === canal)?.label ?? canal;
}

const CANAL_LABELS_COMPACT: Record<string, string> = {
  portal: "Portal",
  correo: "Correo",
  manual_alternativa: "Manual",
};

function canalLabelCompacto(canal: string): string {
  return CANAL_LABELS_COMPACT[canal] ?? canalLabel(canal);
}

function cerrarReinicioModal(): void {
  showReinicioModal.value = false;
}

watch(showReinicioModal, (open) => {
  if (!open) {
    reinicioSaving.value = false;
    reinicioError.value = "";
    reinicioCaso.value = null;
  }
});

function abrirReinicio(c: CasoDto): void {
  reinicioSaving.value = false;
  reinicioError.value = "";
  reinicioCaso.value = c;
  reinicioMotivo.value = reinicioPorProcesamientoMuerto(c.estado)
    ? "Procesamiento trabado — reinicio desde bandeja"
    : "";
  showReinicioModal.value = true;
}

async function escanearCasosTrabados(): Promise<void> {
  try {
    const trabados: CasoDto[] = [];
    let page = 1;
    const limit = 50;
    while (true) {
      const res = await api.listCasos({}, page, limit);
      trabados.push(...res.items.filter(esCasoTrabadoRecuperable));
      if (page * limit >= res.total) break;
      page += 1;
    }
    if (!isMounted) return;
    casosTrabados.value = trabados.sort((a, b) =>
      a.numero.localeCompare(b.numero, undefined, { numeric: true })
    );
  } catch {
    /* ignore — el banner es auxiliar */
  }
}

async function abrirBulkReinicio(): Promise<void> {
  bulkReinicioError.value = "";
  await escanearCasosTrabados();
  if (!casosTrabados.value.length) return;
  showBulkReinicioModal.value = true;
}

async function confirmBulkReinicio(): Promise<void> {
  const cola = [...casosTrabados.value];
  if (!cola.length || bulkReinicioRunning.value) return;
  bulkReinicioRunning.value = true;
  bulkReinicioError.value = "";
  bulkReinicioDone.value = 0;
  bulkReinicioTotal.value = cola.length;
  showBulkReinicioModal.value = false;
  const fallidos: string[] = [];
  for (const c of cola) {
    if (!isMounted) break;
    bulkReinicioActual.value = c.numero;
    try {
      const res = await api.reiniciarFojaCero(c.id, MOTIVO_REINICIO_TRABADO);
      const updated = res.caso ?? c;
      const idx = items.value.findIndex((x) => x.id === updated.id);
      if (idx >= 0 && res.caso) {
        items.value[idx] = { ...items.value[idx], ...res.caso };
      }
      marcarProcesando(updated.id, 5);
    } catch {
      fallidos.push(c.numero);
    } finally {
      bulkReinicioDone.value += 1;
    }
  }
  bulkReinicioRunning.value = false;
  bulkReinicioActual.value = "";
  void escanearCasosTrabados();
  void refreshProgresoLista();
  void load();
  if (fallidos.length) {
    bulkReinicioError.value = `No se pudieron reiniciar: ${fallidos.join(", ")}`;
    showBulkReinicioModal.value = true;
  }
}

async function confirmReinicio(): Promise<void> {
  if (!reinicioCaso.value) return;
  reinicioSaving.value = true;
  reinicioError.value = "";
  try {
    const res = await api.reiniciarFojaCero(
      reinicioCaso.value.id,
      reinicioMotivo.value.trim() || undefined
    );
    const updated = res.caso ?? reinicioCaso.value;
    const idx = items.value.findIndex((x) => x.id === updated.id);
    if (idx >= 0 && res.caso) {
      items.value[idx] = { ...items.value[idx], ...res.caso };
    }
    cerrarReinicioModal();
    marcarProcesando(updated.id, 5);
    void refreshProgresoLista();
    void escanearCasosTrabados();
    if (detalle.value?.id === updated.id && res.caso) {
      detalle.value = { ...detalle.value, ...res.caso };
    }
  } catch (e) {
    reinicioError.value = apiErrorMessage(e, "No se pudo reiniciar el caso");
  } finally {
    reinicioSaving.value = false;
  }
}

function abrirEditar(c: CasoDto): void {
  editCaso.value = c;
  editReferencia.value = c.referencia ?? "";
  editCanal.value = c.canal || "portal";
  editPrioridad.value = c.prioridad ?? 0;
  editObservaciones.value = c.observaciones ?? "";
  editError.value = "";
  showEditModal.value = true;
  if (!c.observaciones) {
    void api.getCaso(c.id).then((det) => {
      if (editCaso.value?.id === c.id) {
        editObservaciones.value = det.observaciones ?? "";
      }
    }).catch(() => undefined);
  }
}

async function guardarEdicion(): Promise<void> {
  if (!editCaso.value) return;
  const ref = editReferencia.value.trim();
  if (ref.length < 2) {
    editError.value = "La referencia debe tener al menos 2 caracteres";
    return;
  }
  editSaving.value = true;
  editError.value = "";
  try {
    const updated = await api.patchCaso(editCaso.value.id, {
      referencia: ref,
      canal: editCanal.value,
      prioridad: editPrioridad.value,
      observaciones: editObservaciones.value.trim() || null,
    });
    const idx = items.value.findIndex((x) => x.id === updated.id);
    if (idx >= 0) {
      items.value[idx] = { ...items.value[idx], ...updated };
    }
    if (detalle.value?.id === updated.id) {
      detalle.value = { ...detalle.value, ...updated };
    }
    showEditModal.value = false;
    editCaso.value = null;
  } catch (e) {
    editError.value = apiErrorMessage(e, "No se pudo guardar los cambios");
  } finally {
    editSaving.value = false;
  }
}

function formatDateCompacto(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatErrorFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function verError(id: string): Promise<void> {
  errorCasoId.value = id;
  showErrorModal.value = true;
  errorModalLoading.value = true;
  errorModalFetchError.value = "";
  errorInfo.value = null;
  try {
    const caso = await api.getCaso(id);
    errorInfo.value = extractCasoErrorInfo(caso);
  } catch (e) {
    errorModalFetchError.value = apiErrorMessage(e, "No se pudo cargar el error del caso");
  } finally {
    errorModalLoading.value = false;
  }
}

async function verDetalleDesdeError(): Promise<void> {
  const id = errorCasoId.value;
  if (!id) return;
  showErrorModal.value = false;
  await verDetalle(id);
}

function onDetalleModalChange(open: boolean): void {
  if (!open) {
    detalle.value = null;
    lineas.value = [];
    detalleError.value = null;
    pipelineEtapas.value = [];
    stopDetalleProgreso();
  }
}

async function refreshPipelineCasos(casoIds: string[]): Promise<void> {
  if (!casoIds.length || !isMounted) return;
  await Promise.all(
    casoIds.map(async (id) => {
      try {
        const etapas = await api.getPipelineEtapas(id);
        if (!isMounted) return;
        pipelineMap.value = { ...pipelineMap.value, [id]: etapas };
      } catch {
        /* ignore */
      }
    })
  );
}

function stopProcesamientoPoll(): void {
  if (procesamientoTimer) {
    clearInterval(procesamientoTimer);
    procesamientoTimer = null;
  }
}

async function pollProcesamientoModal(casoId: string): Promise<void> {
  try {
    const [p, etapas] = await Promise.all([
      api.getCasoProgreso(casoId),
      api.getPipelineEtapas(casoId).catch(() => []),
    ]);
    if (!isMounted) return;
    procesamientoProgreso.value = p;
    if (etapas.length) procesamientoPipeline.value = etapas;
    if (!isProcessing(p.estado)) {
      stopProcesamientoPoll();
      await actualizarCasoEnLista(casoId);
    }
  } catch (e) {
    if (procesamientoModalOpen.value) {
      procesamientoError.value = apiErrorMessage(e, "No se pudo consultar el progreso");
    }
    stopProcesamientoPoll();
  }
}

function abrirConfianzaPanel(c: CasoDto, event: MouseEvent): void {
  const el = event.currentTarget as HTMLElement | null;
  if (confianzaPanel.value?.casoId === c.id) {
    confianzaPanel.value = null;
    return;
  }
  confianzaPanel.value = {
    casoId: c.id,
    confianzaGlobal: c.confianzaGlobal,
    semaforo: semaforoGrillaDisplay(c),
    rect: el?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, 120, 0, 0),
  };
}

function cerrarConfianzaPanel(): void {
  confianzaPanel.value = null;
}

async function abrirProcesamiento(c: CasoDto): Promise<void> {
  stopProcesamientoPoll();
  procesamientoCaso.value = c;
  procesamientoModalOpen.value = true;
  procesamientoLoading.value = true;
  procesamientoError.value = null;
  procesamientoProgreso.value = null;
  procesamientoPipeline.value = [];
  try {
    const [p, etapas] = await Promise.all([
      api.getCasoProgreso(c.id),
      api.getPipelineEtapas(c.id).catch(() => []),
    ]);
    if (!isMounted) return;
    procesamientoProgreso.value = p;
    procesamientoPipeline.value = etapas;
    progresoMap.value = { ...progresoMap.value, [c.id]: p.progresoPct };
    if (p.etapaActual) {
      progresoEtapaMap.value = { ...progresoEtapaMap.value, [c.id]: p.etapaActual };
    }
    if (isProcessing(p.estado)) {
      procesamientoTimer = setInterval(() => pollProcesamientoModal(c.id), 2000);
    }
  } catch (e) {
    procesamientoError.value = apiErrorMessage(e, "No se pudo cargar el estado del procesamiento");
  } finally {
    procesamientoLoading.value = false;
  }
}

function verDetalleDesdeProcesamiento(casoId: string): void {
  procesamientoModalOpen.value = false;
  stopProcesamientoPoll();
  void verDetalle(casoId);
}

watch(procesamientoModalOpen, (open) => {
  if (!open) {
    stopProcesamientoPoll();
    procesamientoCaso.value = null;
    procesamientoProgreso.value = null;
    procesamientoPipeline.value = [];
    procesamientoError.value = null;
  }
});

async function abrirDetalleEtapa(casoId: string, etapa: PipelineEtapaDto): Promise<void> {
  pipelineEtapaModalOpen.value = true;
  pipelineEtapaLoading.value = true;
  pipelineEtapaError.value = null;
  pipelineEtapaDetalle.value = null;
  try {
    pipelineEtapaDetalle.value = await api.getPipelineEtapaDetalle(casoId, etapa.id);
  } catch (e) {
    pipelineEtapaError.value = apiErrorMessage(e, "No se pudo cargar el detalle del paso");
  } finally {
    pipelineEtapaLoading.value = false;
  }
}

async function refreshProgresoLista(): Promise<void> {
  if (!isMounted) return;
  const processing = items.value.filter((c) => casoEnProceso(c));
  if (!processing.length) return;

  await Promise.all(
    processing.map(async (c) => {
      try {
        const p = await api.getCasoProgreso(c.id);
        if (!isMounted) return;

        progresoMap.value = { ...progresoMap.value, [c.id]: p.progresoPct };
        if (p.etapaActual) {
          progresoEtapaMap.value = { ...progresoEtapaMap.value, [c.id]: p.etapaActual };
        }

        const termino =
          p.progresoPct >= 100 ||
          p.estado !== c.estado ||
          !isProcessing(p.estado);

        if (termino) {
          await actualizarCasoEnLista(c.id);
        }
      } catch {
        /* ignore */
      }
    })
  );

  void refreshPipelineCasos(processing.map((c) => c.id));
}

async function load(): Promise<void> {
  loading.value = true;
  listError.value = "";
  try {
    const res = await api.listCasos({
      estado: filtroEstado.value !== "" ? filtroEstado.value : undefined,
      semaforo: filtroSemaforo.value || undefined,
      colaRevision: soloColaRevision.value || undefined,
      pendientesAnalista: soloPendientesAnalista.value || undefined,
    });
    items.value = res.items;
    total.value = res.total;
    void refreshPipelineCasos(res.items.map((c) => c.id));
    await refreshProgresoLista();
    void escanearCasosTrabados();
  } catch (e) {
    listError.value = apiErrorMessage(e, "No se pudieron cargar las fichas");
  } finally {
    loading.value = false;
  }
}

function stopDetalleProgreso(): void {
  if (detalleProgresoTimer) {
    clearInterval(detalleProgresoTimer);
    detalleProgresoTimer = null;
  }
  detalleProgreso.value = null;
}

async function pollDetalleProgreso(casoId: string): Promise<void> {
  try {
    const p = await api.getCasoProgreso(casoId);
    detalleProgreso.value = p;
    if (!isProcessing(p.estado)) stopDetalleProgreso();
  } catch {
    stopDetalleProgreso();
  }
}

function onBuscar(): void {
  if (buscarTimer) clearTimeout(buscarTimer);
  const q = busquedaGlobal.value.trim();
  if (q.length < 2) {
    resultadosBusqueda.value = null;
    return;
  }
  buscarTimer = setTimeout(async () => {
    try {
      resultadosBusqueda.value = await api.buscarGlobal(q);
    } catch {
      resultadosBusqueda.value = null;
    }
  }, 300);
}

async function irACaso(id: string): Promise<void> {
  busquedaGlobal.value = "";
  resultadosBusqueda.value = null;
  await verDetalle(id);
}

async function filtrarPorContribuyente(contribuyenteId: string): Promise<void> {
  busquedaGlobal.value = "";
  resultadosBusqueda.value = null;
  loading.value = true;
  listError.value = "";
  try {
    const res = await api.listCasos({ contribuyenteId });
    items.value = res.items;
    total.value = res.total;
  } catch (e) {
    listError.value = apiErrorMessage(e, "No se pudieron filtrar las fichas");
  } finally {
    loading.value = false;
  }
}

async function verDetalle(id: string): Promise<void> {
  stopDetalleProgreso();
  showDetalleModal.value = true;
  detalleLoading.value = true;
  detalleLineasLoading.value = true;
  detalleError.value = null;
  lineas.value = [];
  detalle.value = null;
  pipelineEtapas.value = [];
  try {
    const [caso, etapas, casoLineas] = await Promise.all([
      api.getCaso(id),
      api.getPipelineEtapas(id).catch(() => []),
      api.getCasoLineas(id),
    ]);
    detalle.value = caso;
    pipelineEtapas.value = etapas;
    lineas.value = casoLineas;
    if (isProcessing(caso.estado)) {
      await pollDetalleProgreso(id);
      detalleProgresoTimer = setInterval(() => pollDetalleProgreso(id), 2000);
    }
  } catch (e) {
    detalleError.value = apiErrorMessage(e, "No se pudo abrir el detalle de la ficha");
  } finally {
    detalleLoading.value = false;
    detalleLineasLoading.value = false;
  }
}

function isUploadDuplicado(c: CasoDto): boolean {
  return c.estado === CasoEstado.ERROR && (c.documentosCount ?? 0) === 0;
}

async function onUpload(): Promise<void> {
  uploadError.value = null;
  uploadSuccess.value = null;
  const ref = referenciaCarga.value.trim();
  if (ref.length < 2) {
    uploadError.value = "Indicá un nombre de referencia (mínimo 2 caracteres)";
    return;
  }
  if (!selectedFiles.value.length) {
    uploadError.value = "Seleccioná al menos un archivo";
    return;
  }
  uploading.value = true;
  try {
    const res = await api.uploadCasos(
      selectedFiles.value,
      ref,
      remitenteEmail.value || undefined
    );
    const duplicados = res.casos.filter(isUploadDuplicado);
    const creados = res.casos.filter((c) => !isUploadDuplicado(c));

    if (duplicados.length && !creados.length) {
      uploadError.value =
        "Este documento ya fue cargado antes. Subí un archivo distinto o abrí el caso original desde la lista.";
    } else {
      if (creados.length) {
        uploadSuccess.value = `${creados.length} caso(s) creado(s): ${creados.map((c) => c.numero).join(", ")}`;
      }
      if (duplicados.length) {
        uploadError.value = `${duplicados.length} archivo(s) omitido(s): ya existen en el sistema (${duplicados.map((c) => c.numero).join(", ")}).`;
      }
      selectedFiles.value = [];
      referenciaCarga.value = "";
      remitenteEmail.value = "";
      if (creados.length) {
        window.setTimeout(() => {
          showUpload.value = false;
          uploadSuccess.value = null;
        }, 1500);
      }
    }
    await load();
    for (const c of res.casos.filter((x) => !isUploadDuplicado(x))) {
      marcarProcesando(c.id, progresoMap.value[c.id] ?? 5);
    }
    void refreshProgresoLista();
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : "Error al subir";
  } finally {
    uploading.value = false;
  }
}

onMounted(() => {
  isMounted = true;
  load();
  progresoTimer = setInterval(refreshProgresoLista, 2000);
});

onUnmounted(() => {
  isMounted = false;
  if (progresoTimer) clearInterval(progresoTimer);
  stopDetalleProgreso();
  stopProcesamientoPoll();
});
</script>

<style scoped>
.modal-form {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.textarea {
  resize: vertical;
  min-height: 4.5rem;
  font-family: inherit;
}

.modal-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
}

.form {
  margin-bottom: 1rem;
}

.hint {
  color: var(--ink-soft);
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}

.filters {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filters .input {
  max-width: 220px;
}

.search-global {
  min-width: 240px;
}

.search-results {
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  max-width: 480px;
}

.search-results ul {
  margin: 0.25rem 0 0.5rem;
  padding-left: 1.25rem;
}

.link-btn {
  background: none;
  border: none;
  color: var(--brand);
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.badge.pausado {
  margin-left: 0.35rem;
  font-size: 0.7rem;
}

.badge.prio {
  margin-left: 0.25rem;
  font-size: 0.7rem;
}

.pipeline-etapas {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
  font-size: 0.875rem;
}

.pipeline-etapas .ok {
  color: var(--ok);
}

.pipeline-etapas .pend {
  color: var(--ink-soft);
}

.casos-table-wrap {
  overflow-x: auto;
}

.casos-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  line-height: 1.25;
}

.casos-table th,
.casos-table td {
  text-align: left;
  padding: 0.3rem 0.35rem;
  white-space: nowrap;
  vertical-align: middle;
}

.casos-table th {
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--ink-faint);
}

.casos-table .td-referencia {
  max-width: 10rem;
}

.td-numero__line {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.th-fecha,
.td-fecha {
  font-size: 0.5625rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
  padding-left: 0.2rem !important;
  padding-right: 0.2rem !important;
  line-height: 1.2;
}

.empty,
.total {
  color: var(--ink-soft);
  font-size: 0.875rem;
}

.success-msg {
  color: var(--ok);
}

.casos-table .btn-sm {
  padding: 0.15rem 0.35rem;
  font-size: 0.6875rem;
  line-height: 1.2;
}

.td-confianza {
  text-align: center;
  vertical-align: middle;
}

.td-confianza__btn {
  display: inline-flex;
  padding: 0.2rem 0.35rem;
  margin: -0.2rem -0.35rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
}

.td-confianza__btn:hover,
.td-confianza__btn:focus-visible {
  background: color-mix(in srgb, var(--brand, #2563eb) 10%, transparent);
  outline: none;
}

.td-confianza__stack {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.12rem;
  pointer-events: none;
}

.td-confianza__pct {
  font-size: 0.5625rem;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--ink-soft);
  line-height: 1;
}

.td-f1-lights {
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
}

.td-referencia {
  overflow: hidden;
  text-overflow: ellipsis;
}

.actions-cell {
  display: flex;
  gap: 0.1rem;
  flex-wrap: nowrap;
  align-items: flex-start;
  max-width: none;
  white-space: nowrap;
}

.btn-action-stack {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.12rem;
  padding: 0.28rem 0.3rem 0.22rem;
  min-width: 2.6rem;
  max-width: 3.4rem;
  text-decoration: none;
  line-height: 1;
  border-radius: 8px;
}

.actions-cell .btn-action-stack {
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 0.12rem;
  padding: 0.26rem 0.2rem 0.22rem;
  min-width: 2.35rem;
  max-width: 2.85rem;
  border-radius: 7px;
}

.btn-action-stack i {
  font-size: 0.8rem;
  line-height: 1;
}

.actions-cell .btn-action-stack i {
  font-size: 0.75rem;
  line-height: 1;
}

.btn-action-stack span {
  font-size: 0.5625rem;
  font-weight: 500;
  line-height: 1.05;
  text-align: center;
  letter-spacing: 0.01em;
  word-break: break-word;
  hyphens: auto;
  color: inherit;
  opacity: 0.92;
}

.actions-cell .btn-action-stack span {
  font-size: 0.5rem;
  line-height: 1.05;
  text-align: center;
  white-space: nowrap;
  word-break: normal;
  hyphens: none;
  max-width: 2.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-action-stack.btn-primary span {
  opacity: 1;
}

.btn-action-stack--header {
  min-width: 3rem;
  max-width: 4.5rem;
  padding: 0.35rem 0.45rem 0.28rem;
}

.btn-action-stack--header i {
  font-size: 0.95rem;
}

.btn-action-stack--header span {
  font-size: 0.625rem;
}

.btn-reinicio-grid {
  border-color: color-mix(in srgb, var(--warn) 45%, var(--line));
  color: var(--warn);
}

.btn-reinicio-grid:hover:not(:disabled) {
  background: var(--warn-bg);
  border-color: var(--warn);
}

.reinicio-modal__lead {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--ink-soft);
}

.reinicio-modal__list {
  margin: 0 0 1rem 1.1rem;
  padding: 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.5;
}

.btn-reinicio-confirm {
  background: var(--warn);
  border-color: var(--warn);
}

.btn-reinicio-confirm:hover:not(:disabled) {
  filter: brightness(0.95);
}

.th-compact {
  font-size: 0.5625rem !important;
}

.th-canal,
.td-canal {
  min-width: 2.75rem;
  max-width: 3.25rem;
  font-size: 0.5625rem;
  padding-left: 0.2rem !important;
  padding-right: 0.2rem !important;
  color: var(--ink-soft);
  line-height: 1.2;
}

.td-canal {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.th-filas {
  min-width: 4.5rem;
  white-space: normal;
  line-height: 1.15;
  text-align: center;
}

.th-filas,
.td-filas {
  font-size: 0.625rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
  padding-left: 0.2rem !important;
  padding-right: 0.2rem !important;
}

.td-filas {
  text-align: center;
  font-weight: 600;
  color: var(--ink);
}

.th-estado,
.td-estado {
  min-width: 6.5rem;
  max-width: 8rem;
  padding-left: 0.35rem !important;
  padding-right: 0.35rem !important;
}

.th-estado {
  font-size: 0.65rem !important;
}

.td-progreso {
  min-width: 5rem;
  max-width: 5.5rem;
  font-size: 0.5625rem;
  padding-left: 0.2rem !important;
  padding-right: 0.2rem !important;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.progress-cell--clickable {
  width: 100%;
  margin: 0;
  padding: 0.15rem 0.2rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
}

.progress-cell--clickable:hover {
  background: color-mix(in srgb, var(--brand) 10%, transparent);
}

.progress-cell--active .progress-label {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.5625rem;
  font-weight: 600;
  color: var(--brand);
  white-space: nowrap;
}

.progress-cell--active .progress-label i {
  font-size: 0.5rem;
}

.progress-cell__bar {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  min-width: 48px;
}

.progress-pct {
  font-size: 0.5rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
  min-width: 1.5rem;
}

.progress-bar {
  flex: 1;
  height: 3px;
  background: var(--line);
  border-radius: 999px;
  overflow: hidden;
  min-width: 28px;
}

.progress-fill {
  height: 100%;
  background: var(--brand);
  transition: width 0.3s ease;
}


.progress-cell--done {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  color: var(--ok);
  font-weight: 500;
  font-size: 0.5625rem;
}

.progress-done-icon {
  font-size: 0.625rem;
}

.row-processing {
  background: color-mix(in srgb, var(--brand) 4%, transparent);
}

.casos-table .badge {
  font-size: 0.625rem;
  padding: 0.1rem 0.35rem;
}

.casos-table .badge.badge--estado {
  font-size: 0.625rem;
  padding: 0.12rem 0.4rem;
  max-width: 7.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  display: inline-block;
}

.badge.processing {
  display: inline-flex;
  align-items: center;
  background: color-mix(in srgb, var(--brand) 12%, var(--panel));
  color: var(--brand);
}

.badge--icon {
  padding: 0.1rem 0.25rem;
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.btn-refresh__label {
  font-size: 0.875rem;
}

.btn-refresh--icon {
  padding: 0.45rem 0.55rem;
}

.btn-refresh--icon .fa-arrows-rotate {
  font-size: 1rem;
}

.btn-error-outline {
  color: var(--bad);
  border: 1px solid color-mix(in srgb, var(--bad) 45%, var(--line));
  background: color-mix(in srgb, var(--bad) 6%, var(--panel));
}

.btn-error-outline:hover {
  background: color-mix(in srgb, var(--bad) 12%, var(--panel));
  border-color: var(--bad);
}

.error-modal-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ink-soft);
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

.error-modal-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.error-modal-fecha {
  margin: 0;
  font-size: 0.8rem;
  color: var(--ink-faint);
}

.error-modal-msg {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bad) 8%, var(--panel));
  border: 1px solid color-mix(in srgb, var(--bad) 28%, var(--line));
}

.error-modal-msg--duplicado {
  background: color-mix(in srgb, var(--warn) 10%, var(--panel));
  border-color: color-mix(in srgb, var(--warn) 35%, var(--line));
}

.error-modal-msg--duplicado i {
  color: var(--warn);
}

.error-modal-msg i {
  color: var(--bad);
  margin-top: 0.15rem;
  flex-shrink: 0;
}

.error-modal-msg p {
  margin: 0;
  line-height: 1.45;
  color: var(--ink);
}

.error-modal-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.4;
}

.error-modal-msg--extraccion {
  background: color-mix(in srgb, var(--warn) 10%, var(--panel));
  border-color: color-mix(in srgb, var(--warn) 32%, var(--line));
}

.error-modal-msg--extraccion i {
  color: var(--warn);
}

.error-modal-codigo {
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}

.error-modal-msg__text {
  margin: 0;
  line-height: 1.45;
}

.error-modal-archivo {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  align-items: baseline;
  font-size: 0.85rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  background: var(--bg-soft, #f8fafc);
  border: 1px solid var(--line);
}

.error-modal-archivo strong {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}

.error-modal-section {
  margin-top: 0.25rem;
}

.error-modal-section__title {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}

.error-modal-detalles {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.error-modal-sugerencias {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.85rem;
  color: var(--ink);
  line-height: 1.45;
}

.btn-trabados {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 35%, var(--line));
}

.trabados-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
  background: color-mix(in srgb, var(--warn) 8%, var(--panel));
  border-color: color-mix(in srgb, var(--warn) 28%, var(--line));
}

.trabados-banner--running {
  background: color-mix(in srgb, var(--brand) 6%, var(--panel));
  border-color: color-mix(in srgb, var(--brand) 22%, var(--line));
}

.trabados-banner__text {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.875rem;
  color: var(--ink);
}

.trabados-banner__text i {
  color: var(--warn);
}

.trabados-banner--running .trabados-banner__text i {
  color: var(--brand);
}

.trabados-banner__progress {
  flex: 1;
  min-width: 120px;
  max-width: 220px;
  height: 4px;
  background: var(--line);
  border-radius: 999px;
  overflow: hidden;
}

.trabados-banner__fill {
  height: 100%;
  background: var(--brand);
  transition: width 0.25s ease;
}

.bulk-reinicio-list {
  margin: 0.35rem 0 0;
  padding: 0;
  list-style: none;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.bulk-reinicio-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  font-size: 0.85rem;
  border-bottom: 1px solid var(--line);
}

.bulk-reinicio-list li:last-child {
  border-bottom: none;
}

.bulk-reinicio-list__num {
  font-weight: 600;
  min-width: 7rem;
}

.bulk-reinicio-list__ref {
  flex: 1;
  color: var(--ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
