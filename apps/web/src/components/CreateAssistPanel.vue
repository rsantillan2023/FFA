<template>
  <section class="create-assist" :class="{ 'create-assist--sidebar': sidebar }" :aria-label="`Asistente: ${flow.title}`">
    <header v-if="!sidebar" class="create-assist__head">
      <div class="create-assist__brand">
        <span class="create-assist__icon" aria-hidden="true">
          <i class="fas fa-wand-magic-sparkles"></i>
        </span>
        <div>
          <p class="create-assist__kicker">Asistente IA</p>
          <h3 class="create-assist__title">{{ flow.title }}</h3>
        </div>
      </div>
      <button v-if="showSteps" type="button" class="btn btn-ghost btn-sm" @click="collapsed = !collapsed">
        {{ collapsed ? "Mostrar guía" : "Ocultar" }}
      </button>
    </header>

    <div v-show="sidebar || !collapsed" class="create-assist__body">
      <header v-if="sidebar" class="create-assist__sidebar-head">
        <span class="create-assist__icon create-assist__icon--sm" aria-hidden="true">
          <i class="fas fa-wand-magic-sparkles"></i>
        </span>
        <div>
          <p class="create-assist__kicker">Asistente IA</p>
          <p class="create-assist__sidebar-title">{{ flow.title }}</p>
        </div>
      </header>

      <p class="create-assist__intro">{{ flow.intro }}</p>

      <ol v-if="showSteps" class="create-assist__steps">
        <li
          v-for="(step, index) in flow.steps"
          :key="step.id"
          class="create-assist__step"
          :class="{
            'create-assist__step--active': index === activeStep,
            'create-assist__step--done': index < activeStep,
          }"
        >
          <button type="button" class="create-assist__step-btn" @click="goToStep(index, step.field)">
            <span class="create-assist__step-num">{{ index + 1 }}</span>
            <span class="create-assist__step-text">
              <strong>{{ step.title }}</strong>
              <small>{{ step.hint }}</small>
            </span>
          </button>
        </li>
      </ol>

      <div v-else class="create-assist__hint-box">
        <p class="create-assist__hint-kicker">Paso {{ activeStep + 1 }} de {{ flow.steps.length }}</p>
        <p class="create-assist__hint-title">{{ currentStep?.title }}</p>
        <p class="create-assist__hint-text">{{ currentStep?.hint }}</p>
      </div>

      <div class="create-assist__ask">
        <label class="label" :for="inputId">Contame en una frase qué querés hacer</label>
        <div class="create-assist__ask-row">
          <input
            :id="inputId"
            v-model="phrase"
            class="input"
            type="text"
            :placeholder="flow.examples[0] ?? 'Describí lo que necesitás…'"
            @keydown.enter.prevent="interpret"
          />
          <button type="button" class="btn btn-primary btn-sm" @click="interpret">Ayudame</button>
        </div>
        <p v-if="interpretation" class="create-assist__answer">
          <i class="fas fa-lightbulb" aria-hidden="true"></i>
          {{ interpretation.message }}
        </p>
        <div class="create-assist__chips">
          <button
            v-for="ex in flow.examples"
            :key="ex"
            type="button"
            class="create-assist__chip"
            @click="useExample(ex)"
          >
            {{ ex }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, ref, useId } from "vue";
import { CREATE_ASSIST_KEY } from "../composables/createAssistContext";
import { useCreateAssist } from "../composables/useCreateAssist";
import type { CreateAssistFlowId } from "../constants/createAssist";

const props = withDefaults(
  defineProps<{
    flowId?: CreateAssistFlowId;
    context?: Record<string, unknown>;
    showSteps?: boolean;
    sidebar?: boolean;
  }>(),
  {
    showSteps: true,
    sidebar: false,
  },
);

const emit = defineEmits<{
  "focus-field": [field: string];
}>();

const inputId = useId();
const collapsed = ref(false);

const injected = inject(CREATE_ASSIST_KEY, null);

const localAssist = props.flowId
  ? useCreateAssist({
      flowId: props.flowId,
      context: computed(() => props.context ?? {}),
      onFocusField: (field) => emit("focus-field", field),
    })
  : null;

const assist = injected ?? localAssist;
if (!assist) throw new Error("CreateAssistPanel requires flowId or injected context");

const { flow, phrase, interpretation, activeStep, goToStep, interpret, useExample } = assist;

const currentStep = computed(() => flow.value.steps[activeStep.value]);
</script>

<style scoped>
.create-assist {
  border: 1px solid color-mix(in srgb, var(--brand) 28%, var(--line));
  border-radius: 12px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--brand) 8%, var(--panel)) 0%,
    var(--panel) 55%
  );
  overflow: hidden;
}

.create-assist--sidebar {
  border-radius: 10px;
  height: 100%;
}

.create-assist__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--line);
}

.create-assist__brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.create-assist__sidebar-head {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.65rem;
}

.create-assist__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 0.95rem;
}

.create-assist__icon--sm {
  width: 1.85rem;
  height: 1.85rem;
  font-size: 0.82rem;
}

.create-assist__kicker {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--brand);
}

.create-assist__title {
  margin: 0.1rem 0 0;
  font-size: 0.92rem;
  color: var(--brand-ink);
}

.create-assist__sidebar-title {
  margin: 0.08rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--brand-ink);
}

.create-assist__body {
  padding: 0.85rem 1rem 1rem;
}

.create-assist--sidebar .create-assist__body {
  padding: 0.85rem;
}

.create-assist__intro {
  margin: 0 0 0.85rem;
  font-size: 0.82rem;
  color: var(--ink-soft);
  line-height: 1.45;
}

.create-assist__hint-box {
  margin-bottom: 0.85rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--brand-line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-soft) 55%, var(--panel));
}

.create-assist__hint-kicker {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--brand);
}

.create-assist__hint-title {
  margin: 0.2rem 0 0;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--ink);
}

.create-assist__hint-text {
  margin: 0.25rem 0 0;
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--ink-soft);
}

.create-assist__steps {
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
}

.create-assist__step-btn {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.65rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.create-assist__step--active .create-assist__step-btn {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 10%, var(--panel));
}

.create-assist__step--done .create-assist__step-btn {
  opacity: 0.82;
}

.create-assist__step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: var(--panel-2);
  color: var(--ink-soft);
  font-size: 0.72rem;
  font-weight: 700;
}

.create-assist__step--active .create-assist__step-num {
  background: var(--brand);
  color: #fff;
}

.create-assist__step--done .create-assist__step-num {
  background: var(--ok);
  color: #fff;
}

.create-assist__step-text {
  display: grid;
  gap: 0.15rem;
}

.create-assist__step-text strong {
  font-size: 0.82rem;
  color: var(--ink);
}

.create-assist__step-text small {
  font-size: 0.72rem;
  color: var(--ink-soft);
  line-height: 1.35;
}

.create-assist__ask-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.35rem;
}

.create-assist__ask-row .input {
  flex: 1 1 160px;
}

.create-assist__answer {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0.65rem 0 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: 0.8rem;
  line-height: 1.4;
}

.create-assist__answer i {
  margin-top: 0.1rem;
  color: var(--brand);
}

.create-assist__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.55rem;
}

.create-assist__chip {
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--line-2);
  border-radius: 999px;
  background: var(--panel-2);
  color: var(--ink-soft);
  font-size: 0.68rem;
  cursor: pointer;
}

.create-assist__chip:hover {
  border-color: var(--brand-line);
  color: var(--brand-ink);
}
</style>
