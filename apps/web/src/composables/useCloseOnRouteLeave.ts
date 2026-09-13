import type { Ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

/** Cierra flags booleanos (p. ej. modales) antes de desmontar la vista al navegar. */
export function useCloseOnRouteLeave(...flags: Ref<boolean>[]): void {
  onBeforeRouteLeave(() => {
    for (const flag of flags) flag.value = false;
  });
}
