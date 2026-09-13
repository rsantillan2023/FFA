<template>
  <div>
    <PageHeader
      page-key="operacion-sys"
      :back-link="{ to: '/admin', label: '← Centro de configuración' }"
    />

    <p v-if="msg" class="banner-msg">{{ msg }}</p>
    <p v-if="err" class="banner-msg banner-msg--err">{{ err }}</p>

    <section class="card">
      <header class="section-head">
        <div>
          <h2>Estado del procesamiento automático</h2>
          <p class="lead">
            Cada fila es una etapa del camino de una ficha desde que se carga hasta que llega a revisión humana.
            Usá el botón <i class="fas fa-info-circle inline-ico" aria-hidden="true"></i> en cada fila para entender qué
            significa y qué hacer.
          </p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" @click="loadColas">Actualizar</button>
      </header>

      <div v-if="colasVisibles.length" class="estado-resumen" :class="`estado-resumen--${resumenColas.nivel}`">
        <strong>{{ resumenColas.titulo }}</strong>
        <p>{{ resumenColas.detalle }}</p>
      </div>

      <p v-if="modoInline" class="hint-box">
        <strong>Modo directo (desarrollo):</strong> las fichas se procesan en el mismo servidor, sin colas Redis. Ver
        todo en cero es normal aunque el sistema esté funcionando.
      </p>

      <table v-if="colasVisibles.length" class="colas-table">
        <thead>
          <tr>
            <th>Etapa del procesamiento</th>
            <th>
              En espera
              <span class="th-hint">Fichas en fila</span>
            </th>
            <th>
              Procesando
              <span class="th-hint">Ahora mismo</span>
            </th>
            <th>
              Con error
              <span class="th-hint">Requieren acción</span>
            </th>
            <th class="th-ayuda">Ayuda</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in colasVisibles" :key="c.name">
            <td>
              <strong>{{ colaDisplay(c.name).titulo }}</strong>
              <span class="cola-desc">{{ colaDisplay(c.name).descripcion }}</span>
              <button
                v-if="!showTecnico"
                type="button"
                class="link-tecnico"
                @click="showTecnico = true"
              >
                Ver nombre técnico
              </button>
              <code v-else class="cola-tecnico">{{ colaDisplay(c.name).tecnico }}</code>
            </td>
            <td :class="c.waiting > 0 ? 'warn' : ''">
              <span class="num">{{ c.waiting }}</span>
            </td>
            <td :class="c.active > 0 ? 'ok' : ''">
              <span class="num">{{ c.active }}</span>
            </td>
            <td :class="c.failed > 0 ? 'err' : ''">
              <span class="num">{{ c.failed }}</span>
            </td>
            <td class="td-ayuda">
              <button
                type="button"
                class="page-info-btn page-info-btn--row"
                :aria-label="`Información sobre ${colaDisplay(c.name).titulo}`"
                title="¿Qué es esta etapa?"
                @click="openColaHelp(c.name)"
              >
                <i class="fas fa-info-circle" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">No hay etapas de procesamiento configuradas.</p>

      <div class="footnote">
        <span>
          No listamos la cola de ingesta por correo: es solo la entrada de mails, no el procesamiento de la ficha.
        </span>
        <button type="button" class="footnote-info" @click="openMailIngestHelp">
          <i class="fas fa-info-circle" aria-hidden="true"></i>
          ¿Por qué?
        </button>
      </div>
    </section>

    <section class="card">
      <header class="section-head section-head--tight">
        <h2>Acciones sobre fichas</h2>
        <button type="button" class="page-info-btn" aria-label="Ayuda reintentar ficha" @click="openSectionHelp('reprocesar')">
          <i class="fas fa-info-circle" aria-hidden="true"></i>
        </button>
      </header>

      <div class="action-block">
        <h3>Reintentar una ficha atascada</h3>
        <p class="lead">
          Si una ficha quedó en error o no avanzó, podés volver a ponerla en procesamiento. Necesitás el número de ficha
          el número de expediente visible en la bandeja (ej. casos demo) o el ID del expediente desde la bandeja.
        </p>
        <div class="row">
          <input
            v-model="casoId"
            class="input wide"
            placeholder="Número de ficha o ID del expediente"
          />
          <button class="btn btn-primary" type="button" @click="reprocesar">Reintentar procesamiento</button>
        </div>
      </div>

      <div class="action-block">
        <h3>Limpieza de fichas descartadas</h3>
        <p class="lead">
          Anonimiza datos de fichas rechazadas, canceladas o con error que ya cumplieron el plazo de retención.
        </p>
        <button class="btn btn-ghost" type="button" @click="purgaRetencion">Ejecutar limpieza ahora</button>
      </div>
    </section>

    <section class="card">
      <header class="section-head section-head--tight">
        <h2>Documentos ilegibles o de mala calidad</h2>
        <button type="button" class="page-info-btn" aria-label="Ayuda documentos ilegibles" @click="openSectionHelp('ilegibles')">
          <i class="fas fa-info-circle" aria-hidden="true"></i>
        </button>
      </header>
      <p class="lead">Qué hace el sistema cuando el PDF escaneado no se puede leer bien.</p>
      <label class="label">Acción ante ilegibilidad</label>
      <select v-model="politicaIlegibleAccion" class="input wide">
        <option value="pendiente_calidad_remitente">Pedir nuevo documento al remitente</option>
        <option value="escalar_analista">Derivar a un analista para revisión manual</option>
      </select>
      <label class="label">Cantidad máxima de reintentos automáticos</label>
      <input v-model.number="politicaMaxIntentos" class="input" type="number" min="1" max="5" />
      <button class="btn btn-primary" type="button" @click="savePolitica">Guardar política</button>
    </section>

    <section class="card">
      <header class="section-head section-head--tight">
        <h2>Notificaciones por correo</h2>
        <button type="button" class="page-info-btn" aria-label="Ayuda notificaciones" @click="openSectionHelp('notificaciones')">
          <i class="fas fa-info-circle" aria-hidden="true"></i>
        </button>
      </header>
      <p class="lead">Personas que reciben avisos cuando hay fichas pendientes o errores (no confundir con la cola de ingesta).</p>
      <label class="label">Correos de analistas</label>
      <input v-model="emailsAnalistas" class="input wide" placeholder="analista1@empresa.cl, analista2@empresa.cl" />
      <label class="label">Correos de administradores (errores graves)</label>
      <input v-model="emailsAdmin" class="input wide" placeholder="admin@empresa.cl" />
      <button class="btn btn-primary" type="button" @click="saveNotif">Guardar destinatarios</button>

      <div v-if="notificaciones.length" class="sub-block">
        <h3>Últimos avisos enviados</h3>
        <ul class="log-list">
          <li v-for="n in notificaciones" :key="n.id">
            <span class="log-date">{{ formatDate(n.enviadoAt) }}</span>
            <strong>{{ notifLabel(n.tipo) }}</strong>
            → {{ n.destinatario }}
            <span class="badge" :class="n.estado">{{ n.estado === "enviado" ? "Enviado" : n.estado }}</span>
          </li>
        </ul>
      </div>
    </section>

    <details class="card card--tecnico">
      <summary>Configuración avanzada del motor (OCR y reintentos)</summary>
      <div class="details-body">
        <p class="lead">Solo administradores técnicos. Afecta cómo se leen y clasifican las fichas.</p>
        <label class="label">Proveedor de lectura (OCR / IA)</label>
        <select v-model="provider" class="input wide">
          <option value="mock">Simulado (datos de prueba)</option>
          <option value="openai">OpenAI (principal — PDF e imágenes)</option>
          <option value="anthropic">Anthropic (Claude — solo respaldo)</option>
        </select>
        <p v-if="provider === 'openai'" class="hint-box hint-box--inline">
          {{ EXTRACTION_FALLBACK_NOTE }}
        </p>
        <label class="label">Reintentos automáticos por etapa</label>
        <div class="reintentos-grid">
          <div v-for="(label, key) in ETAPA_REINTENTO_LABELS" :key="key" class="reintentos-grid__row">
            <span>{{ label }}</span>
            <input v-model.number="reintentosByKey[key]" class="input" type="number" min="1" max="10" />
          </div>
        </div>
        <button class="btn btn-primary" type="button" @click="saveConfig">Guardar configuración</button>
      </div>
    </details>

    <details class="card card--tecnico">
      <summary>Prueba de clasificación contable</summary>
      <div class="details-body">
        <p class="lead">Simula cómo el sistema asignaría rubros. Una línea por fila: denominación;monto</p>
        <textarea
          v-model="pruebaLineas"
          class="input wide"
          rows="4"
          placeholder="Caja;1500000&#10;Proveedores;800000"
        />
        <button class="btn btn-primary" type="button" @click="runPruebaClasificacion">Ejecutar prueba</button>
        <ul v-if="pruebaResult.length" class="prueba-list">
          <li v-for="(r, i) in pruebaResult" :key="i">
            {{ r.denominacionOriginal }} → rubro {{ r.rubroCodigo ?? "sin match" }} ({{ r.confianzaClasificacion }}%
            confianza)
          </li>
        </ul>
      </div>
    </details>

    <details class="card card--tecnico">
      <summary>Intentos de acceso fallidos (seguridad)</summary>
      <div class="details-body">
        <ul v-if="fallidos.length" class="log-list">
          <li v-for="f in fallidos" :key="f.id">
            <span class="log-date">{{ formatDate(f.at) }}</span>
            {{ f.email }} — {{ f.motivo }}
          </li>
        </ul>
        <p v-else class="empty">Sin registros recientes</p>
      </div>
    </details>

    <InfoModal
      v-if="helpModal && helpOpen"
      v-model="helpOpen"
      :title="helpModal.title"
      :summary="helpModal.summary"
      :when-to-use="helpModal.whenToUse"
      :bullets="helpModal.bullets"
      :sections="helpModal.sections"
    />
  </div>
