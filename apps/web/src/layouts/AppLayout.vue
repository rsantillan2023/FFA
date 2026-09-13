<template>
  <div class="admin-shell">
    <!-- Chatbot izquierdo -->
    <div
      class="admin-chat-rail"
      :class="[
        isMobile ? 'admin-chat-rail--mobile' : '',
        isChatbotCollapsed ? 'admin-chat-rail--collapsed' : 'admin-chat-rail--expanded',
      ]"
      @mouseenter="!isMobile && onChatEnter()"
      @mouseleave="!isMobile && onChatLeave()"
    >
      <AdminShellChatbot ref="chatbotRef" v-model:collapsed="isChatbotCollapsed" />
    </div>

    <!-- Sidebar derecho (iconos + micro-labels, estilo Connectia) -->
    <div
      class="admin-right-rail"
      :class="{ 'admin-right-rail--open': isMobile || sidebarHovered }"
      @mouseenter="!isMobile && onSidebarEnter()"
      @mouseleave="!isMobile && onSidebarLeave()"
    >
      <aside
        class="admin-sidebar sidebar"
        :class="isMobile || sidebarHovered ? 'admin-sidebar--expanded' : 'admin-sidebar--collapsed'"
      >
        <div
          v-show="!isMobile && !sidebarHovered"
          class="admin-sidebar__collapsed-hint"
          title="Menú"
        >
          <i class="fas fa-bars admin-sidebar__icon admin-sidebar__icon--solo" aria-hidden="true"></i>
        </div>

        <nav v-show="isMobile || sidebarHovered" class="admin-sidebar__nav">
          <div class="admin-sidebar__section">
            <RouterLink to="/" class="admin-sidebar__link" :title="`Tu día en ${SYSTEM_NAME}`">
              <i class="fas fa-home admin-sidebar__icon" aria-hidden="true"></i>
              <span class="admin-sidebar__label">Inicio</span>
            </RouterLink>
          </div>
          <div class="admin-sidebar__section">
            <button
              type="button"
              class="admin-sidebar__link"
              title="Mapa del sitio"
              @click="showSiteMap = true"
            >
              <i class="fas fa-sitemap admin-sidebar__icon" aria-hidden="true"></i>
              <span class="admin-sidebar__label">Mapa</span>
            </button>
          </div>
          <div class="admin-sidebar__section">
            <button
              type="button"
              class="admin-sidebar__link"
              :title="`¿Para qué sirve ${SYSTEM_NAME}?`"
              @click="showSystemHelp = true"
            >
              <i class="fas fa-info-circle admin-sidebar__icon" aria-hidden="true"></i>
              <span class="admin-sidebar__label">¿Qué es {{ SYSTEM_SHORT }}?</span>
            </button>
          </div>
          <div
            v-for="pin in sidebarPins"
            :key="'sb-' + pin.id"
            class="admin-sidebar__section"
          >
            <RouterLink :to="pin.route" class="admin-sidebar__link" :title="pin.label">
              <i :class="[resolveMenuFaIcon(pin), 'admin-sidebar__icon']" aria-hidden="true"></i>
              <span class="admin-sidebar__label">{{ pin.label }}</span>
            </RouterLink>
          </div>

          <div class="admin-sidebar__footer">
            <button
              type="button"
              class="admin-sidebar__avatar"
              :title="displayName"
              @click="showUserPanel = true"
            >
              {{ userInitials }}
            </button>
            <button type="button" class="admin-sidebar__link" title="Cerrar sesión" @click="showUserPanel = true">
              <i class="fas fa-sign-out-alt admin-sidebar__icon" aria-hidden="true"></i>
              <span class="admin-sidebar__label">Salir</span>
            </button>
          </div>
        </nav>
      </aside>
    </div>

    <!-- Centro: header + contenido -->
    <div
      class="admin-center"
      :class="isChatbotCollapsed ? 'admin-center--chat-collapsed' : 'admin-center--chat-expanded'"
    >
      <header class="admin-top-header" :class="{ 'admin-top-header--mobile': isMobile }">
        <div v-show="isMobile" class="admin-top-header__mobile">
          <RouterLink to="/" class="admin-top-header__logo">
            <img
              :src="SYSTEM_LOGO"
              :alt="`${SYSTEM_NAME} — ${SYSTEM_TAGLINE}`"
              class="admin-top-header__logo-img admin-top-header__logo-img--mobile system-logo"
            />
          </RouterLink>
          <button type="button" class="header-button header-button--compact" @click="showSiteMap = true">
            <i class="fas fa-sitemap header-button__icon" aria-hidden="true"></i>
            <span>Mapa</span>
          </button>
          <button
            type="button"
            class="header-button header-button--compact system-info-btn--mobile"
            :aria-label="`¿Para qué sirve ${SYSTEM_NAME}?`"
            title="¿Para qué sirve el sistema?"
            @click="showSystemHelp = true"
          >
            <i class="fas fa-info-circle header-button__icon" aria-hidden="true"></i>
            <span>{{ SYSTEM_SHORT }}</span>
          </button>
          <ThemeToggle />
          <button type="button" class="header-user-btn header-user-btn--mobile" @click="showUserPanel = true">
            {{ userInitials }}
          </button>
        </div>

        <div v-show="!isMobile" class="admin-top-header__desktop">
          <RouterLink to="/" class="admin-top-header__logo admin-top-header__logo--wide">
            <img
              :src="SYSTEM_LOGO"
              :alt="`${SYSTEM_NAME} — ${SYSTEM_TAGLINE}`"
              class="admin-top-header__logo-img system-logo"
            />
          </RouterLink>

          <div class="admin-top-header__center">
            <button
              type="button"
              class="system-info-btn"
              :aria-label="`¿Para qué sirve ${SYSTEM_NAME}?`"
              title="¿Para qué sirve el sistema?"
              @click="showSystemHelp = true"
            >
              <i class="fas fa-info-circle" aria-hidden="true"></i>
              <span class="system-info-btn__label">¿Para qué sirve?</span>
            </button>
          </div>

          <div class="admin-top-header__actions">
            <button type="button" class="header-button" @click="showSiteMap = true">
              <i class="fas fa-sitemap header-button__icon" aria-hidden="true"></i>
              <span>Mapa del sitio</span>
            </button>
            <RouterLink
              v-for="pin in headerPins"
              :key="'hd-' + pin.id"
              :to="pin.route"
              class="header-button"
            >
              <i :class="[resolveMenuFaIcon(pin), 'header-button__icon']" aria-hidden="true"></i>
              <span>{{ pin.label }}</span>
            </RouterLink>
            <ThemeToggle />
            <button
              type="button"
              class="header-user-btn"
              :title="displayName"
              aria-label="Opciones de usuario"
              @click="showUserPanel = true"
            >
              {{ userInitials }}
            </button>
          </div>
        </div>
      </header>

      <main ref="mainEl" class="admin-main" tabindex="-1">
        <RouterView v-slot="{ Component }">
          <component :is="Component" v-if="Component" :key="route.path" />
        </RouterView>
      </main>
    </div>

    <AdminFunctionsModal
      v-model="showSiteMap"
      :can-edit-chrome="canEditMenuChrome"
    />

    <InfoModal
      v-model="showSystemHelp"
      :title="SYSTEM_HELP.title"
      :summary="SYSTEM_HELP.summary"
      :when-to-use="SYSTEM_HELP.whenToUse"
      :bullets="SYSTEM_HELP.bullets"
      :sections="SYSTEM_HELP.sections"
    />

    <Teleport to="body">
      <div v-if="showUserPanel" class="user-panel-backdrop" @click.self="showUserPanel = false">
        <div class="user-panel" role="dialog" aria-modal="true" @click.stop>
          <div class="user-panel__head">
            <div class="user-panel__avatar">{{ userInitials }}</div>
            <div>
              <p class="user-panel__name">{{ displayName }}</p>
              <p class="user-panel__meta">{{ auth.user?.email }}</p>
              <p class="user-panel__meta">{{ auth.user?.rol }}</p>
            </div>
          </div>
          <p class="user-panel__meta">¿Cerrar sesión en {{ SYSTEM_NAME }}?</p>
          <button class="btn btn-primary" type="button" style="width: 100%; margin-top: 0.75rem" @click="onLogout">
            Salir
          </button>
          <button class="btn btn-ghost" type="button" style="width: 100%; margin-top: 0.5rem" @click="showUserPanel = false">
            Cancelar
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router";
import AdminFunctionsModal from "../components/AdminFunctionsModal.vue";
import AdminShellChatbot from "../components/AdminShellChatbot.vue";
import InfoModal from "../components/InfoModal.vue";
import ThemeToggle from "../components/ThemeToggle.vue";
import { SYSTEM_LOGO, SYSTEM_NAME, SYSTEM_SHORT, SYSTEM_TAGLINE } from "../constants/brand";
import { SYSTEM_HELP } from "../constants/systemHelp";
import { useAuthStore } from "../stores/auth";
import { useMenuChromeStore } from "../stores/menuChrome";
import { resolveMenuFaIcon } from "../utils/menuChrome";

