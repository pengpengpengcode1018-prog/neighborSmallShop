import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

const tokenKey = 'nearby-shop-admin-token';

export const useSessionStore = defineStore('session', () => {
  const token = ref(window.sessionStorage.getItem(tokenKey));
  const isAuthenticated = computed(() => Boolean(token.value));

  function setToken(nextToken: string): void {
    token.value = nextToken;
    window.sessionStorage.setItem(tokenKey, nextToken);
  }

  function clear(): void {
    token.value = null;
    window.sessionStorage.removeItem(tokenKey);
  }

  return { token, isAuthenticated, setToken, clear };
});
