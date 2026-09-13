<template>
  <div class="admin-chat">
    <button
      v-show="collapsed"
      type="button"
      class="admin-chat__rail-btn"
      title="Ampliar chat — Asistente SOOFT FINYX"
      aria-label="Ampliar asistente"
      @click="expand"
    >
      <i class="admin-chat__rail-ico fas fa-comment-dots" aria-hidden="true"></i>
      <span class="admin-chat__rail-label writing-mode-vertical">ASISTENTE — ¿Necesitás ayuda?</span>
    </button>

    <div v-show="!collapsed" class="admin-chat__body">
      <header class="admin-chat__head">
        <div class="admin-chat__head-main">
          <div class="admin-chat__avatar">
            <img :src="assistantIcon" alt="" class="admin-chat__avatar-img" />
          </div>
          <div>
            <h3 class="admin-chat__title">Asistente SOOFT FINYX</h3>
            <p class="admin-chat__subtitle">Guía rápida del sistema</p>
          </div>
        </div>
        <div class="admin-chat__head-actions">
          <button type="button" class="admin-chat__icon-btn" title="Reiniciar" @click="resetChat">
            <i class="fas fa-redo" aria-hidden="true"></i>
          </button>
          <button type="button" class="admin-chat__icon-btn" title="Maximizar chat" aria-label="Maximizar chat" @click="maximizeChat">
            <i class="fas fa-expand-arrows-alt" aria-hidden="true"></i>
          </button>
          <button type="button" class="admin-chat__icon-btn" title="Reducir chat" aria-label="Reducir chat" @click="collapse">
            <i class="fas fa-compress" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      <div ref="threadEl" class="admin-chat__thread">
        <div
          v-for="(m, i) in messages"
          :key="i"
          class="admin-chat__row"
          :class="m.role === 'user' ? 'admin-chat__row--user' : 'admin-chat__row--bot'"
        >
          <div
            v-if="m.role === 'assistant'"
            class="admin-chat__avatar admin-chat__avatar--sm"
          >
            <img :src="assistantIcon" alt="" class="admin-chat__avatar-img" />
          </div>
          <div
            class="admin-chat__bubble"
            :class="m.role === 'user' ? 'admin-chat__bubble--user' : 'admin-chat__bubble--bot'"
          >
            <p>{{ m.text }}</p>
            <div v-if="m.links?.length" class="admin-chat__links">
              <button
                v-for="(l, li) in m.links"
                :key="li"
                type="button"
                class="admin-chat__chip"
                @click="go(l.href, l.assist)"
              >
                {{ l.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <form class="admin-chat__composer" @submit.prevent="send">
        <input
          ref="messageInput"
          v-model="draft"
          type="text"
          class="admin-chat__input"
          placeholder="Escribí un mensaje…"
          autocomplete="off"
        />
        <button type="submit" class="admin-chat__send" :disabled="!draft.trim()" aria-label="Enviar">
          <i class="fas fa-paper-plane" aria-hidden="true"></i>
        </button>
      </form>

      <div class="admin-chat-helps">
        <button
          type="button"
          class="admin-chat-helps__toggle"
          :aria-expanded="quickHelpExpanded"
          @click="quickHelpExpanded = !quickHelpExpanded"
        >
          <span><i class="fas fa-comments" aria-hidden="true"></i> Ayudas rápidas</span>
          <i :class="quickHelpExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" aria-hidden="true"></i>
        </button>
        <div v-show="quickHelpExpanded" class="admin-chat-helps__list">
          <button
            v-for="q in QUICK_HELPS"
            :key="q"
            type="button"
            class="admin-chat-helps__item"
            @click="sendQuickQuestion(q)"
          >
            {{ q }}
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="isMaximized" class="admin-chat-max" role="dialog" aria-modal="true">
        <div class="admin-chat-max__backdrop" @click="closeMaximized"></div>
        <div ref="maximizedPanelRef" class="admin-chat-max__panel">
          <header class="admin-chat__head">
            <div class="admin-chat__head-main">
              <div class="admin-chat__avatar"><img :src="assistantIcon" alt="" class="admin-chat__avatar-img" /></div>
              <div>
                <h3 class="admin-chat__title">Asistente SOOFT FINYX</h3>
                <p class="admin-chat__subtitle">vista ampliada</p>
              </div>
            </div>
            <div class="admin-chat__head-actions">
              <button type="button" class="admin-chat__btn-outline" @click="resetChat">Reiniciar</button>
              <button type="button" class="admin-chat__btn-outline" @click="closeMaximized">Cerrar</button>
            </div>
          </header>
          <div ref="threadMaxEl" class="admin-chat__thread admin-chat__thread--max">
            <div
              v-for="(m, i) in messages"
              :key="'max-' + i"
              class="admin-chat__row"
              :class="m.role === 'user' ? 'admin-chat__row--user' : 'admin-chat__row--bot'"
            >
              <div
                class="admin-chat__bubble"
                :class="m.role === 'user' ? 'admin-chat__bubble--user' : 'admin-chat__bubble--bot'"
              >
                <p>{{ m.text }}</p>
                <div v-if="m.links?.length" class="admin-chat__links">
                  <button
                    v-for="(l, li) in m.links"
                    :key="li"
                    type="button"
                    class="admin-chat__chip"
                    @click="go(l.href, l.assist)"
                  >
                    {{ l.label }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <form class="admin-chat__composer" @submit.prevent="sendMax">
            <input v-model="draftMax" type="text" class="admin-chat__input" placeholder="Escribí un mensaje…" />
            <button type="submit" class="admin-chat__send" :disabled="!draftMax.trim()">
              <i class="fas fa-paper-plane" aria-hidden="true"></i>
            </button>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { PRODUCT_ICON } from "../constants/brand";
import { getCreateAssistFlow, type CreateAssistFlowId } from "../constants/createAssist";
import { startCreateAssist } from "../utils/createAssistEvents";

const props = defineProps<{ collapsed?: boolean }>();
const emit = defineEmits<{ "update:collapsed": [value: boolean] }>();

interface ChatLink {
  label: string;
  href: string;
  assist?: CreateAssistFlowId;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  links?: ChatLink[];
}

const router = useRouter();
const assistantIcon = PRODUCT_ICON;
const draft = ref("");
const draftMax = ref("");
const messages = ref<ChatMessage[]>([]);
const quickHelpExpanded = ref(false);
const isMaximized = ref(false);
const threadEl = ref<HTMLElement | null>(null);
const threadMaxEl = ref<HTMLElement | null>(null);
const messageInput = ref<HTMLInputElement | null>(null);
const maximizedPanelRef = ref<HTMLElement | null>(null);

const QUICK_HELPS = [
  "¿Cómo subo una nueva ficha?",
  "¿Cómo doy de alta un contribuyente?",
  "¿Cómo creo una versión del plan?",
  "¿Cómo agrego un usuario nuevo?",
  "¿Dónde veo las fichas pendientes?",
  "¿Dónde está el repositorio de informes?",
  "¿Cómo comparo ejercicios?",
  "¿Dónde veo los KPIs operativos?",
];

const ANSWERS: Array<{ match: RegExp; text: string; links: ChatLink[] }> = [
  {
    match: /subir|cargar|pdf|upload|nueva ficha|ficha nueva/i,
    text: getCreateAssistFlow("cargar-ficha").chatIntro,
    links: [{ label: "Cargar con asistente", href: "/casos", assist: "cargar-ficha" }],
  },
  {
    match: /contribuyente|empresa|rut|directorio|razón social|razon social/i,
    text: getCreateAssistFlow("nuevo-contribuyente").chatIntro,
    links: [{ label: "Nuevo contribuyente", href: "/contribuyentes", assist: "nuevo-contribuyente" }],
  },
  {
    match: /plan contable|nueva versi|semver|rubro|csv plan/i,
    text: getCreateAssistFlow("nueva-version-plan").chatIntro,
    links: [{ label: "Nueva versión del plan", href: "/admin/plan-cuentas", assist: "nueva-version-plan" }],
  },
  {
    match: /usuario|analista|administrador|rol|cuenta interna|nuevo user/i,
    text: getCreateAssistFlow("nuevo-usuario").chatIntro,
    links: [{ label: "Nuevo usuario", href: "/admin/usuarios", assist: "nuevo-usuario" }],
  },
  {
    match: /caso|bandeja|pendiente|revis/i,
    text: "Las fichas en curso se gestionan en la bandeja principal. Desde ahí podés cargar PDFs, filtrar por estado y abrir la revisión.",
    links: [{ label: "Bandeja de fichas", href: "/casos" }],
  },
  {
    match: /repositorio|informe|aprobado/i,
    text: "El repositorio concentra fichas e informes aprobados por contribuyente y ejercicio.",
    links: [{ label: "Repositorio", href: "/repositorio" }],
  },
  {
    match: /compar|históric|historico|ejercicio/i,
    text: "La comparación histórica permite contrastar balances entre períodos del mismo contribuyente.",
    links: [{ label: "Comparación", href: "/comparacion" }],
  },
  {
    match: /consolid/i,
    text: "La consolidación multi-empresa agrupa balances de un mismo grupo económico.",
    links: [{ label: "Consolidación", href: "/consolidacion" }],
  },
  {
    match: /kpi|dashboard|indicador|métrica|metrica/i,
    text: "El dashboard operativo muestra KPIs, tiempos de proceso y calidad.",
    links: [{ label: "Dashboard", href: "/" }],
  },
  {
    match: /usuario|rol|acceso/i,
    text: "La gestión de usuarios internos está en Administración → Usuarios.",
    links: [
      { label: "Usuarios", href: "/admin/usuarios" },
      { label: "Administración", href: "/admin" },
    ],
  },
  {
    match: /admin|config|umbral|confianza/i,
    text: "La configuración global (umbral, proveedor de extracción) está en Administración.",
    links: [{ label: "Administración", href: "/admin" }],
  },
  {
    match: /mapa|menú|menu|naveg/i,
    text: "Usá el botón «Mapa del sitio» en el header para ver todas las funciones y fijar accesos en la barra lateral o superior.",
    links: [],
  },
];

const welcome: ChatMessage = {
  role: "assistant",
  text: "Hola — soy el asistente de SOOFT FINYX. Te indico dónde está cada función del sistema.",
  links: [
    { label: "Dashboard", href: "/" },
    { label: "Bandeja de fichas", href: "/casos" },
    { label: "Mapa del sitio", href: "#mapa" },
  ],
};

function expand(): void {
  emit("update:collapsed", false);
  nextTick(() => {
    scrollBottom();
    messageInput.value?.focus();
  });
}

function collapse(): void {
  isMaximized.value = false;
  emit("update:collapsed", true);
}

function maximizeChat(): void {
  isMaximized.value = true;
  nextTick(scrollBottomMax);
}

function closeMaximized(): void {
  isMaximized.value = false;
}

function scrollBottom(): void {
  if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight;
}

function scrollBottomMax(): void {
  if (threadMaxEl.value) threadMaxEl.value.scrollTop = threadMaxEl.value.scrollHeight;
}

function go(href: string, assist?: CreateAssistFlowId): void {
  if (href === "#mapa") {
    window.dispatchEvent(new CustomEvent("ffa-open-site-map"));
    return;
  }
  if (isMaximized.value) closeMaximized();
  router
    .push(href)
    .then(() => {
      if (assist) window.setTimeout(() => startCreateAssist(assist), 150);
    })
    .catch(() => {});
}

function answer(text: string): ChatMessage {
  const normalized = text.toLowerCase();
  for (const entry of ANSWERS) {
    if (entry.match.test(normalized)) {
      return { role: "assistant", text: entry.text, links: entry.links };
    }
  }
  return {
    role: "assistant",
    text: "No encontré una respuesta exacta. Probá con «bandeja de fichas», «repositorio», «plan de cuentas» o abrí el mapa del sitio desde el header.",
    links: [
      { label: "Bandeja de fichas", href: "/casos" },
      { label: "Administración", href: "/admin" },
    ],
  };
}

function pushExchange(question: string): void {
  messages.value.push({ role: "user", text: question });
  messages.value.push(answer(question));
  nextTick(() => {
    scrollBottom();
    scrollBottomMax();
  });
}

function send(): void {
  const t = draft.value.trim();
  if (!t) return;
  draft.value = "";
  pushExchange(t);
}

function sendMax(): void {
  const t = draftMax.value.trim();
  if (!t) return;
  draftMax.value = "";
  pushExchange(t);
}

function sendQuickQuestion(q: string): void {
  draft.value = q;
  send();
}

function resetChat(): void {
  draft.value = "";
  draftMax.value = "";
  messages.value = [welcome];
  nextTick(() => {
    scrollBottom();
    scrollBottomMax();
  });
}

watch(
  () => props.collapsed,
  (c) => {
    if (!c) nextTick(scrollBottom);
  },
);

onMounted(() => {
  messages.value = [welcome];
});

onUnmounted(() => {
  isMaximized.value = false;
});

defineExpose({
  isMaximized,
  expand,
  collapse,
  guideCreate(flowId: CreateAssistFlowId): void {
    expand();
    const flow = getCreateAssistFlow(flowId);
    messages.value.push({
      role: "assistant",
      text: flow.chatIntro,
      links: [{ label: flow.title, href: flow.route, assist: flowId }],
    });
    if (router.currentRoute.value.path === flow.route) {
      startCreateAssist(flowId);
    }
    nextTick(() => {
      scrollBottom();
      scrollBottomMax();
    });
  },
});
</script>

<style scoped>
.admin-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--panel-2);
  color: var(--ink);
}

.admin-chat__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.admin-chat__rail-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0.5rem;
}