const auth = useAuthStore();
const menuChrome = useMenuChromeStore();
const route = useRoute();
const router = useRouter();

const isChatbotCollapsed = ref(true);
const showSiteMap = ref(false);
const showSystemHelp = ref(false);
const showUserPanel = ref(false);
const sidebarHovered = ref(false);
const isMobile = ref(false);
const mainEl = ref<HTMLElement | null>(null);
const chatbotRef = ref<InstanceType<typeof AdminShellChatbot> | null>(null);
let sidebarHoverTimeout: ReturnType<typeof setTimeout> | null = null;
let chatHoverTimeout: ReturnType<typeof setTimeout> | null = null;

const sidebarPins = computed(() => menuChrome.sidebarPins);
const headerPins = computed(() => menuChrome.headerPins);
const canEditMenuChrome = computed(() => auth.user?.rol === "admin");

const displayName = computed(() => auth.user?.nombre || auth.user?.email || "Usuario");

const userInitials = computed(() => {
  const n = String(displayName.value).trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
});

function checkMobile(): void {
  isMobile.value = window.matchMedia("(max-width: 768px)").matches;
}

function onSidebarEnter(): void {
  if (sidebarHoverTimeout) {
    clearTimeout(sidebarHoverTimeout);
    sidebarHoverTimeout = null;
  }
  sidebarHovered.value = true;
}

