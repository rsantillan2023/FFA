<template>
  <div class="login-page">
    <div class="login-page__bg" aria-hidden="true">
      <img :src="bgImage" alt="" class="login-page__bg-img" />
    </div>
    <div class="login-page__veil" aria-hidden="true" />

    <div class="login-page__stack">
      <form class="login-card" @submit.prevent="onSubmit">
        <div class="login-card__brand">
          <img
            :src="SYSTEM_LOGO"
            :alt="`${SYSTEM_NAME} — ${SYSTEM_TAGLINE}`"
            class="login-card__logo system-logo"
          />
        </div>

        <h1 class="login-card__hello">Acceso al sistema</h1>
        <p class="login-card__hint">Ingresá con tu cuenta interna de ECR Salud para gestionar fichas financieras</p>

        <label class="login-field">
          <span class="login-field__label">Email</span>
          <span class="login-field__control">
            <i class="fas fa-envelope login-field__icon" aria-hidden="true"></i>
            <input
              v-model="email"
              class="login-field__input"
              type="email"
              required
              autocomplete="username"
              placeholder="usuario@ecr-salud.local"
            />
          </span>
        </label>

        <label class="login-field">
          <span class="login-field__label">Contraseña</span>
          <span class="login-field__control">
            <i class="fas fa-lock login-field__icon" aria-hidden="true"></i>
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="login-field__input login-field__input--pwd"
              required
              autocomplete="current-password"
              placeholder="Contraseña"
            />
            <button
              type="button"
              class="login-field__eye"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'" aria-hidden="true"></i>
            </button>
          </span>
        </label>

        <p v-if="auth.error" class="login-card__error" role="alert">{{ auth.error }}</p>

        <button class="login-card__submit" type="submit" :disabled="auth.loading">
          {{ auth.loading ? "Ingresando…" : "Ingresar" }}
        </button>

        <div class="login-card__creds">
          <p><strong>Admin:</strong> admin@ecr-salud.local / Admin123!</p>
          <p><strong>Analista:</strong> analista@ecr-salud.local / Analista123!</p>
        </div>

        <div class="login-card__presets">
          <button type="button" class="login-card__preset" @click="fillAdmin">Usar admin</button>
          <button type="button" class="login-card__preset" @click="fillAnalista">Usar analista</button>
        </div>
      </form>

      <div class="login-page__theme">
        <ThemeToggle />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import ThemeToggle from "../components/ThemeToggle.vue";
import { SYSTEM_LOGO, SYSTEM_NAME, SYSTEM_TAGLINE } from "../constants/brand";
import { useAuthStore } from "../stores/auth";

const LOGIN_BGS = [
  `${import.meta.env.BASE_URL}branding/login/F1.png`,
  `${import.meta.env.BASE_URL}branding/login/F2.png`,
];

const auth = useAuthStore();
const bgImage = ref(LOGIN_BGS[Math.random() < 0.5 ? 0 : 1]);
const router = useRouter();
const route = useRoute();

const email = ref("admin@ecr-salud.local");
const password = ref("Admin123!");
const showPassword = ref(false);

function fillAdmin(): void {
  email.value = "admin@ecr-salud.local";
  password.value = "Admin123!";
}

function fillAnalista(): void {
  email.value = "analista@ecr-salud.local";
  password.value = "Analista123!";
}

async function onSubmit(): Promise<void> {
  const ok = await auth.login(email.value, password.value);
  if (ok) {
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    await router.push(redirect);
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
  overflow: hidden;
  color: var(--ink);
}

.login-page__bg {
  position: absolute;
  inset: 0;
  background-color: #1a1528;
  overflow: hidden;
}

.login-page__bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
  transform: scale(1.02);
}

.login-page__veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, #0b0914 48%, transparent) 0%,
      color-mix(in srgb, #0b0914 18%, transparent) 46%,
      color-mix(in srgb, #0b0914 6%, transparent) 100%
    ),
    color-mix(in srgb, #000 12%, transparent);
  pointer-events: none;
}

.login-page__stack {
  position: relative;
  z-index: 1;
  width: min(100%, 26rem);
  display: grid;
  gap: 1rem;
  margin-right: auto;
}

.login-card {
  background: #fff;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 1.25rem;
  padding: 1.85rem 1.7rem 1.5rem;
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.28);
  display: grid;
  gap: 0.85rem;
  color: #1a1624;
}

