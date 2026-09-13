<template>
  <nav class="step-progress" :aria-label="`Pasos: ${flow.title}`">
    <ol class="step-progress__track">
      <li
        v-for="(step, index) in flow.steps"
        :key="step.id"
        class="step-progress__item"
        :class="{
          'step-progress__item--done': index < activeStep,
          'step-progress__item--active': index === activeStep,
        }"
      >
        <button
          type="button"
          class="step-progress__btn"
          :aria-current="index === activeStep ? 'step' : undefined"
          @click="goToStep(index, step.field)"
        >
          <span class="step-progress__marker">
            <i v-if="index < activeStep" class="fas fa-check" aria-hidden="true"></i>
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span class="step-progress__label">{{ step.title }}</span>
        </button>
        <div
          v-if="index < flow.steps.length - 1"
          class="step-progress__connector"
          :class="{ 'step-progress__connector--done': index < activeStep }"
          aria-hidden="true"
        />
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { CREATE_ASSIST_KEY } from "../composables/createAssistContext";

const assist = inject(CREATE_ASSIST_KEY);
if (!assist) throw new Error("CreateStepProgress requires CreateAssistContext");

const { flow, activeStep, goToStep } = assist;
</script>

<style scoped>
.step-progress {
  padding: 0.85rem 1.15rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--brand-soft) 35%, var(--panel));
  overflow-x: auto;
}

.step-progress__track {
  display: flex;
  align-items: flex-start;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: min(100%, 720px);
}

.step-progress__item {
  display: flex;
  align-items: center;
  flex: 1 1 0;
  min-width: 7rem;
}

.step-progress__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  padding: 0.15rem 0.35rem;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: center;
}

.step-progress__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 999px;
  border: 2px solid var(--line-2);
  background: var(--panel);
  color: var(--ink-soft);
  font-size: 0.72rem;
  font-weight: 700;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.step-progress__item--active .step-progress__marker {
  border-color: var(--brand);
  background: var(--brand);
  color: #fff;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent);
}

.step-progress__item--done .step-progress__marker {
  border-color: var(--ok);
  background: var(--ok);
  color: #fff;
}

.step-progress__label {
  font-size: 0.68rem;
  line-height: 1.25;
  color: var(--ink-faint);
  max-width: 9rem;
}

.step-progress__item--active .step-progress__label {
  color: var(--brand-ink);
  font-weight: 600;
}

.step-progress__item--done .step-progress__label {
  color: var(--ink-soft);
}

.step-progress__connector {
  flex: 0 0 1.25rem;
  height: 2px;
  margin-top: 0.82rem;
  background: var(--line-2);
}

.step-progress__connector--done {
  background: var(--ok);
}

@media (max-width: 720px) {
  .step-progress__label {
    font-size: 0.62rem;
    max-width: 4.5rem;
  }

  .step-progress__connector {
    flex-basis: 0.65rem;
  }
}
</style>
