import type { CartView } from '../types/domain';
import { request } from '../utils/request';

function authorization(token: string) {
  return { authorization: `Bearer ${token}` };
}

export function getCart(token: string): Promise<CartView> {
  return request<CartView>('/cart', { header: authorization(token) });
}

export function addCartItem(
  token: string,
  productId: string,
  quantity = 1,
  replaceExistingCart = false,
): Promise<CartView> {
  return request<CartView>('/cart/items', {
    method: 'POST',
    header: authorization(token),
    data: { productId, quantity, replaceExistingCart },
  });
}

export function updateCartItem(token: string, itemId: string, quantity: number): Promise<CartView> {
  return request<CartView>(`/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    header: authorization(token),
    data: { quantity },
  });
}

export function removeCartItem(token: string, itemId: string): Promise<CartView> {
  return request<CartView>(`/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    header: authorization(token),
  });
}

export function clearCart(token: string): Promise<CartView> {
  return request<CartView>('/cart', {
    method: 'DELETE',
    header: authorization(token),
  });
}
