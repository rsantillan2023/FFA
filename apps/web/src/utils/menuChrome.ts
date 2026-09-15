export interface FfaMenuItem {
  id: string;
  key: string;
  label: string;
  route: string;
  icon: string;
  groupId: string;
  description?: string;
  showInAdminSidebar?: boolean;
  showInAdminHeader?: boolean;
}

export interface FfaMenuGroup {
  id: string;
  label: string;
  headerIcon: string;
  items: FfaMenuItem[];
}

export interface FfaMenuCluster {
  id: string;
  label: string;
  icon: string;
  sectionIds: string[];
  description?: string;
}

const CHROME_KEY = "ffa_menu_chrome";

/** Rutas visibles por defecto en la barra lateral (iconos). */
const DEFAULT_SIDEBAR_ROUTES = ["/", "/flujo", "/casos", "/repositorio", "/contribuyentes", "/admin"];

/** Accesos rápidos por defecto en el header superior. */
const DEFAULT_HEADER_ROUTES = ["/casos", "/admin"];

export const FFA_MENU_CLUSTERS: FfaMenuCluster[] = [
  {
    id: "operacion-trabajo",
    label: "Trabajo con fichas",
    icon: "fas fa-folder-open",
    sectionIds: ["operacion-inicio", "operacion-fichas"],
    description: "Inicio del día, mapa del proceso y bandeja de fichas activas.",
  },
  {
    id: "operacion-analisis",
    label: "Análisis e histórico",
    icon: "fas fa-chart-bar",
    sectionIds: ["operacion-archivo", "operacion-analisis"],
    description: "Fichas aprobadas, comparación entre ejercicios y consolidación de grupos.",
  },
  {
    id: "maestros",
    label: "Datos maestros",
    icon: "fas fa-database",
    sectionIds: ["maestros"],
    description: "Directorio de contribuyentes y plan contable institucional.",
  },
  {
    id: "administracion",
    label: "Administración",
    icon: "fas fa-cog",
    sectionIds: ["administracion"],
    description: "Usuarios, parámetros globales y mantenimiento técnico.",
  },
];

export const FFA_MENU_BASE: Omit<FfaMenuItem, "showInAdminSidebar" | "showInAdminHeader">[] = [
  {
    id: "dashboard",
    key: "dashboard",
    label: "Panel de inicio",
    route: "/",
    icon: "fas fa-chart-line",
    groupId: "operacion-inicio",
    description: "Qué tenés pendiente y accesos rápidos al trabajo diario.",
  },
  {
    id: "flujo",
    key: "flujo",
    label: "Mapa del proceso",
    route: "/flujo",
    icon: "fas fa-project-diagram",
    groupId: "operacion-inicio",
    description: "Diagrama de las 7 etapas y seguimiento de expedientes.",
  },
  {
    id: "casos",
    key: "casos",
    label: "Bandeja de fichas",
    route: "/casos",
    icon: "fas fa-folder-open",
    groupId: "operacion-fichas",
    description: "Cargar documentos y seguir el procesamiento de cada ficha.",
  },
  {
    id: "repositorio",
    key: "repositorio",
    label: "Fichas aprobadas",
    route: "/repositorio",
    icon: "fas fa-archive",
    groupId: "operacion-archivo",
    description: "Archivo histórico por contribuyente y ejercicio.",
  },
  {
    id: "comparacion",
    key: "comparacion",
    label: "Comparar ejercicios",
    route: "/comparacion",
    icon: "fas fa-balance-scale",
    groupId: "operacion-analisis",
    description: "Variaciones financieras entre años de un mismo cliente.",
  },
  {
    id: "consolidacion",
    key: "consolidacion",
    label: "Consolidar grupo",
    route: "/consolidacion",
    icon: "fas fa-layer-group",
    groupId: "operacion-analisis",
    description: "Análisis conjunto de empresas relacionadas del holding.",
  },
  {
    id: "contribuyentes",
    key: "contribuyentes",
    label: "Directorio de empresas",
    route: "/contribuyentes",
    icon: "fas fa-building",
    groupId: "maestros",
    description: "Alta, búsqueda y nombres alternativos de contribuyentes.",
  },
  {
    id: "plan-cuentas",
    key: "plan-cuentas",
    label: "Plan contable",
    route: "/admin/plan-cuentas",
    icon: "fas fa-sitemap",
    groupId: "maestros",
    description: "Versiones del plan, rubros e importación CSV.",
  },
  {
    id: "admin",
    key: "admin",
    label: "Configuración",
    route: "/admin",
    icon: "fas fa-cog",
    groupId: "administracion",
    description: "Parámetros globales y umbral de confianza.",
  },
  {
    id: "usuarios",
    key: "usuarios",
    label: "Usuarios y roles",
    route: "/admin/usuarios",
    icon: "fas fa-users",
    groupId: "administracion",
    description: "Cuentas internas y permisos de acceso.",
  },
  {
    id: "operacion-sys",
    key: "operacion-sys",
    label: "Mantenimiento técnico",
    route: "/admin/operacion",
    icon: "fas fa-server",
    groupId: "administracion",
    description: "Colas, reprocesamiento y diagnóstico del sistema.",
  },
  {
    id: "ia-uso",
    key: "ia-uso",
    label: "Uso y costos IA",
    route: "/admin/ia-uso",
    icon: "fas fa-robot",
    groupId: "administracion",
    description: "Registro de llamadas a modelos, tokens consumidos y coste estimado.",
  },
];

