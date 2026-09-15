<template>
  <CreateFormModal
    v-model="open"
    title="Clasificación con IA"
    :subtitle="linea?.denominacionOriginal"
    wide
  >
    <dl v-if="linea" class="ia-detalle">
      <div v-if="rubroLabel" class="ia-detalle__row">
        <dt>Rubro asignado</dt>
        <dd>{{ rubroLabel }}</dd>
      </div>
      <div v-if="linea.confianzaClasificacion != null" class="ia-detalle__row">
        <dt>Confianza</dt>
        <dd>{{ linea.confianzaClasificacion }}%</dd>
      </div>
      <div v-if="linea.clasificacionIaAt" class="ia-detalle__row">
        <dt>Procesado</dt>
        <dd>{{ fechaDisplay }}</dd>
      </div>
      <div v-if="linea.clasificacionIaRazonamiento" class="ia-detalle__row ia-detalle__row--full">
        <dt>Razonamiento</dt>
        <dd class="ia-detalle__razon">{{ linea.clasificacionIaRazonamiento }}</dd>
      </div>
    </dl>

    <template #footer>
      <button class="btn btn-primary" type="button" @click="open = false">Cerrar</button>
    </template>
  </CreateFormModal>
</template>

<script setup lang="ts">
import type { LineaContableDto } from "@ffa/shared";
import { computed } from "vue";
import CreateFormModal from "./CreateFormModal.vue";

const open = defineModel<boolean>({ required: true });

const props = defineProps<{
  linea: LineaContableDto | null;
}>();

const rubroLabel = computed(() => {
  const l = props.linea;
  if (!l?.rubroCodigo && !l?.rubroNombre) return "";
  if (l.rubroCodigo && l.rubroNombre) return `${l.rubroCodigo} — ${l.rubroNombre}`;
  return l.rubroCodigo ?? l.rubroNombre ?? "";
});

const fechaDisplay = computed(() => {
  const raw = props.linea?.clasificacionIaAt;
  if (!raw) return "";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(raw));
  } catch {
    return raw;
  }
});
</script>

<style scoped>
.ia-detalle {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin: 0;
}

.ia-detalle__row {
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 0.5rem 0.75rem;
  align-items: start;
}

.ia-detalle__row--full {
  grid-template-columns: 1fr;
}

.ia-detalle__row dt {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink-faint);
}

.ia-detalle__row dd {
  margin: 0;
  font-size: 0.88rem;
  color: var(--ink);
  line-height: 1.45;
}

.ia-detalle__razon {
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--brand) 22%, var(--line));
  background: color-mix(in srgb, var(--brand) 6%, var(--panel));
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
