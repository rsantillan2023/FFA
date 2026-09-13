<template>
  <div>
    <PageHeader page-key="admin" />

    <div class="grid">
      <RouterLink to="/admin/plan-cuentas" class="card link-card">
        <h3>Plan contable institucional</h3>
        <p>Versiones del plan, rubros, importación CSV y aprobación formal.</p>
      </RouterLink>
      <RouterLink to="/admin/usuarios" class="card link-card">
        <h3>Usuarios y permisos</h3>
        <p>Crear cuentas internas y asignar roles de acceso.</p>
      </RouterLink>
      <RouterLink to="/admin/operacion" class="card link-card">
        <h3>Mantenimiento técnico</h3>
        <p>Colas de procesamiento, reprocesar casos y diagnóstico.</p>
      </RouterLink>
      <RouterLink to="/admin/ia-uso" class="card link-card">
        <h3>Uso y costos IA</h3>
        <p>Quién llamó a qué modelo, tokens consumidos y coste estimado por función.</p>
      </RouterLink>
      <article class="card">
        <h3>Umbral de confianza</h3>
        <p class="card-lead">
          Por debajo de este valor, la ficha suele requerir revisión humana antes de aprobarse.
        </p>
        <p>Actual: <strong>{{ config?.umbralConfianza ?? "—" }}%</strong></p>
        <p>
          Proveedor de lectura (OCR / IA):
          <strong>{{ extractionProviderLabel(config?.extractionProvider) }}</strong>
        </p>
        <p v-if="showAnthropicFallbackNote(config?.extractionProvider)" class="provider-note">
          {{ EXTRACTION_FALLBACK_NOTE }}
        </p>
        <div class="row">
          <input v-model.number="umbral" class="input" type="number" min="0" max="100" />
          <button class="btn btn-primary" type="button" @click="saveUmbral">Guardar</button>
        </div>
        <p v-if="msg" class="msg">{{ msg }}</p>
        <p v-if="err" class="msg err">{{ err }}</p>
        <ul v-if="historial.length" class="historial">
          <li v-for="(h, i) in historial" :key="i">
            {{ h.umbralConfianza }}% — {{ formatDate(h.at) }}
          </li>
        </ul>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConfiguracionSistemaDto, UmbralHistorialDto } from "@ffa/shared";
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../../api/client";
import { apiErrorMessage } from "../../utils/apiError";
import PageHeader from "../../components/PageHeader.vue";
import {
  EXTRACTION_FALLBACK_NOTE,
  extractionProviderLabel,
  showAnthropicFallbackNote,
} from "../../constants/extractionProviders";

const config = ref<ConfiguracionSistemaDto | null>(null);
const umbral = ref(85);
const msg = ref("");
const err = ref("");
const historial = ref<UmbralHistorialDto[]>([]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL");
}

onMounted(async () => {
  err.value = "";
  try {
    config.value = await api.getConfig();
    umbral.value = config.value.umbralConfianza;
    historial.value = await api.getUmbralHistorial().catch(() => []);
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo cargar la configuración");
  }
});

async function saveUmbral(): Promise<void> {
  err.value = "";
  msg.value = "";
  try {
    config.value = await api.patchConfig({ umbralConfianza: umbral.value });
    msg.value = "Umbral actualizado";
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo guardar el umbral");
  }
}
</script>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}

.link-card {
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
}

.link-card:hover {
  box-shadow: 0 4px 12px rgb(15 23 42 / 10%);
}

h3 {
  margin: 0 0 0.5rem;
  color: var(--brand-ink);
}

.card p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.9rem;
}

.card-lead {
  margin-bottom: 0.5rem !important;
}

.provider-note {
  margin-top: 0.5rem !important;
  padding: 0.5rem 0.65rem;
  background: rgb(37 99 235 / 6%);
  border-left: 3px solid var(--brand-primary, #2563eb);
  border-radius: 0 4px 4px 0;
  font-size: 0.85rem !important;
  line-height: 1.45;
}

.row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.msg {
  color: var(--ok);
  font-size: 0.875rem;
  margin-top: 0.5rem;
}

.msg.err {
  color: var(--danger, #dc2626);
}

.historial {
  margin: 0.75rem 0 0;
  padding-left: 1.25rem;
  font-size: 0.8rem;
  color: var(--ink-soft);
}
</style>
