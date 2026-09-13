<template>
  <div>
    <PageHeader page-key="contribuyentes">
      <template #actions>
        <button class="btn btn-ghost" type="button" @click="openFormAssist">Asistente IA</button>
        <button class="btn btn-primary" type="button" @click="showForm = true">Nuevo contribuyente</button>
      </template>
    </PageHeader>

    <CreateFormModal
      v-if="showForm"
      v-model="showForm"
      title="Nuevo contribuyente"
      subtitle="Alta en el directorio maestro. Los datos se usan para vincular fichas e informes."
      assist-flow-id="nuevo-contribuyente"
      :assist-context="contribAssistContext"
    >
      <form class="modal-form" @submit.prevent="onCreate">
        <label class="label">RUT</label>
        <input v-model="form.rut" class="input" placeholder="76123456-7" data-assist-field="rut" />
        <label class="label">Razón social</label>
        <input v-model="form.razonSocial" class="input" required data-assist-field="razonSocial" />
        <label class="label">Denominaciones alternativas (coma)</label>
        <input
          v-model="form.alt"
          class="input"
          placeholder="Nombre comercial, sigla"
          data-assist-field="alt"
        />
        <p v-if="error" class="error-msg">{{ error }}</p>
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" @click="showForm = false">Cancelar</button>
          <button class="btn btn-primary" type="submit" data-assist-field="submit">Guardar</button>
        </div>
      </form>
    </CreateFormModal>

    <div class="card">
      <input
        v-model="search"
        class="input search"
        placeholder="Buscar por RUT o razón social…"
        @input="debouncedSearch"
      />

      <table v-if="items.length">
        <thead>
          <tr>
            <th>RUT</th>
            <th>Razón social</th>
            <th>Alternativas</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in items" :key="c.id">
            <td>{{ c.rut ?? "—" }}</td>
            <td>{{ c.razonSocial }}</td>
            <td>{{ c.denominacionesAlternativas.join(", ") || "—" }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loading" class="empty">Sin resultados</p>
      <p v-if="loading">Cargando…</p>
      <p class="total">{{ total }} contribuyente(s)</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ContribuyenteDto } from "@ffa/shared";
import { computed, onMounted, ref } from "vue";
import { api } from "../api/client";
import CreateFormModal from "../components/CreateFormModal.vue";
import PageHeader from "../components/PageHeader.vue";
import { useCloseOnRouteLeave } from "../composables/useCloseOnRouteLeave";
import { useCreateAssistListener } from "../utils/useCreateAssistListener";

const items = ref<ContribuyenteDto[]>([]);
const total = ref(0);
const loading = ref(false);
const search = ref("");
const showForm = ref(false);
const error = ref<string | null>(null);
const form = ref({ rut: "", razonSocial: "", alt: "" });

const contribAssistContext = computed(() => ({
  rut: form.value.rut.trim(),
  razonSocial: form.value.razonSocial.trim(),
  alt: form.value.alt.trim(),
  submit: Boolean(form.value.razonSocial.trim()),
}));

function openFormAssist(): void {
  showForm.value = true;
}

useCreateAssistListener("nuevo-contribuyente", () => {
  showForm.value = true;
});

useCloseOnRouteLeave(showForm);

let debounceTimer: ReturnType<typeof setTimeout>;

async function load(q?: string): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const res = await api.listContribuyentes(q);
    items.value = res.items;
    total.value = res.total;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error";
  } finally {
    loading.value = false;
  }
}

function debouncedSearch(): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => load(search.value || undefined), 300);
}

async function onCreate(): Promise<void> {
  error.value = null;
  try {
    await api.createContribuyente({
      rut: form.value.rut || undefined,
      razonSocial: form.value.razonSocial,
      denominacionesAlternativas: form.value.alt
        ? form.value.alt.split(",").map((s) => s.trim())
        : [],
    });
    form.value = { rut: "", razonSocial: "", alt: "" };
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Error";
  }
}

onMounted(() => load());
</script>

<style scoped>
.modal-form {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.modal-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
}

.search {
  margin-bottom: 1rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th,
td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid var(--line);
}

th {
  color: var(--ink-soft);
  font-weight: 600;
}

.empty,
.total {
  color: var(--ink-soft);
  font-size: 0.875rem;
}
</style>