</template>

<script setup lang="ts">
import type { AccesoFallidoDto, NotificacionLogDto, QueueStatusDto } from "@ffa/shared";
import { computed, onMounted, reactive, ref } from "vue";
import { useCloseOnRouteLeave } from "../../composables/useCloseOnRouteLeave";
import { api } from "../../api/client";
import { apiErrorMessage } from "../../utils/apiError";
import InfoModal from "../../components/InfoModal.vue";
import PageHeader from "../../components/PageHeader.vue";
import {
  colaDisplay,
  colaHelp,
  COLA_LABELS,
  ETAPA_REINTENTO_LABELS,
  interpretarColas,
  MAIL_INGEST_HELP,
  NOTIF_TIPO_LABELS,
  SECCION_HELP,
  type ColaHelpContent,
} from "../../constants/operacionAdmin";
import { EXTRACTION_FALLBACK_NOTE } from "../../constants/extractionProviders";

const colas = ref<QueueStatusDto[]>([]);
const fallidos = ref<AccesoFallidoDto[]>([]);
const casoId = ref("");
const msg = ref("");
const err = ref("");
const provider = ref("mock");
const showTecnico = ref(false);
const helpOpen = ref(false);
useCloseOnRouteLeave(helpOpen);
const helpModal = ref<ColaHelpContent | null>(null);
const reintentosByKey = reactive<Record<string, number>>({
  preprocess: 3,
  extract: 3,
  normalize: 3,
  classify: 3,
  validate: 3,
});
const politicaIlegibleAccion = ref<"pendiente_calidad_remitente" | "escalar_analista">(
  "pendiente_calidad_remitente"
);
const politicaMaxIntentos = ref(1);
const emailsAnalistas = ref("");
const emailsAdmin = ref("");
const notificaciones = ref<NotificacionLogDto[]>([]);
const pruebaLineas = ref("Caja;1500000\nProveedores;800000\nCapital pagado;5000000");
const pruebaResult = ref<
  Array<{
    denominacionOriginal: string;
    rubroCodigo?: string;
    confianzaClasificacion: number;
    origenClasificacion?: string;
  }>
