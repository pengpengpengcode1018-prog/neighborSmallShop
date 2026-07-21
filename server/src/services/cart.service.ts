import { Prisma } from '../generated/prisma/client.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  cartRepository,
  CartQuantityConflictError,
  CartStoreConflictError,
  type CartProductRecord,
  type CartRecord,
} from '../repositories/cart.repository.js';
import type { PublicUser } from '../types/api.js';

type ItemUnavailableReason =
  'PRODUCT_OFF_SHELF' | 'PRODUCT_STOCK_NOT_ENOUGH' | 'PRODUCT_PURCHASE_LIMIT_EXCEEDED';

function communityRequired(): HttpError {
  return new HttpError(409, ERROR_CODES.COMMUNITY_REQUIRED, '请先选择当前小区');
}

function itemNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.CART_ITEM_NOT_FOUND, '购物车商品不存在');
}

function quantityError(reason: 'stock' | 'purchaseLimit'): HttpError {
  return reason === 'purchaseLimit'
    ? new HttpError(409, ERROR_CODES.PRODUCT_PURCHASE_LIMIT_EXCEEDED, '购买数量超过限购数量')
    : new HttpError(409, ERROR_CODES.PRODUCT_STOCK_NOT_ENOUGH, '商品库存不足');
}

function activeDelivery(product: CartProductRecord, communityId: string) {
  return product.store.communities.find(
    (relation) =>
      relation.communityId === communityId &&
      relation.status === 'ACTIVE' &&
      relation.community.status === 'ENABLED' &&
      relation.community.deletedAt === null,
  );
}

function validateProduct(
  product: CartProductRecord | null,
  communityId: string,
): asserts product is CartProductRecord {
  if (!product) {
    throw new HttpError(404, ERROR_CODES.PRODUCT_NOT_FOUND, '商品不存在');
  }
  if (product.store.deletedAt !== null || product.store.status === 'DISABLED') {
    throw new HttpError(404, ERROR_CODES.STORE_NOT_FOUND, '店铺不存在或已停用');
  }
  if (product.store.status === 'PAUSED') {
    throw new HttpError(409, ERROR_CODES.STORE_PAUSED, '店铺当前暂停接单');
  }
  if (!activeDelivery(product, communityId)) {
    throw new HttpError(409, ERROR_CODES.STORE_NOT_DELIVERABLE, '店铺暂不配送到当前小区');
  }
  if (
    product.status === 'OFF_SHELF' ||
    product.category.status !== 'ENABLED' ||
    product.category.deletedAt !== null
  ) {
    throw new HttpError(409, ERROR_CODES.PRODUCT_OFF_SHELF, '商品已下架');
  }
  if (product.status === 'SOLD_OUT' || product.stock === 0) {
    throw quantityError('stock');
  }
}

function maximumQuantity(product: CartProductRecord): number {
  return product.purchaseLimit === null
    ? product.stock
    : Math.min(product.stock, product.purchaseLimit);
}

function unavailableReason(item: CartRecord['items'][number]): ItemUnavailableReason | null {
  const { product, quantity } = item;
  if (
    product.deletedAt !== null ||
    product.status === 'OFF_SHELF' ||
    product.category.status !== 'ENABLED' ||
    product.category.deletedAt !== null
  ) {
    return 'PRODUCT_OFF_SHELF';
  }
  if (product.status === 'SOLD_OUT' || quantity > product.stock) {
    return 'PRODUCT_STOCK_NOT_ENOUGH';
  }
  if (product.purchaseLimit !== null && quantity > product.purchaseLimit) {
    return 'PRODUCT_PURCHASE_LIMIT_EXCEEDED';
  }
  return null;
}

