<template>
  <Teleport to="body">
    <div v-if="modelValue" class="admin-fn-modal" @click.self="close">
    <div
      class="admin-fn-modal__card"
      :class="{ 'admin-fn-modal__card--spotlight': SPOTLIGHT_ENABLED }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-map-title"
    >
      <header class="admin-fn-modal__hero">
        <div class="admin-fn-modal__glow admin-fn-modal__glow--one" aria-hidden="true"></div>
        <div class="admin-fn-modal__glow admin-fn-modal__glow--two" aria-hidden="true"></div>
        <div class="admin-fn-modal__hero-inner">
          <div class="admin-fn-modal__brand-row">
            <img :src="PRODUCT_LOGO_ON_BRAND" alt="Connectyx" class="admin-fn-modal__logo" />
            <p class="admin-fn-modal__eyebrow">CENTRO DE CONTROL</p>
            <div class="admin-fn-modal__brand-end">
              <div class="admin-fn-modal__summary" aria-label="Resumen de capacidades">
                <span class="admin-fn-modal__stat">
                  <strong>{{ totalItems }}</strong> funciones
                </span>
                <span class="admin-fn-modal__stat">
                  <strong>{{ totalGroups }}</strong> áreas
                </span>
              </div>
              <button type="button" class="admin-fn-modal__close" aria-label="Cerrar" @click="close">
                <i class="fas fa-times" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <h2 id="site-map-title" class="admin-fn-modal__title">
            Todo lo que SOOFT FINYX puede hacer, en un solo lugar.
          </h2>
          <p class="admin-fn-modal__lead">
            Explorá módulos, entrá directo a cada pantalla y configurá accesos en la barra lateral o el menú superior.
          </p>
        </div>
      </header>

      <div class="admin-fn-modal__split">
        <nav class="admin-fn-modal__index" aria-label="Grupos del mapa">
          <div class="admin-fn-modal__index-list">
            <button
              v-for="cluster in clustersWithMeta"
              :key="cluster.id"
              type="button"
              class="admin-fn-modal__index-btn"
              :class="{ on: activeCluster?.id === cluster.id, dim: queryNorm && !cluster.hasMatches }"
              @click="selectCluster(cluster.id)"
            >
              <span class="admin-fn-modal__index-icon">
                <i :class="cluster.icon || 'fas fa-folder-open'" aria-hidden="true"></i>
              </span>
              <span class="admin-fn-modal__index-text">
                <strong>{{ cluster.label }}</strong>
                <small>{{ cluster.description }}</small>
              </span>
              <em class="admin-fn-modal__badge">{{ queryNorm ? cluster.matchCount : cluster.itemCount }}</em>
            </button>
          </div>
          <label class="admin-fn-modal__index-search">
            <span class="sr-only">Buscar función</span>
            <i class="fas fa-search admin-fn-modal__search-ico" aria-hidden="true"></i>
            <input
              v-model="query"
              type="search"
              class="admin-fn-modal__search-input"
              placeholder="¿Qué necesitás gestionar hoy?"
              autocomplete="off"
            />
            <button v-if="query" type="button" class="admin-fn-modal__search-clear" @click="query = ''">
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </label>
        </nav>

        <div ref="bodyEl" class="admin-fn-modal__body">
          <div :key="(activeCluster?.id || '') + '|' + queryNorm" class="admin-fn-modal__detail">
            <div v-if="displayBlocks.length" class="admin-fn-modal__detail-head">
              <div class="admin-fn-modal__detail-row">
                <h3 class="admin-fn-modal__cluster-title">
                  {{
                    queryNorm
                      ? `Encontramos ${displayBlocks.reduce((n, b) => n + b.itemCount, 0)} opciones`
                      : activeCluster?.label
                  }}
                </h3>
                <p class="admin-fn-modal__detail-kicker">
                  {{ queryNorm ? "RESULTADOS" : "CAPACIDADES DISPONIBLES" }}
                </p>
              </div>
              <div class="admin-fn-modal__detail-sub">
                <p v-if="!queryNorm" class="admin-fn-modal__cluster-copy">
                  {{ activeCluster?.description }}
                </p>
                <span v-if="canEditChrome" class="admin-fn-modal__personalize-note">
                  <i class="fas fa-thumbtack" aria-hidden="true"></i>
                  Personalizá tus accesos con Side y Sup
                </span>
              </div>
            </div>

            <template v-if="displayBlocks.length">
              <div v-for="block in displayBlocks" :key="block.clusterId" class="admin-fn-modal__block">
                <p v-if="queryNorm && displayBlocks.length > 1" class="admin-fn-modal__block-label">
                  {{ block.clusterLabel }}
                </p>
                <div class="admin-fn-modal__grid">
                  <section
                    v-for="section in block.groups"
                    :key="section.id + '-' + block.clusterId"
                    class="admin-fn-modal__section"
                  >
                    <div class="admin-fn-modal__section-h">
                      <span class="admin-fn-modal__section-icon">
                        <i :class="section.headerIcon || 'fas fa-folder-open'" aria-hidden="true"></i>
                      </span>
                      <span>{{ section.label }}</span>
                      <em class="admin-fn-modal__badge">{{ section.items.length }}</em>
                    </div>
                    <div class="admin-fn-modal__section-b">
                      <div
                        v-if="canEditChrome && section.items.some((i) => i.id)"
                        class="admin-fn-modal__row admin-fn-modal__row--legend"
                      >
                        <span class="admin-fn-modal__item-text" aria-hidden="true"></span>
                        <div class="admin-fn-modal__pins-legend">
                          <span title="Side: menú lateral">Side</span>
                          <span title="Sup: menú superior">Sup</span>
                        </div>
                      </div>
                      <div
                        v-for="item in section.items"
                        :key="item.id + item.route"
                        class="admin-fn-modal__row"
                      >
                        <RouterLink :to="item.route" class="admin-fn-modal__link" @click="close">
                          <span class="admin-fn-modal__item-icon">
                            <i :class="resolveMenuFaIcon(item)" aria-hidden="true"></i>
                          </span>
                          <span class="admin-fn-modal__item-text">
                            <strong class="admin-fn-modal__item-title">{{ item.label }}</strong>
                            <small class="admin-fn-modal__item-copy">{{ item.description }}</small>
                          </span>
                          <i class="fas fa-arrow-right admin-fn-modal__arrow" aria-hidden="true"></i>
                        </RouterLink>
                        <div v-if="canEditChrome && item.id" class="admin-fn-modal__pins" @click.stop>
                          <label class="admin-fn-modal__pin" title="Side: menú lateral">
                            <input
                              type="checkbox"
                              :checked="item.showInAdminSidebar"
                              @change="onToggle(item.id, 'showInAdminSidebar', ($event.target as HTMLInputElement).checked)"
                            />
                          </label>
                          <label class="admin-fn-modal__pin" title="Sup: menú superior">
                            <input
                              type="checkbox"
                              :checked="item.showInAdminHeader"
                              @change="onToggle(item.id, 'showInAdminHeader', ($event.target as HTMLInputElement).checked)"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </template>

            <div v-else class="admin-fn-modal__empty">
              <span><i class="fas fa-search" aria-hidden="true"></i></span>
              <h3>No encontramos esa función</h3>
              <p>Probá con otra palabra o explorá las áreas disponibles.</p>
              <button type="button" @click="query = ''">Ver todas las funciones</button>
            </div>
          </div>
        </div>

        <aside v-if="SPOTLIGHT_ENABLED && spotlight" class="admin-fn-modal__spotlight" aria-label="Vista de la sección activa">
          <div :key="spotlight.id" class="admin-fn-modal__spot-inner">
            <div class="admin-fn-modal__spot-art" aria-hidden="true">
              <svg class="admin-fn-modal__spot-svg" viewBox="0 0 220 150" role="presentation">
                <defs>
                  <radialGradient id="ffaSpotGlow" cx="50%" cy="48%" r="52%">
                    <stop offset="0%" stop-color="currentColor" stop-opacity="0.26" />
                    <stop offset="65%" stop-color="currentColor" stop-opacity="0.05" />
                    <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
                  </radialGradient>
                </defs>
                <ellipse cx="110" cy="74" rx="108" ry="72" fill="url(#ffaSpotGlow)" />
                <circle cx="110" cy="74" r="66" fill="none" stroke="currentColor" stroke-opacity="0.08" />
                <circle
                  class="admin-fn-modal__spot-ring"
                  cx="110"
                  cy="74"
                  r="50"
                  fill="none"
                  stroke="currentColor"
                  stroke-opacity="0.28"
                  stroke-dasharray="3 7"
                  stroke-linecap="round"
                />
              </svg>
              <span class="admin-fn-modal__spot-core">
                <i :class="spotlight.icon"></i>
              </span>
              <span
                v-for="(satIcon, index) in spotlight.satellites"
                :key="'sat-' + index + satIcon"
                class="admin-fn-modal__spot-sat"
                :class="'admin-fn-modal__spot-sat--' + (index + 1)"
              >
                <i :class="satIcon"></i>
              </span>
            </div>
            <p class="admin-fn-modal__spot-kicker">{{ spotlight.kicker }}</p>
            <h3 class="admin-fn-modal__spot-title">{{ spotlight.headline }}</h3>
            <p class="admin-fn-modal__spot-copy">{{ spotlight.copy }}</p>
            <ul class="admin-fn-modal__spot-bullets">
              <li v-for="bullet in spotlight.bullets" :key="bullet">
                <i class="fas fa-check" aria-hidden="true"></i>
                <span>{{ bullet }}</span>
              </li>
            </ul>
            <p v-if="spotlight.includes" class="admin-fn-modal__spot-includes">
              <em>Incluye</em>
              {{ spotlight.includes }}
            </p>
            <p class="admin-fn-modal__spot-stats">
              <strong>{{ spotlight.itemCount }}</strong> funciones ·
              <strong>{{ spotlight.groupCount }}</strong> áreas
            </p>
          </div>
        </aside>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { PRODUCT_LOGO_ON_BRAND } from "../constants/brand";
