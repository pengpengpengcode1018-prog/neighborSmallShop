import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { addCartItem, clearCart, getCart, removeCartItem, updateCartItem } from '../api/cart';
import type { CartView } from '../types/domain';
import { ApiRequestError } from '../utils/request';

export function emptyCart(): CartView {
  return {
    cartId: null,
    store: null,
    items: [],
    summary: {
      itemCount: 0,
      merchandiseTotal: '0.00',
      deliveryFee: '0.00',
      payableTotal: '0.00',
      minimumOrderAmount: '0.00',
      amountToMinimum: '0.00',
      meetsMinimumOrder: false,
      canCheckout: false,
      blockedReason: 'CART_EMPTY',
    },
  };
}

function cartErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const messages: Record<string, string> = {
      COMMUNITY_REQUIRED: '请先选择配送小区',
      STORE_PAUSED: '店铺当前暂停接单',
      STORE_NOT_DELIVERABLE: '店铺暂不配送到当前小区',
      PRODUCT_NOT_FOUND: '商品不存在',
      PRODUCT_OFF_SHELF: '商品已下架',
      PRODUCT_STOCK_NOT_ENOUGH: '商品库存不足',
      PRODUCT_PURCHASE_LIMIT_EXCEEDED: '购买数量超过限购数量',
      CART_ITEM_NOT_FOUND: '购物车商品已不存在，请刷新',
    };
    return messages[error.code] ?? error.message;
  }
  return '购物车操作失败，请稍后重试';
}

export const useCartStore = defineStore('cart', () => {
  const cart = ref<CartView>(emptyCart());
  const isLoading = ref(false);
  const mutationCount = ref(0);
  const loadError = ref<string | null>(null);
  const mutationError = ref<string | null>(null);
  const isMutating = computed(() => mutationCount.value > 0);
  const itemCount = computed(() => cart.value.summary.itemCount);

  function reset(): void {
    cart.value = emptyCart();
    loadError.value = null;
    mutationError.value = null;
    mutationCount.value = 0;
  }

  async function load(token: string): Promise<void> {
    if (isLoading.value) return;
    isLoading.value = true;
    loadError.value = null;
    try {
      cart.value = await getCart(token);
    } catch (error) {
      loadError.value = cartErrorMessage(error);
    } finally {
      isLoading.value = false;
    }
  }

  async function mutate(operation: () => Promise<CartView>): Promise<CartView> {
    mutationCount.value += 1;
    mutationError.value = null;
    try {
      const confirmed = await operation();
      cart.value = confirmed;
      return confirmed;
    } catch (error) {
      mutationError.value = cartErrorMessage(error);
      throw error;
    } finally {
      mutationCount.value -= 1;
    }
  }

  function addProduct(
    token: string,
    productId: string,
    quantity = 1,
    replaceExistingCart = false,
  ): Promise<CartView> {
    return mutate(() => addCartItem(token, productId, quantity, replaceExistingCart));
  }

  function updateQuantity(token: string, itemId: string, quantity: number): Promise<CartView> {
    return mutate(() => updateCartItem(token, itemId, quantity));
  }

  function removeItem(token: string, itemId: string): Promise<CartView> {
    return mutate(() => removeCartItem(token, itemId));
  }

  function clear(token: string): Promise<CartView> {
    return mutate(() => clearCart(token));
  }

  return {
    cart,
    itemCount,
    isLoading,
    isMutating,
    loadError,
    mutationError,
    load,
    addProduct,
    updateQuantity,
    removeItem,
    clear,
    reset,
  };
});
