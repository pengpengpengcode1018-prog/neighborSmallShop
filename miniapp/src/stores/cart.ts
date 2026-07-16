import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { CartLine } from '../types/domain';

export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>([]);
  const storeId = computed(() => lines.value[0]?.storeId ?? null);
  const itemCount = computed(() => lines.value.reduce((total, line) => total + line.quantity, 0));

  function clear(): void {
    lines.value = [];
  }

  return { lines, storeId, itemCount, clear };
});
