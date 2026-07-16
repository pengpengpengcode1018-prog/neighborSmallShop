import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useUserStore = defineStore('user', () => {
  const accessToken = ref<string | null>(null);
  const isAuthenticated = computed(() => accessToken.value !== null);

  function setAccessToken(token: string): void {
    accessToken.value = token;
  }

  function clearSession(): void {
    accessToken.value = null;
  }

  return { accessToken, isAuthenticated, setAccessToken, clearSession };
});
