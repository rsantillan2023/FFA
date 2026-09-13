import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  getFlatMenu,
  getMenuClusters,
  toggleMenuChrome,
  type FfaMenuItem,
} from "../utils/menuChrome";

export const useMenuChromeStore = defineStore("menuChrome", () => {
  const revision = ref(0);

  function reload(): void {
    revision.value += 1;
  }

  const flatMenu = computed((): FfaMenuItem[] => {
    void revision.value;
    return getFlatMenu();
  });

  const sidebarPins = computed(() =>
    flatMenu.value.filter((i) => i.showInAdminSidebar && i.route !== "/"),
  );

  const headerPins = computed(() =>
    flatMenu.value.filter((i) => i.showInAdminHeader && i.route !== "/"),
  );

  const clusters = computed(() => {
    void revision.value;
    return getMenuClusters();
  });

  function setChrome(id: string, field: "showInAdminSidebar" | "showInAdminHeader", value: boolean): void {
    toggleMenuChrome(id, field, value);
    reload();
  }

  return {
    flatMenu,
    sidebarPins,
    headerPins,
    clusters,
    reload,
    setChrome,
  };
});