.admin-chat__rail-btn:hover {
  background: var(--brand-soft);
}

.admin-chat__rail-ico {
  font-size: 1.25rem;
  line-height: 1;
  color: var(--brand-ink);
  transition: opacity 0.15s;
}

.admin-chat__rail-btn:hover .admin-chat__rail-ico {
  opacity: 0.9;
}

.writing-mode-vertical,
.admin-chat__rail-label {
  writing-mode: vertical-rl;
  text-orientation: sideways;
  letter-spacing: 0.5px;
  transform: rotate(180deg);
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--ink-soft);
}

.admin-chat__rail-btn:hover .admin-chat__rail-label {
  color: var(--brand-ink);
}

.admin-chat__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  flex-shrink: 0;
}

.admin-chat__head-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.admin-chat__head-actions {
  display: flex;
  gap: 0.25rem;
}

.admin-chat__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.375rem;
  background: #fff;
  padding: 2px;
  flex-shrink: 0;
  overflow: hidden;
}

.admin-chat__avatar-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.admin-chat__avatar--sm {
  width: 1.5rem;
  height: 1.5rem;
}

.admin-chat__title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
}

.admin-chat__subtitle {
  margin: 0;
  font-size: 0.65rem;
  color: var(--ink-soft);
}

.admin-chat__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--ink-soft);
  padding: 0.375rem;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.admin-chat__icon-btn i {
  font-size: 0.875rem;
  color: inherit;
}