function onSidebarLeave(): void {
  sidebarHoverTimeout = setTimeout(() => {
    sidebarHovered.value = false;
    sidebarHoverTimeout = null;
  }, 150);
}

function onChatEnter(): void {
  if (chatHoverTimeout) {
    clearTimeout(chatHoverTimeout);
    chatHoverTimeout = null;
  }
  isChatbotCollapsed.value = false;
}

function onChatLeave(): void {
  if (chatbotRef.value?.isMaximized) return;
  chatHoverTimeout = setTimeout(() => {
    isChatbotCollapsed.value = true;
    chatHoverTimeout = null;
  }, 150);
}

function onLogout(): void {
  showUserPanel.value = false;
  auth.logout();
  router.push({ name: "login" });
}

function onOpenSiteMapEvent(): void {
  showSiteMap.value = true;
}

function scrollContentToTop(): void {
  void nextTick(() => {
    requestAnimationFrame(() => {
      try {
        if (mainEl.value?.isConnected) mainEl.value.scrollTop = 0;
        window.scrollTo(0, 0);
      } catch {
        /* ignore scroll during layout teardown */
      }
    });
  });
}

function closeShellOverlays(): void {
  showUserPanel.value = false;
  showSiteMap.value = false;
  showSystemHelp.value = false;
  isChatbotCollapsed.value = true;
  chatbotRef.value?.collapse();
}

let removeBeforeEach: (() => void) | null = null;
let removeAfterEach: (() => void) | null = null;

onMounted(() => {
  checkMobile();
  window.addEventListener("resize", checkMobile);
  window.addEventListener("ffa-open-site-map", onOpenSiteMapEvent);
  menuChrome.reload();
  scrollContentToTop();

  removeBeforeEach = router.beforeEach(() => {
    closeShellOverlays();
  });
  removeAfterEach = router.afterEach(() => {
    scrollContentToTop();
  });
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
  window.removeEventListener("ffa-open-site-map", onOpenSiteMapEvent);
  removeBeforeEach?.();
  removeAfterEach?.();
  if (sidebarHoverTimeout) clearTimeout(sidebarHoverTimeout);
  if (chatHoverTimeout) clearTimeout(chatHoverTimeout);
});
</script>
