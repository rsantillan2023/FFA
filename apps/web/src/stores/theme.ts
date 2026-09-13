import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

const PREF_KEY = "ffa_theme_pref";

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readPreference(): string {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem(PREF_KEY) || "dark";
}

function paintTheme(mode: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.style.colorScheme = mode;
}

export const useThemeStore = defineStore("theme", () => {
  const preference = ref<string>(readPreference());

  const resolved = computed<"light" | "dark">(() => {
    if (preference.value === "light" || preference.value === "dark") return preference.value;
    return systemDark() ? "dark" : "light";
  });

  const label = computed(() => (resolved.value === "dark" ? "Oscuro" : "Claro"));

  function setPreference(mode: string): void {
    if (!["light", "dark", "system"].includes(mode)) return;
    preference.value = mode;
    localStorage.setItem(PREF_KEY, mode);
  }

  function toggle(): void {
    setPreference(resolved.value === "dark" ? "light" : "dark");
  }

  function init(): void {
    document.documentElement.style.setProperty("--brand-primary", "#6b5bf0");
    document.documentElement.style.setProperty("--brand-secondary", "#4a37c8");
    paintTheme(resolved.value);
  }

  if (typeof window !== "undefined") {
    watch(
      resolved,
      (mode) => {
        paintTheme(mode);
      },
      { immediate: true },
    );

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (preference.value === "system") {
        paintTheme(resolved.value);
      }
    });
  }

  return {
    preference,
    resolved,
    label,
    setPreference,
    toggle,
    init,
  };
});