.admin-chat__icon-btn:hover {
  background: var(--panel-2);
  color: var(--ink);
}

.admin-chat__thread {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  background: var(--panel);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.admin-chat__thread--max {
  min-height: 0;
}

.admin-chat__row {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
}

.admin-chat__row--user {
  justify-content: flex-end;
}

.admin-chat__bubble {
  max-width: 80%;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.6875rem;
  line-height: 1.45;
}

.admin-chat__bubble p {
  margin: 0;
}

.admin-chat__bubble--user {
  background: var(--brand);
  color: #fff;
}

.admin-chat__bubble--bot {
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--ink);
}

.admin-chat__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.admin-chat__chip {
  border: 1px solid var(--brand-line);
  background: var(--brand-soft);
  color: var(--brand-ink);
  border-radius: 0.4rem;
  padding: 0.2rem 0.45rem;
  font-size: 0.68rem;
  cursor: pointer;
}

.admin-chat__composer {
  display: flex;
  gap: 0.4rem;
  padding: 0.65rem;
  border-top: 1px solid var(--line);
  background: var(--panel);
  flex-shrink: 0;
}

.admin-chat__input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  padding: 0.45rem 0.6rem;
  background: var(--panel-2);
  color: var(--ink);
  font-size: 0.75rem;
}