import { useMenuChromeStore } from "../stores/menuChrome";
import { resolveMenuFaIcon, type FfaMenuCluster, type FfaMenuGroup, type FfaMenuItem } from "../utils/menuChrome";

const SPOTLIGHT_ENABLED = true;

const CLUSTER_SPOTLIGHT: Record<
  string,
  { kicker: string; headline: string; copy: string; bullets: string[] }
> = {
  "operacion-trabajo": {
    kicker: "TRABAJO CON FICHAS",
    headline: "Desde el inicio del día hasta la bandeja activa",
    copy: "Orientación del flujo, carga de documentos y seguimiento de fichas en procesamiento.",
    bullets: [
      "Resumen del día y accesos rápidos",
      "Mapa del proceso en 7 etapas",
      "Bandeja de fichas y carga de PDFs",
    ],
  },
  "operacion-analisis": {
    kicker: "ANÁLISIS E HISTÓRICO",
    headline: "Fichas cerradas y análisis entre períodos",
    copy: "Consultá resultados aprobados y contrastá ejercicios o grupos económicos.",
    bullets: [
      "Archivo de fichas e informes aprobados",
      "Comparación histórica entre ejercicios",
      "Consolidación multi-empresa del holding",
    ],
  },
  maestros: {
    kicker: "DATOS MAESTROS",
    headline: "Contribuyentes y plan institucional",
    copy: "Los registros base que alimentan cada ficha financiera.",
    bullets: [
      "Registro y búsqueda de contribuyentes",
      "Plan de cuentas por rubro",
      "Versiones y aprobación del plan",
    ],
  },
  administracion: {
    kicker: "ADMINISTRACIÓN",
    headline: "Usuarios, parámetros y operación del sistema",
    copy: "Configuración global, accesos internos y salud operativa.",
    bullets: [
      "Usuarios y roles internos",
      "Umbral de confianza y proveedor",
      "Colas, reprocesamiento y extracción",
    ],
  },
};

