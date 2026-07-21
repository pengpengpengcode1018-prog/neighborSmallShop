import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { getCurrentAdmin, loginAdmin, type AdminProfile } from '../api/admin-auth';

const tokenKey = 'nearby-shop-admin-token';

export const useSessionStore = defineStore('session', () => {
  const token = ref(window.sessionStorage.getItem(tokenKey));
  const admin = ref<AdminProfile | null>(null);
  const isAuthenticated = computed(() => Boolean(token.value));

  function setToken(nextToken: string): void {
    token.value = nextToken;
    window.sessionStorage.setItem(tokenKey, nextToken);
  }

  function clear(): void {
    token.value = null;
    admin.value = null;
    window.sessionStorage.removeItem(tokenKey);
  }

  async function login(username: string, password: string): Promise<void> {
    const result = await loginAdmin(username, password);
    setToken(result.token);
    admin.value = result.admin;
  }

  async function restore(): Promise<void> {
    if (!token.value) return;
    try {
      admin.value = await getCurrentAdmin();
    } catch (error) {
      clear();
      throw error;
    }
  }

  return { token, admin, isAuthenticated, login, restore, clear };
});
