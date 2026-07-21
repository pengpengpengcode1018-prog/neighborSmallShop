import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';

const storeInclude = {
  communities: { include: { community: true } },
} satisfies Prisma.StoreInclude;

const productInclude = {
  category: true,
  store: { include: storeInclude },
} satisfies Prisma.ProductInclude;

const cartInclude = {
  store: { include: storeInclude },
  items: {
    include: { product: { include: { category: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

export type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type CartProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export class CartStoreConflictError extends Error {}

export class CartQuantityConflictError extends Error {
  constructor(public readonly reason: 'stock' | 'purchaseLimit') {
    super('cart quantity exceeds the current product limit');
  }
}

function limitingReason(product: CartProductRecord): 'stock' | 'purchaseLimit' {
  return product.purchaseLimit !== null && product.purchaseLimit <= product.stock
    ? 'purchaseLimit'
    : 'stock';
}

export const cartRepository = {
  findByUser(userId: string): Promise<CartRecord | null> {
    return prisma.cart.findUnique({ where: { userId }, include: cartInclude });
  },

  findProduct(productId: string): Promise<CartProductRecord | null> {
    return prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: productInclude,
    });
  },

  findOwnedItem(userId: string, itemId: string) {
    return prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      select: { id: true, productId: true, quantity: true },
    });
  },

  async addItem(
    userId: string,
    product: CartProductRecord,
    quantity: number,
    maximumQuantity: number,
    replaceExistingCart: boolean,
  ): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      let cart = await transaction.cart.findUnique({ where: { userId } });
      if (cart && cart.storeId !== product.storeId) {
        if (!replaceExistingCart) throw new CartStoreConflictError();
        await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
        cart = await transaction.cart.update({
          where: { id: cart.id },
          data: { storeId: product.storeId },
        });
      }
      if (!cart) {
        cart = await transaction.cart.create({ data: { userId, storeId: product.storeId } });
      }

      const item = await transaction.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      });
      if (!item) {
        if (quantity > maximumQuantity) {
          throw new CartQuantityConflictError(limitingReason(product));
        }
        await transaction.cartItem.create({
          data: { cartId: cart.id, productId: product.id, quantity },
        });
        return;
      }

      const result = await transaction.cartItem.updateMany({
        where: {
          id: item.id,
          quantity: { lte: maximumQuantity - quantity },
        },
        data: { quantity: { increment: quantity } },
      });
      if (result.count === 0) {
        throw new CartQuantityConflictError(limitingReason(product));
      }
    });
  },

  async setItemQuantity(userId: string, itemId: string, quantity: number): Promise<boolean> {
    const result = await prisma.cartItem.updateMany({
      where: { id: itemId, cart: { userId } },
      data: { quantity },
    });
    return result.count === 1;
  },

  async removeItem(userId: string, itemId: string): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      const item = await transaction.cartItem.findFirst({
        where: { id: itemId, cart: { userId } },
        select: { id: true, cartId: true },
      });
      if (!item) return false;
      await transaction.cartItem.delete({ where: { id: item.id } });
      const remaining = await transaction.cartItem.count({ where: { cartId: item.cartId } });
      if (remaining === 0) await transaction.cart.delete({ where: { id: item.cartId } });
      return true;
    });
  },

  async clear(userId: string): Promise<void> {
    await prisma.cart.deleteMany({ where: { userId } });
  },
};
