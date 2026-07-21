import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CartView } from '../src/types/domain';
import { ApiRequestError } from '../src/utils/request';

const api = vi.hoisted(() => ({
  getCart: vi.fn(),
  addCartItem: vi.fn(),
  updateCartItem: vi.fn(),
  removeCartItem: vi.fn(),
  clearCart: vi.fn(),
}));

vi.mock('../src/api/cart', () => api);

import { useCartStore } from '../src/stores/cart';

function cart(quantity = 1): CartView {
  return {
    cartId: 'cart-current',
    store: {
      id: 'store-current',
      name: '阳光生鲜',
      status: 'OPEN',
      isDeliverable: true,
      canOrder: true,
    },
    items: [
      {
        id: 'item-current',
        productId: 'product-current',
        name: '鲜牛奶',
        imageUrl: null,
        unitPrice: '8.50',
        quantity,
        lineTotal: (8.5 * quantity).toFixed(2),
        stock: 10,
        purchaseLimit: 3,
        available: true,
        unavailableReason: null,
      },
    ],
    summary: {
      itemCount: quantity,
      merchandiseTotal: (8.5 * quantity).toFixed(2),
      deliveryFee: '3.00',
      payableTotal: (8.5 * quantity + 3).toFixed(2),
      minimumOrderAmount: '20.00',
      amountToMinimum: Math.max(20 - 8.5 * quantity, 0).toFixed(2),
      meetsMinimumOrder: quantity >= 3,
      canCheckout: quantity >= 3,
      blockedReason: quantity >= 3 ? null : 'MINIMUM_ORDER_NOT_REACHED',
    },
  };
}

describe('miniapp server-backed cart store', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset();
    setActivePinia(createPinia());
  });

  it('loads the authenticated cart as the only local source of truth', async () => {
    api.getCart.mockResolvedValueOnce(cart(2));
    const store = useCartStore();
    await store.load('service-token');
    expect(api.getCart).toHaveBeenCalledWith('service-token');
    expect(store.itemCount).toBe(2);
    expect(store.loadError).toBeNull();
  });

  it('applies only a server-confirmed add result', async () => {
    api.addCartItem.mockResolvedValueOnce(cart(2));
    const store = useCartStore();
    await store.addProduct('service-token', 'product-current');
    expect(api.addCartItem).toHaveBeenCalledWith('service-token', 'product-current', 1, false);
    expect(store.cart).toEqual(cart(2));
  });

  it('preserves the current cart when cross-store confirmation is required', async () => {
    api.getCart.mockResolvedValueOnce(cart(1));
    api.addCartItem.mockRejectedValueOnce(
      new ApiRequestError('CART_STORE_CONFLICT', '已有其他店铺商品'),
    );
    const store = useCartStore();
    await store.load('service-token');
    await expect(store.addProduct('service-token', 'other-product')).rejects.toMatchObject({
      code: 'CART_STORE_CONFLICT',
    });
    expect(store.cart).toEqual(cart(1));
  });

  it('updates, removes and clears from their confirmed responses', async () => {
    api.updateCartItem.mockResolvedValueOnce(cart(3));
    api.removeCartItem.mockResolvedValueOnce(cart(1));
    api.clearCart.mockResolvedValueOnce({
      ...cart(1),
      cartId: null,
      store: null,
      items: [],
      summary: { ...cart(1).summary, itemCount: 0, blockedReason: 'CART_EMPTY' },
    });
    const store = useCartStore();
    await store.updateQuantity('service-token', 'item-current', 3);
    expect(store.itemCount).toBe(3);
    await store.removeItem('service-token', 'item-current');
    expect(store.itemCount).toBe(1);
    await store.clear('service-token');
    expect(store.cart.items).toEqual([]);
  });

  it('keeps confirmed state through a network failure and resets it on logout', async () => {
    api.getCart.mockResolvedValueOnce(cart(2));
    api.updateCartItem.mockRejectedValueOnce(
      new ApiRequestError('NETWORK_ERROR', '网络连接失败，请稍后重试'),
    );
    const store = useCartStore();
    await store.load('service-token');
    await expect(store.updateQuantity('service-token', 'item-current', 3)).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(store.itemCount).toBe(2);
    expect(store.mutationError).toBe('网络连接失败，请稍后重试');
    store.reset();
    expect(store.itemCount).toBe(0);
    expect(store.cart.cartId).toBeNull();
  });
});