.admin-chat__send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0.5rem;
  padding: 0.45rem 0.75rem;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
}

.admin-chat__send i {
  color: #fff;
}

.admin-chat-helps {
  border-top: 1px solid var(--line);
  background: var(--panel);
  padding: 0.5rem;
  flex-shrink: 0;
}

.admin-chat-helps__toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-radius: 0.45rem;
  padding: 0.45rem 0.6rem;
  background: var(--brand);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.admin-chat-helps__toggle i {
  color: #fff;
}

.admin-chat-helps__list {
  margin-top: 0.4rem;
  max-height: min(10rem, calc(100vh - 320px));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.admin-chat-helps__item {
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--ink);
  border-radius: 0.45rem;
  padding: 0.4rem 0.5rem;
  font-size: 0.72rem;
  text-align: left;
  cursor: pointer;
}

.admin-chat-helps__item:hover {
  background: var(--panel-2);
}

.admin-chat__btn-outline {
  border: 1px solid var(--line-2);
  background: var(--panel-2);
  color: var(--ink);
  border-radius: 0.45rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.admin-chat__btn-outline i {
  color: var(--brand-ink);
}

.admin-chat-max {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 5rem 1rem 1.5rem;
}

.admin-chat-max__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.55);
}

.admin-chat-max__panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(100%, 56rem);
  height: min(80vh, 40rem);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  background: var(--panel);
  box-shadow: var(--sh-lg);
  overflow: hidden;
}
</style>
