<template>
  <nav class="revision-steps" aria-label="Pasos de revisión">
    <ol class="revision-steps__track">
      <li
        v-for="(step, index) in steps"
        :key="step.id"
        class="revision-steps__item"
        :class="{
          'revision-steps__item--done': step.done && index !== activeStep,
          'revision-steps__item--active': index === activeStep,
        }"
      >
        <button
          type="button"
          class="revision-steps__btn"
          :aria-current="index === activeStep ? 'step' : undefined"
          @click="emit('go', index)"
        >
          <span class="revision-steps__marker">
            <span v-if="step.done && index !== activeStep" aria-hidden="true">✓</span>
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span class="revision-steps__text">
            <span class="revision-steps__label">{{ step.title }}</span>
            <span v-if="step.hint" class="revision-steps__hint">{{ step.hint }}</span>
          </span>
        </button>
        <div
          v-if="index < steps.length - 1"
          class="revision-steps__connector"
          :class="{ 'revision-steps__connector--done': step.done }"
          aria-hidden="true"
        />
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
export type RevisionStepItem = {
  id: string;
  title: string;
  done?: boolean;
  hint?: string;
};

defineProps<{
  steps: RevisionStepItem[];
  activeStep: number;
}>();

const emit = defineEmits<{
  go: [index: number];
}>();
</script>

<style scoped>
.revision-steps {
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--brand-soft) 30%, var(--panel));
  overflow-x: auto;
}

.revision-steps__track {
  display: flex;
  align-items: flex-start;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: min(100%, 680px);
}

.revision-steps__item {
  display: flex;
  align-items: center;
  flex: 1 1 0;
  min-width: 6.5rem;
}

.revision-steps__btn {
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

.revision-steps__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  border: 2px solid var(--line-2);
  background: var(--panel);
  color: var(--ink-soft);
  font-size: 0.75rem;
  font-weight: 700;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.revision-steps__item--active .revision-steps__marker {
  border-color: var(--brand);
  background: var(--brand);
  color: #fff;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent);
}

.revision-steps__item--done .revision-steps__marker {
  border-color: var(--ok);
  background: var(--ok);
  color: #fff;
}

.revision-steps__text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.revision-steps__label {
  font-size: 0.72rem;
  line-height: 1.25;
  color: var(--ink-faint);
  max-width: 8.5rem;
}

.revision-steps__item--active .revision-steps__label {
  color: var(--brand-ink);
  font-weight: 600;
}

.revision-steps__item--done .revision-steps__label {
  color: var(--ink-soft);
}

.revision-steps__hint {
  font-size: 0.62rem;
  color: var(--warn);
  font-weight: 600;
}

.revision-steps__item--done .revision-steps__hint {
  color: var(--ok);
}

.revision-steps__connector {
  flex: 0 0 1rem;
  height: 2px;
  margin-top: 0.88rem;
  background: var(--line-2);
}

.revision-steps__connector--done {
  background: var(--ok);
}

@media (max-width: 720px) {
  .revision-steps__label {
    font-size: 0.62rem;
    max-width: 4.25rem;
  }

  .revision-steps__connector {
    flex-basis: 0.5rem;
  }
}
</style>
