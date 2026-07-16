import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useOrderStore = defineStore('order', () => {
  const activeOrderId = ref<string | null>(null);

  function setActiveOrder(orderId: string): void {
    activeOrderId.value = orderId;
  }

  return { activeOrderId, setActiveOrder };
});