type ChromeOverrides = Record<string, Partial<Pick<FfaMenuItem, "showInAdminSidebar" | "showInAdminHeader">>>;

function readOverrides(): ChromeOverrides {
  try {
    const raw = localStorage.getItem(CHROME_KEY);
    return raw ? (JSON.parse(raw) as ChromeOverrides) : {};
  } catch {
    return {};
  }
}

function writeOverrides(overrides: ChromeOverrides): void {
  localStorage.setItem(CHROME_KEY, JSON.stringify(overrides));
}

export function withAdminChromeDefaults(item: Omit<FfaMenuItem, "showInAdminSidebar" | "showInAdminHeader">): FfaMenuItem {
  const overrides = readOverrides()[item.id] ?? {};
  return {
    ...item,
    showInAdminSidebar:
      typeof overrides.showInAdminSidebar === "boolean"
        ? overrides.showInAdminSidebar
        : DEFAULT_SIDEBAR_ROUTES.includes(item.route),
    showInAdminHeader:
      typeof overrides.showInAdminHeader === "boolean"
        ? overrides.showInAdminHeader
        : DEFAULT_HEADER_ROUTES.includes(item.route),
  };
}

export function getFlatMenu(): FfaMenuItem[] {
  return FFA_MENU_BASE.map(withAdminChromeDefaults);
}

export function getMenuGroups(): FfaMenuGroup[] {
  const items = getFlatMenu();
  const byGroup = new Map<string, FfaMenuItem[]>();
  for (const item of items) {
    const list = byGroup.get(item.groupId) ?? [];
    list.push(item);
    byGroup.set(item.groupId, list);
  }
  const groupMeta: Record<string, { label: string; headerIcon: string }> = {
    "operacion-inicio": { label: "Inicio y orientación", headerIcon: "fas fa-compass" },
    "operacion-fichas": { label: "Fichas en curso", headerIcon: "fas fa-folder-open" },
    "operacion-archivo": { label: "Archivo aprobado", headerIcon: "fas fa-archive" },
    "operacion-analisis": { label: "Análisis financiero", headerIcon: "fas fa-chart-line" },
    maestros: { label: "Registros base", headerIcon: "fas fa-database" },
    administracion: { label: "Sistema y accesos", headerIcon: "fas fa-cog" },
  };
  return [...byGroup.entries()].map(([id, groupItems]) => ({
    id,
    label: groupMeta[id]?.label ?? id,
    headerIcon: groupMeta[id]?.headerIcon ?? "fas fa-folder-open",
    items: groupItems,
  }));
}

export function getMenuClusters(): Array<FfaMenuCluster & { groups: FfaMenuGroup[] }> {
  const groups = getMenuGroups();
  const byId = new Map(groups.map((g) => [g.id, g]));
  return FFA_MENU_CLUSTERS.map((cluster) => ({
    ...cluster,
    groups: cluster.sectionIds.map((id) => byId.get(id)).filter(Boolean) as FfaMenuGroup[],
  })).filter((c) => c.groups.length > 0);
}

export function toggleMenuChrome(
  id: string,
  field: "showInAdminSidebar" | "showInAdminHeader",
  value: boolean,
): void {
  const overrides = readOverrides();
  overrides[id] = { ...overrides[id], [field]: value };
  writeOverrides(overrides);
}

/** Fallback por ruta cuando el ítem no trae icono útil (paridad Connectia). */
const ROUTE_FA: Record<string, string> = {
  "/": "fas fa-home",
  "/flujo": "fas fa-project-diagram",
  "/casos": "fas fa-folder-open",
  "/repositorio": "fas fa-archive",
  "/comparacion": "fas fa-balance-scale",
  "/consolidacion": "fas fa-layer-group",
  "/contribuyentes": "fas fa-building",
  "/admin/plan-cuentas": "fas fa-sitemap",
  "/admin": "fas fa-cog",
  "/admin/usuarios": "fas fa-users",
  "/admin/operacion": "fas fa-server",
  "/admin/ia-uso": "fas fa-robot",
};

export function resolveMenuFaIcon(item: Pick<FfaMenuItem, "icon" | "route">): string {
  const icon = String(item.icon || "").trim();
  if (icon.startsWith("fa ") || icon.startsWith("fas ") || icon.startsWith("far ") || icon.startsWith("fab ")) {
    return icon;
  }
  const route = String(item.route || "").split("?")[0];
  if (ROUTE_FA[route]) return ROUTE_FA[route];
  if (route.startsWith("/admin")) return "fas fa-cog";
  if (route.startsWith("/casos")) return "fas fa-folder-open";
  return icon || "fas fa-circle";
}
