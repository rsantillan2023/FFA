import type { AuthUser } from "@ffa/shared";
import { defineStore } from "pinia";
import { ref } from "vue";
import { api, clearToken, getToken, setToken } from "../api/client";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function login(email: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const result = await api.login(email, password);
      setToken(result.token);
      user.value = result.user;
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Error de login";
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function restoreSession(): Promise<void> {
    if (!getToken()) return;
    try {
      user.value = await api.me();
    } catch {
      clearToken();
      user.value = null;
    }
  }

  function logout(): void {
    clearToken();
    user.value = null;
  }

  return { user, loading, error, login, restoreSession, logout };
});
