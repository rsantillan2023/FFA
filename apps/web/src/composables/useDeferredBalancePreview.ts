import type { LineaDraftOverride } from "../utils/balanceTotales";
import { computed, onUnmounted, shallowRef } from "vue";

/** Propaga cambios de borrador a totales/cuadratura sin bloquear la edición inline. */
export function useDeferredBalancePreview(delayMs = 320) {
  const pendingOverrides = shallowRef<Record<string, LineaDraftOverride>>({});
  const calcOverrides = shallowRef<Record<string, LineaDraftOverride>>({});
  const isRecalculating = shallowRef(false);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;

  function flushCalc(): void {
    calcOverrides.value = { ...pendingOverrides.value };
    isRecalculating.value = false;
  }

  function scheduleFlush(): void {
    isRecalculating.value = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        flushCalc();
      });
    }, delayMs);
  }

  function register(lineaId: string, override: LineaDraftOverride | null): void {
    const next = { ...pendingOverrides.value };
    if (override) {
      next[lineaId] = override;
    } else {
      delete next[lineaId];
    }
    pendingOverrides.value = next;
    scheduleFlush();
  }

  function flushNow(): void {
    if (timer) clearTimeout(timer);
    if (rafId) cancelAnimationFrame(rafId);
    timer = null;
    rafId = null;
    flushCalc();
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer);
    if (rafId) cancelAnimationFrame(rafId);
  });

  const hasPendingChanges = computed(() => Object.keys(pendingOverrides.value).length > 0);

  return {
    pendingOverrides,
    calcOverrides,
    isRecalculating,
    hasPendingChanges,
    register,
    flushNow,
  };
}
