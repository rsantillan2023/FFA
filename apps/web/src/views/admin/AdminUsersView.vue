<template>
  <div>
    <PageHeader
      page-key="usuarios"
      :back-link="{ to: '/admin', label: '← Centro de configuración' }"
    >
      <template #actions>
        <button class="btn btn-ghost" type="button" @click="openUserAssist">Asistente IA</button>
        <button class="btn btn-primary" type="button" @click="showForm = true">Nuevo usuario</button>
      </template>
    </PageHeader>

    <CreateFormModal
      v-if="showForm"
      v-model="showForm"
      title="Nuevo usuario"
      subtitle="Cuenta interna con rol de acceso al sistema."
      assist-flow-id="nuevo-usuario"
      :assist-context="userAssistContext"
    >
      <div class="modal-form">
        <label class="label">Email</label>
        <input v-model="form.email" class="input" placeholder="usuario@empresa.cl" data-assist-field="email" />
        <label class="label">Nombre</label>
        <input v-model="form.nombre" class="input" placeholder="Nombre completo" data-assist-field="nombre" />
        <label class="label">Contraseña</label>
        <input
          v-model="form.password"
          class="input"
          type="password"
          placeholder="Mínimo 8 caracteres"
          data-assist-field="password"
        />
        <label class="label">Rol</label>
        <select v-model="form.rol" class="input" data-assist-field="rol">
          <option value="analista">Analista</option>
          <option value="referente">Referente</option>
          <option value="solo_lectura">Solo lectura</option>
          <option value="admin">Admin</option>
          <option value="product_owner">Product Owner</option>
        </select>
        <p v-if="msg" class="msg">{{ msg }}</p>
        <p v-if="err" class="error-msg">{{ err }}</p>
        <div class="modal-form__actions">
          <button class="btn btn-ghost" type="button" @click="closeForm">Cancelar</button>
          <button class="btn btn-primary" type="button" data-assist-field="submit" @click="crear">Crear usuario</button>
        </div>
      </div>
    </CreateFormModal>

    <div class="card">
      <table v-if="users.length">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Activo</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.nombre }}</td>
            <td>{{ u.email }}</td>
            <td>{{ u.rol }}</td>
            <td>{{ u.activo ? "Sí" : "No" }}</td>
            <td>
              <button
                v-if="u.activo"
                class="btn btn-ghost btn-sm"
                type="button"
                @click="desactivar(u.id)"
              >
                Desactivar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserDto } from "@ffa/shared";
import { computed, onMounted, reactive, ref } from "vue";
import { api } from "../../api/client";
import { apiErrorMessage } from "../../utils/apiError";
import CreateFormModal from "../../components/CreateFormModal.vue";
import PageHeader from "../../components/PageHeader.vue";
import { useCloseOnRouteLeave } from "../../composables/useCloseOnRouteLeave";
import { useCreateAssistListener } from "../../utils/useCreateAssistListener";

const users = ref<UserDto[]>([]);
const showForm = ref(false);
const form = reactive({
  email: "",
  nombre: "",
  password: "",
  rol: "analista",
});
const msg = ref("");
const err = ref("");

const userAssistContext = computed(() => ({
  email: form.email.trim(),
  nombre: form.nombre.trim(),
  rol: form.rol,
  password: form.password.trim(),
  submit: Boolean(form.email.trim() && form.nombre.trim() && form.password.trim()),
}));

function openUserAssist(): void {
  showForm.value = true;
}

function closeForm(): void {
  showForm.value = false;
  msg.value = "";
  err.value = "";
}

useCreateAssistListener("nuevo-usuario", () => {
  showForm.value = true;
});

useCloseOnRouteLeave(showForm);

async function load(): Promise<void> {
  err.value = "";
  try {
    users.value = await api.listUsers();
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudieron cargar los usuarios");
  }
}

async function crear(): Promise<void> {
  err.value = "";
  msg.value = "";
  try {
    await api.createUser({ ...form });
    msg.value = "Usuario creado";
    form.email = "";
    form.nombre = "";
    form.password = "";
    await load();
    window.setTimeout(() => {
      showForm.value = false;
      msg.value = "";
    }, 1200);
  } catch (e) {
    err.value = e instanceof Error ? e.message : "Error";
  }
}

async function desactivar(id: string): Promise<void> {
  err.value = "";
  msg.value = "";
  try {
    await api.patchUser(id, { activo: false });
    msg.value = "Usuario desactivado";
    await load();
  } catch (e) {
    err.value = apiErrorMessage(e, "No se pudo desactivar el usuario");
  }
}

onMounted(load);
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

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid var(--line);
}

.msg {
  color: var(--ok, var(--brand));
  font-size: 0.875rem;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}
</style>