const SPOTLIGHT_FALLBACK = {
  kicker: "CENTRO DE CONTROL",
  headline: "Funciones disponibles en SOOFT FINYX",
  copy: "Todo lo habilitado para tu organización.",
  bullets: ["Explorá el mapa y fijá accesos en Side o Sup"],
};

const props = defineProps<{
  modelValue: boolean;
  canEditChrome?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const menuChrome = useMenuChromeStore();
const activeClusterId = ref("operacion-trabajo");
const query = ref("");
const bodyEl = ref<HTMLElement | null>(null);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function itemMatches(item: FfaMenuItem, q: string): boolean {
  if (!q) return true;
  const hay = normalize([item.label, item.route, item.description ?? ""].join(" "));
  return hay.includes(q);
}

function filterCluster(cluster: FfaMenuCluster & { groups: FfaMenuGroup[] }, q: string) {
  const groups: FfaMenuGroup[] = [];
  for (const g of cluster.groups) {
    const items = g.items.filter((i) => itemMatches(i, q));
    if (items.length) groups.push({ ...g, items });
  }
  return { ...cluster, groups };
}

function countItems(cluster: { groups: FfaMenuGroup[] }): number {
  return cluster.groups.reduce((n, g) => n + g.items.length, 0);
}

function countGroups(cluster: { groups: FfaMenuGroup[] }): number {
  return cluster.groups.filter((g) => g.items.length).length;
}

const queryNorm = computed(() => normalize(query.value.trim()));

const clustersWithMeta = computed(() =>
  menuChrome.clusters.map((c) => {
    const filtered = filterCluster(c, queryNorm.value);
    return {
      ...c,
      itemCount: countItems(c),
      matchCount: countItems(filtered),
      hasMatches: !queryNorm.value || countItems(filtered) > 0,
      filteredGroups: filtered.groups,
    };
  }),
);

const activeCluster = computed(() => {
  const list = clustersWithMeta.value;
  return list.find((c) => c.id === activeClusterId.value) ?? list[0] ?? null;
});

const totalItems = computed(() => menuChrome.flatMenu.length);
const totalGroups = computed(() => menuChrome.clusters.reduce((n, c) => n + countGroups(c), 0));

const displayBlocks = computed(() => {
  const q = queryNorm.value;
  const list = clustersWithMeta.value;
  if (!list.length) return [];

  if (!q) {
    const c = activeCluster.value;
    if (!c?.groups.length) return [];
    return [
      {
        clusterId: c.id,
        clusterLabel: c.label,
        groups: c.groups,
        groupCount: countGroups(c),
        itemCount: countItems(c),
      },
    ];
  }

  const matches = list.filter((c) => c.hasMatches);
  const focused = matches.find((c) => c.id === activeClusterId.value);
  const toShow = focused ? [focused] : matches;
  return toShow.map((c) => ({
    clusterId: c.id,
    clusterLabel: c.label,
    groups: c.filteredGroups,
    groupCount: c.filteredGroups.length,
    itemCount: c.matchCount,
  }));
});

function spotlightNames(cluster: (typeof clustersWithMeta.value)[0] | null): string[] {
  const names: string[] = [];
  for (const group of cluster?.groups ?? []) {
    for (const item of group.items) {
      if (item.label && !names.includes(item.label)) names.push(item.label);
    }
  }
  return names;
}

function spotlightSatellites(cluster: (typeof clustersWithMeta.value)[0] | null): string[] {
  const icons: string[] = [];
  for (const group of cluster?.groups ?? []) {
    for (const item of group.items) {
      if (!item.icon || icons.includes(item.icon)) continue;
      icons.push(item.icon);
      if (icons.length >= 3) return icons;
    }
  }
  while (icons.length < 3) icons.push("fas fa-circle");
  return icons;
}

const spotlight = computed(() => {
  const cluster = activeCluster.value;
  if (!cluster) return null;
  const copy = CLUSTER_SPOTLIGHT[cluster.id] ?? SPOTLIGHT_FALLBACK;
  const names = spotlightNames(cluster);
  const shown = names.slice(0, 6);
  const rest = names.length - shown.length;
  return {
    ...copy,
    id: cluster.id,
    icon: cluster.icon || "fas fa-folder-open",
    itemCount: cluster.itemCount,
    groupCount: countGroups(cluster),
    includes: shown.join(" · ") + (rest > 0 ? ` y ${rest} más` : ""),
    satellites: spotlightSatellites(cluster),
  };
});

function selectCluster(id: string): void {
  if (query.value) query.value = "";
  activeClusterId.value = id;
  scrollBodyTop();
}

async function scrollBodyTop(): Promise<void> {
  await nextTick();
  if (bodyEl.value) bodyEl.value.scrollTop = 0;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      query.value = "";
      return;
    }
    if (!menuChrome.clusters.some((c) => c.id === activeClusterId.value)) {
      activeClusterId.value = menuChrome.clusters[0]?.id ?? "operacion-trabajo";
    }
  },
  { immediate: true },
);

watch(queryNorm, (q) => {
  scrollBodyTop();
  if (!q) return;
  const first = clustersWithMeta.value.find((c) => c.hasMatches);
  if (first && activeClusterId.value !== first.id) activeClusterId.value = first.id;
});

watch(activeClusterId, () => {
  scrollBodyTop();
});

function onKeydown(e: KeyboardEvent): void {
  if (!props.modelValue) return;
  if (e.key === "Escape") {
    e.preventDefault();
    close();
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

function close(): void {
  emit("update:modelValue", false);
}

function onToggle(
  id: string,
  field: "showInAdminSidebar" | "showInAdminHeader",
  value: boolean,
): void {
  menuChrome.setChrome(id, field, value);
}
</script>

<style scoped>
@import "./admin-fn-modal.css";
</style>