[data-theme="dark"] .login-card {
  background: color-mix(in srgb, var(--panel) 96%, transparent);
  border-color: var(--line);
  color: var(--ink);
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.45);
}

.login-card__brand {
  text-align: center;
  display: grid;
  gap: 0.25rem;
  justify-items: center;
  margin-bottom: 0.15rem;
}

.login-card__logo {
  width: min(100%, 22rem);
  height: auto;
  max-height: 4.75rem;
  object-fit: contain;
}

.login-card__tag {
  margin: 0;
  font-size: 0.8rem;
  color: #8a849e;
}

[data-theme="dark"] .login-card__tag {
  color: var(--ink-faint);
}

.login-card__hello {
  margin: 0.35rem 0 0;
  font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #1a1624;
  line-height: 1.15;
}

[data-theme="dark"] .login-card__hello {
  color: var(--ink);
}

.login-card__hint {
  margin: -0.35rem 0 0.15rem;
  font-size: 0.78rem;
  color: #5a5470;
}

[data-theme="dark"] .login-card__hint {
  color: var(--ink-soft);
}

.login-field {
  display: grid;
  gap: 0.35rem;
}

.login-field__label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #5a5470;
}

[data-theme="dark"] .login-field__label {
  color: var(--ink-soft);
}

.login-field__control {
  position: relative;
  display: block;
}

.login-field__icon {
  position: absolute;
  left: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  color: #9a94b0;
  font-size: 0.85rem;
  pointer-events: none;
}

.login-field__input {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  padding: 0.8rem 0.9rem 0.8rem 2.45rem;
  background: #eceaf6;
  color: #1a1624;
  font-size: 0.95rem;
  outline: none;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

[data-theme="dark"] .login-field__input {
  background: var(--panel-2);
  color: var(--ink);
}

.login-field__input--pwd {
  padding-right: 2.6rem;
}

.login-field__input::placeholder {
  color: #9a94b0;
}

.login-field__input:focus {
  background: #fff;
  border-color: color-mix(in srgb, var(--brand) 55%, #c8c0f0);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent);
}

[data-theme="dark"] .login-field__input:focus {
  background: var(--panel);
  border-color: var(--brand-line);
}

.login-field__eye {
  position: absolute;
  right: 0.45rem;
  top: 50%;
  transform: translateY(-50%);
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: #9a94b0;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.login-card__error {
  margin: 0;
  font-size: 0.85rem;
  color: var(--bad);
}

.login-card__submit {
  width: 100%;
  margin-top: 0.15rem;
  border: 0;
  border-radius: 0.75rem;
  padding: 0.85rem 1rem;
  background: var(--brand);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--brand) 40%, transparent);
  transition: filter 0.15s, transform 0.15s;
}

.login-card__submit:hover:not(:disabled) {
  filter: brightness(1.06);
}

.login-card__submit:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.login-card__creds {
  display: grid;
  gap: 0.2rem;
  font-size: 0.72rem;
  color: #8a849e;
  line-height: 1.35;
}

.login-card__creds strong {
  color: #5a5470;
  font-weight: 650;
}

.login-card__presets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.login-card__preset {
  border: 1px solid #d4cfe0;
  background: #fff;
  color: #5a5470;
  border-radius: 0.75rem;
  padding: 0.55rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

[data-theme="dark"] .login-card__preset {
  border-color: var(--line-2);
  background: var(--panel);
  color: var(--ink-soft);
}

[data-theme="dark"] .login-card__creds {
  color: var(--ink-faint);
}

[data-theme="dark"] .login-card__creds strong {
  color: var(--ink-soft);
}

.login-card__preset:hover {
  border-color: var(--brand-line);
  color: var(--brand-ink);
  background: var(--brand-soft);
}

.login-page__theme {
  display: flex;
  justify-content: flex-start;
  padding-left: 0.25rem;
}

@media (max-width: 720px) {
  .login-page {
    justify-content: center;
    padding: 1.25rem;
  }

  .login-page__stack {
    margin-right: 0;
  }

  .login-page__theme {
    justify-content: center;
  }
}

@media (max-width: 420px) {
  .login-card {
    padding: 1.35rem 1.15rem 1.2rem;
  }

  .login-card__hello {
    font-size: 1.45rem;
  }
}
</style>
