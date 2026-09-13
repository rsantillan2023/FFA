<template>
  <div class="page-header-wrap">
    <header class="page-header">
      <div class="page-header__main">
        <RouterLink v-if="backLink" :to="backLink.to" class="back">{{ backLink.label }}</RouterLink>

        <div class="page-header__title-row">
          <h1>{{ displayTitle }}</h1>
          <button
            v-if="help"
            type="button"
            class="page-info-btn"
            :aria-label="`Información sobre ${displayTitle}`"
            title="¿Para qué sirve esta pantalla?"
            @click="showInfo = true"
          >
            <i class="fas fa-info-circle" aria-hidden="true"></i>
          </button>
        </div>

        <p v-if="displaySubtitle" class="subtitle">{{ displaySubtitle }}</p>
        <div v-if="$slots.extra" class="page-header__extra">
          <slot name="extra" />
        </div>
      </div>

      <div v-if="$slots.actions" class="header-actions">
        <slot name="actions" />
      </div>
    </header>

    <InfoModal
      v-if="help && showInfo"
      v-model="showInfo"
      :title="help.title"
      :summary="help.summary"
      :when-to-use="help.whenToUse"
      :bullets="help.bullets"
      :sections="help.sections"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { getPageInfo, type PageHelpInfo } from "../constants/pageInfo";
import InfoModal from "./InfoModal.vue";

const props = defineProps<{
  pageKey?: string;
  title?: string;
  subtitle?: string;
  help?: PageHelpInfo;
  backLink?: { to: string; label: string };
}>();

const route = useRoute();
const showInfo = ref(false);

watch(
  () => route.path,
  () => {
    showInfo.value = false;
  },
);

const meta = computed(() => (props.pageKey ? getPageInfo(props.pageKey) : undefined));

const displayTitle = computed(() => props.title ?? meta.value?.title ?? "");

const displaySubtitle = computed(() => props.subtitle ?? meta.value?.subtitle ?? "");

const help = computed(() => props.help ?? meta.value?.help);
</script>

<style scoped>
.page-header-wrap {
  margin-bottom: 1rem;
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}

.page-header__main {
  min-width: 0;
}

.page-header__title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.page-info-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.65rem;
  height: 1.65rem;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--line-2);
  border-radius: 999px;
  background: var(--panel);
  color: var(--brand);
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.page-info-btn:hover {
  background: var(--brand-soft);
  border-color: var(--brand-line);
  color: var(--brand-ink);
}

.page-info-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.page-header__extra :deep(p) {
  margin: 0.15rem 0 0;
  color: var(--ink-faint);
  font-size: 0.75rem;
  line-height: 1.4;
}
</style>
