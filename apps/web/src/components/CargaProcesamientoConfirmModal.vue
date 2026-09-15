<template>
  <CreateFormModal
    :model-value="modelValue"
    xl
    stacked
    title="Confirmar envío a procesamiento"
    subtitle="El sistema ejecutará estos pasos con tu archivo"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="carga-confirm">
      <section class="carga-confirm__resumen">
        <p class="carga-confirm__lead">
          Vas a cargar <strong>{{ archivosResumen }}</strong> como expediente
          <strong v-if="referencia">«{{ referencia }}»</strong>.
        </p>
        <ul v-if="nombresArchivos.length" class="carga-confirm__files">
          <li v-for="(nombre, i) in nombresArchivos" :key="i">
            <i class="fas fa-file-lines" aria-hidden="true"></i>
            {{ nombre }}
          </li>
        </ul>
        <p v-if="remitenteEmail?.trim()" class="carga-confirm__email">
          <i class="fas fa-envelope" aria-hidden="true"></i>
          Acuse de recepción a <strong>{{ remitenteEmail.trim() }}</strong> cuando quede registrado.
        </p>
      </section>

      <section class="carga-confirm__diagram" aria-label="Pasos del procesamiento automático">
        <p class="carga-confirm__diagram-title">Qué hará el sistema</p>
        <div class="carga-confirm__track-wrap">
          <div class="carga-confirm__track">
            <template v-for="(step, index) in CARGA_PIPELINE_STEPS" :key="step.id">
              <div
                class="carga-confirm__node"
                :class="{
                  'carga-confirm__node--first': index === 0,
                  'carga-confirm__node--next': index === 1,
                }"
              >
                <span class="carga-confirm__icon-wrap">
                  <span class="carga-confirm__icon" :class="`carga-confirm__icon--${step.tone}`">
                    <i :class="['fas', step.icon]" aria-hidden="true"></i>
                  </span>
                  <span v-if="index === 0" class="carga-confirm__badge">Ahora</span>
                </span>
                <span class="carga-confirm__node-text">
                  <span class="carga-confirm__node-label">{{ step.label }}</span>
                  <span class="carga-confirm__node-desc">{{ step.desc }}</span>
                </span>
              </div>
              <span
                v-if="index < CARGA_PIPELINE_STEPS.length - 1"
                class="carga-confirm__arrow"
                aria-hidden="true"
              >
                <i class="fas fa-arrow-right"></i>
              </span>
            </template>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <button
        class="btn btn-ghost"
        type="button"
        :disabled="confirmando"
        @click="emit('update:modelValue', false)"
      >
        Cancelar
      </button>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="confirmando"
        @click="emit('confirm')"
      >
        {{ confirmando ? "Enviando…" : "Sí, enviar a procesamiento" }}
      </button>
    </template>
  </CreateFormModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CARGA_PIPELINE_STEPS } from "../constants/cargaPipelineSteps";
import CreateFormModal from "./CreateFormModal.vue";

const props = defineProps<{
  modelValue: boolean;
  referencia?: string;
  nombresArchivos?: string[];
  remitenteEmail?: string;
  confirmando?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [];
}>();

const archivosResumen = computed(() => {
  const n = props.nombresArchivos?.length ?? 0;
  if (n === 0) return "el archivo";
  if (n === 1) return "1 archivo";
  return `${n} archivos`;
});
</script>

<style scoped>
.carga-confirm {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.carga-confirm__resumen {
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel-2);
}

.carga-confirm__lead {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--ink);
}

.carga-confirm__files {
  margin: 0.55rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.carga-confirm__files li {
  font-size: 0.8rem;
  color: var(--ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carga-confirm__files i {
  margin-right: 0.35rem;
  color: var(--brand);
}

.carga-confirm__email {
  margin: 0.55rem 0 0;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.carga-confirm__email i {
  margin-right: 0.3rem;
  color: var(--brand);
}

.carga-confirm__diagram-title {
  margin: 0 0 0.55rem;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}

.carga-confirm__track-wrap {
  overflow-x: auto;
  overflow-y: visible;
  padding-top: 0.35rem;
  padding-bottom: 0.25rem;
}

.carga-confirm__track {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: min-content;
  gap: 0;
}

.carga-confirm__node {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  min-width: 5.75rem;
  max-width: 7.5rem;
  flex-shrink: 0;
  padding: 0.45rem 0.25rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  position: relative;
}

.carga-confirm__node--first {
  border-color: color-mix(in srgb, var(--brand) 45%, var(--line));
  background: color-mix(in srgb, var(--brand) 8%, var(--panel));
}

.carga-confirm__node--next {
  border-style: dashed;
}

.carga-confirm__icon-wrap {
  position: relative;
  flex-shrink: 0;
}

.carga-confirm__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 999px;
  font-size: 0.85rem;
  color: #fff;
}

.carga-confirm__icon--brand {
  background: linear-gradient(145deg, var(--brand), var(--brand-dark, #134e4a));
}

.carga-confirm__icon--process {
  background: linear-gradient(145deg, #64748b, #475569);
}

.carga-confirm__icon--human {
  background: linear-gradient(145deg, #0ea5e9, #0369a1);
}

.carga-confirm__node-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.08rem;
  text-align: center;
}

.carga-confirm__node-label {
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.2;
}

.carga-confirm__node-desc {
  font-size: 0.52rem;
  color: var(--ink-soft);
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.carga-confirm__badge {
  position: absolute;
  top: -0.45rem;
  left: 50%;
  z-index: 1;
  transform: translateX(-50%);
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  border: 1.5px solid var(--panel);
  background: var(--brand);
  color: #fff;
  font-size: 0.5rem;
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
}

.carga-confirm__arrow {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 0.12rem;
  color: color-mix(in srgb, var(--brand) 55%, var(--ink-soft));
  font-size: 0.65rem;
}

</style>