>([]);

const colasVisibles = computed(() =>
  colas.value
    .filter((c) => c.name !== "ffa-mail-ingest")
    .sort((a, b) => (COLA_LABELS[a.name]?.etapa ?? 99) - (COLA_LABELS[b.name]?.etapa ?? 99))
);

const resumenColas = computed(() => interpretarColas(colasVisibles.value));

const modoInline = computed(
  () =>
    colasVisibles.value.length > 0 &&
    colasVisibles.value.every((c) => c.waiting === 0 && c.active === 0 && c.failed === 0)
);

function openHelp(content: ColaHelpContent): void {
  helpModal.value = content;
  helpOpen.value = true;
}

function openColaHelp(name: string): void {
  const help = colaHelp(name);
  if (help) openHelp(help);
}

function openMailIngestHelp(): void {
  openHelp(MAIL_INGEST_HELP);
}

function openSectionHelp(key: keyof typeof SECCION_HELP): void {
  openHelp(SECCION_HELP[key]);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL");
}

function notifLabel(tipo: string): string {
  return NOTIF_TIPO_LABELS[tipo] ?? tipo;
}

async function loadColas(): Promise<void> {
  err.value = "";
  try {
    colas.value = await api.getAdminColas();
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudieron cargar las colas");
  }
}

async function purgaRetencion(): Promise<void> {
  err.value = "";
  msg.value = "";
  try {
    const r = await api.purgaRetencion();
    msg.value = `Limpieza completada: ${r.purgados} ficha(s) anonimizada(s).`;
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo ejecutar la limpieza");
  }
}

