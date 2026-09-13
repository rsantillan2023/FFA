<template>
  <div>
    <PageHeader :title="title" :subtitle="subtitle" />
  </div>
</template>

<script setup lang="ts">
import PageHeader from "../components/PageHeader.vue";

defineProps<{ title: string; subtitle: string }>();
</script>

<style scoped>
</style>