function emptyCart() {
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

function serialize(cart: CartRecord | null, user: PublicUser) {
  if (!cart || cart.items.length === 0) return emptyCart();

  const relation = user.currentCommunity
    ? cart.store.communities.find(
        (candidate) =>
          candidate.communityId === user.currentCommunity?.id &&
          candidate.status === 'ACTIVE' &&
          candidate.community.status === 'ENABLED' &&
          candidate.community.deletedAt === null,
      )
    : undefined;
  const storeAvailable =
    cart.store.deletedAt === null && cart.store.status === 'OPEN' && relation !== undefined;
  const minimumOrder = relation?.minimumOrderAmountOverride ?? cart.store.minimumOrderAmount;
  const deliveryFee = relation?.deliveryFeeOverride ?? cart.store.defaultDeliveryFee;
  let merchandiseTotal = new Prisma.Decimal(0);
  let itemCount = 0;
  let hasUnavailableItem = false;
  const items = cart.items.map((item) => {
    const reason = unavailableReason(item);
    const lineTotal = item.product.price.mul(item.quantity);
    merchandiseTotal = merchandiseTotal.plus(lineTotal);
    itemCount += item.quantity;
    hasUnavailableItem ||= reason !== null;
    return {
      id: item.id,
      productId: item.productId,
      name: item.product.name,
      imageUrl: item.product.mainImageUrl,
      unitPrice: item.product.price.toFixed(2),
      quantity: item.quantity,
      lineTotal: lineTotal.toFixed(2),
      stock: item.product.stock,
      purchaseLimit: item.product.purchaseLimit,
      available: reason === null,
      unavailableReason: reason,
    };
  });
  const amountToMinimum = minimumOrder.greaterThan(merchandiseTotal)
    ? minimumOrder.minus(merchandiseTotal)
    : new Prisma.Decimal(0);
  const meetsMinimumOrder = amountToMinimum.isZero();
  const canCheckout = storeAvailable && !hasUnavailableItem && meetsMinimumOrder;
  const blockedReason = !user.currentCommunity
    ? 'COMMUNITY_REQUIRED'
    : !storeAvailable
      ? 'STORE_UNAVAILABLE'
      : hasUnavailableItem
        ? 'ITEM_UNAVAILABLE'
        : !meetsMinimumOrder
          ? 'MINIMUM_ORDER_NOT_REACHED'
          : null;

  return {
    cartId: cart.id,
    store: {
      id: cart.store.id,
      name: cart.store.name,
      status: cart.store.status,
      isDeliverable: relation !== undefined,
      canOrder: storeAvailable,
    },
    items,
    summary: {
      itemCount,
      merchandiseTotal: merchandiseTotal.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      payableTotal: merchandiseTotal.plus(deliveryFee).toFixed(2),
      minimumOrderAmount: minimumOrder.toFixed(2),
      amountToMinimum: amountToMinimum.toFixed(2),
      meetsMinimumOrder,
      canCheckout,
      blockedReason,
    },
  };
}

async function currentCart(user: PublicUser) {
  return serialize(await cartRepository.findByUser(user.id), user);
}

export const cartService = {
  get(user: PublicUser) {
    return currentCart(user);
  },

  async add(user: PublicUser, productId: string, quantity: number, replaceExistingCart: boolean) {
    if (!user.currentCommunity) throw communityRequired();
    const product = await cartRepository.findProduct(productId);
    validateProduct(product, user.currentCommunity.id);
    try {
      await cartRepository.addItem(
        user.id,
        product,
        quantity,
        maximumQuantity(product),
        replaceExistingCart,
      );
    } catch (error) {
      if (error instanceof CartStoreConflictError) {
        throw new HttpError(409, ERROR_CODES.CART_STORE_CONFLICT, '购物车中已有其他店铺商品');
      }
      if (error instanceof CartQuantityConflictError) throw quantityError(error.reason);
      throw error;
    }
    return currentCart(user);
  },

  async update(user: PublicUser, itemId: string, quantity: number) {
    if (!user.currentCommunity) throw communityRequired();
    const item = await cartRepository.findOwnedItem(user.id, itemId);
    if (!item) throw itemNotFound();
    const product = await cartRepository.findProduct(item.productId);
    validateProduct(product, user.currentCommunity.id);
    if (quantity > product.stock) throw quantityError('stock');
    if (product.purchaseLimit !== null && quantity > product.purchaseLimit) {
      throw quantityError('purchaseLimit');
    }
    if (!(await cartRepository.setItemQuantity(user.id, itemId, quantity))) throw itemNotFound();
    return currentCart(user);
  },

  async remove(user: PublicUser, itemId: string) {
    if (!(await cartRepository.removeItem(user.id, itemId))) throw itemNotFound();
    return currentCart(user);
  },

  async clear(user: PublicUser) {
    await cartRepository.clear(user.id);
    return emptyCart();
  },
};