async function reprocesar(): Promise<void> {
  msg.value = "";
  err.value = "";
  if (!casoId.value.trim()) {
    err.value = "Ingresá el número de ficha o el ID del expediente a reintentar.";
    return;
  }
  try {
    await api.reprocesarCaso(casoId.value.trim());
    msg.value = "Ficha encolada para reprocesamiento.";
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo reprocesar la ficha");
  }
}

async function saveConfig(): Promise<void> {
  err.value = "";
  msg.value = "";
  try {
    await api.patchConfig({
      extractionProvider: provider.value as "mock" | "openai" | "anthropic",
      reintentosMaxPorEtapa: {
        preprocess: reintentosByKey.preprocess,
        extract: reintentosByKey.extract,
        normalize: reintentosByKey.normalize,
        classify: reintentosByKey.classify,
        validate: reintentosByKey.validate,
      },
    });
    msg.value = "Configuración del motor guardada.";
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo guardar la configuración");
  }
}

async function runPruebaClasificacion(): Promise<void> {
  err.value = "";
  msg.value = "";
  try {
    const lineas = pruebaLineas.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((row) => {
        const [denominacionOriginal, montoStr] = row.split(";");
        return {
          denominacionOriginal: (denominacionOriginal ?? row).trim(),
          montoOriginal: Number(montoStr) || 0,
        };
      });
    const res = await api.pruebaClasificacion({ lineas });
    pruebaResult.value = res.lineas;
    msg.value = `Prueba OK — confianza global ${res.confianzaGlobal}%.`;
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo ejecutar la prueba");
  }
}

async function savePolitica(): Promise<void> {
  err.value = "";
  msg.value = "";
  try {
    await api.patchConfig({
      politicaIlegible: {
        accion: politicaIlegibleAccion.value,
        maxIntentosCalidad: politicaMaxIntentos.value,
      },
    });
    msg.value = "Política de documentos ilegibles guardada.";
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo guardar la política");
  }
}

async function saveNotif(): Promise<void> {
  err.value = "";
  msg.value = "";
  try {
    await api.patchConfig({
      notificacionAnalistas: emailsAnalistas.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      notificacionAdmin: emailsAdmin.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    msg.value = "Destinatarios de notificación guardados.";
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudieron guardar los destinatarios");
  }
}

onMounted(async () => {
  err.value = "";
  try {
    const cfg = await api.getConfig();
    provider.value = cfg.extractionProvider;
    const r = cfg.reintentosMaxPorEtapa ?? {};
    reintentosByKey.preprocess = r.preprocess ?? 3;
    reintentosByKey.extract = r.extract ?? 3;
    reintentosByKey.normalize = r.normalize ?? 3;
    reintentosByKey.classify = r.classify ?? 3;
    reintentosByKey.validate = r.validate ?? 3;
    politicaIlegibleAccion.value = cfg.politicaIlegible?.accion ?? "pendiente_calidad_remitente";
    politicaMaxIntentos.value = cfg.politicaIlegible?.maxIntentosCalidad ?? 1;
    emailsAnalistas.value = (cfg.notificacionAnalistas ?? []).join(", ");
    emailsAdmin.value = (cfg.notificacionAdmin ?? []).join(", ");
    await loadColas();
    fallidos.value = await api.getAccesosFallidos();
    notificaciones.value = await api.getAdminNotificaciones();
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo cargar la pantalla de operación");
  }
});
</script>

<style scoped>
.card {
  margin-bottom: 1rem;
}

.card--tecnico {
  border-left: 3px solid var(--line);
}

.card--tecnico summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--brand-ink);
  padding: 0.25rem 0;
  list-style-position: inside;
}

.details-body {
  padding-top: 0.75rem;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.section-head--tight {
  align-items: center;
  margin-bottom: 0.35rem;
}

.section-head--tight h2 {
  margin: 0;
  flex: 1;
}

h2 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  color: var(--brand-ink);
}

h3 {
  margin: 0 0 0.35rem;
  font-size: 0.9rem;
  color: var(--brand-ink);
}

.lead {
  margin: 0 0 0.75rem;
  color: var(--ink-soft);
  font-size: 0.85rem;
  max-width: 72ch;
}

.inline-ico {
  color: var(--brand);
  font-size: 0.85em;
}

.estado-resumen {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  font-size: 0.82rem;
}

.estado-resumen strong {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--brand-ink);
}

.estado-resumen p {
  margin: 0;
  color: var(--ink-soft);
}

.estado-resumen--ok {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}

.estado-resumen--atencion {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.estado-resumen--critico {
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.hint-box {
  margin: 0 0 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  background: var(--brand-soft);
  font-size: 0.82rem;
  color: var(--brand-ink);
}

.hint-box--inline {
  margin-top: 0.35rem;
}

.footnote {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.footnote-info {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.45rem;
  border: 1px solid var(--line-2);
  border-radius: 999px;
  background: var(--panel);
  color: var(--brand);
  font-size: 0.72rem;
  cursor: pointer;
}

.colas-table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.55rem 0.4rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

th {
  font-size: 0.75rem;
  color: var(--ink-soft);
}

.th-hint {
  display: block;
  font-weight: 400;
  font-size: 0.65rem;
  color: var(--ink-faint);
}

.th-ayuda,
.td-ayuda {
  width: 3rem;
  text-align: center;
}

.page-info-btn--row {
  width: 1.75rem;
  height: 1.75rem;
  font-size: 0.8rem;
}

.page-info-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--line-2);
  border-radius: 999px;
  background: var(--panel);
  color: var(--brand);
  cursor: pointer;
}

.page-info-btn:hover {
  background: var(--brand-soft);
}

.cola-desc {
  display: block;
  font-size: 0.78rem;
  color: var(--ink-soft);
  margin-top: 0.15rem;
}

.link-tecnico {
  display: block;
  margin-top: 0.25rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--brand);
  font-size: 0.68rem;
  cursor: pointer;
  text-decoration: underline;
}

.cola-tecnico {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.68rem;
  color: var(--ink-faint);
}

.num {
  font-variant-numeric: tabular-nums;
}

td.ok {
  color: var(--ok);
  font-weight: 600;
}

td.warn {
  color: #b45309;
  font-weight: 600;
}

td.err {
  color: var(--danger, #c0392b);
  font-weight: 600;
}

.action-block {
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--line);
}

.action-block:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: 0;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.input {
  max-width: 280px;
  margin: 0.35rem 0;
}

.input.wide {
  max-width: 480px;
  width: 100%;
}

.banner-msg {
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: 0.85rem;
}

.banner-msg--err {
  background: rgb(220 38 38 / 8%);
  color: var(--danger, #dc2626);
}

.sub-block {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
}

.log-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.82rem;
}

.log-list li {
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--line);
}

.log-date {
  color: var(--ink-faint);
  margin-right: 0.35rem;
}

.prueba-list {
  margin: 0.75rem 0 0;
  padding-left: 1.2rem;
  font-size: 0.82rem;
}

.reintentos-grid {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.5rem 0 0.75rem;
  max-width: 420px;
}

.reintentos-grid__row {
  display: grid;
  grid-template-columns: 1fr 100px;
  gap: 0.75rem;
  align-items: center;
}

.empty {
  color: var(--ink-soft);
  font-size: 0.85rem;
}

.badge {
  font-size: 0.68rem;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  margin-left: 0.25rem;
}

.badge.enviado,
.badge.ok {
  background: #dcfce7;
  color: #166534;
}

.badge.fallido,
.badge.error {
  background: #fee2e2;
  color: #991b1b;
}
</style>
