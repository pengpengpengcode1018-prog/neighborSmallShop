import { prisma } from '../config/database.js';
import { Prisma, type DeliveryType, type OrderStatus } from '../generated/prisma/client.js';
import { auditRepository } from './audit.repository.js';

const cartInclude = {
  store: { include: { communities: { include: { community: true } } } },
  items: {
    include: { product: { include: { category: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

const addressInclude = { community: true } satisfies Prisma.AddressInclude;

const orderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

const orderDetailInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  statusLogs: { orderBy: { createdAt: 'asc' as const } },
  user: { select: { id: true, nickname: true } },
  payment: { select: { status: true } },
  refund: {
    select: { id: true, status: true, amount: true, reason: true, createdAt: true },
  },
} satisfies Prisma.OrderInclude;

export type CheckoutCartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type CheckoutAddressRecord = Prisma.AddressGetPayload<{ include: typeof addressInclude }>;
export type CheckoutDeliverySlotRecord = Prisma.DeliverySlotGetPayload<Record<string, never>>;
export type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type OrderDetailRecord = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export interface AdminOrderFilters {
  orderNo?: string;
  phone?: string;
  storeId?: string;
  communityName?: string;
  status?: OrderStatus;
  deliveryType?: DeliveryType;
  createdFrom?: Date;
  createdTo?: Date;
}

export interface OrderTransitionActor {
  type: 'USER' | 'ADMIN' | 'SYSTEM' | 'WECHAT';
  id: string | null;
  name: string | null;
  requestIp?: string;
  requestPath?: string;
  requestId?: string;
}

export interface OrderTransitionInput {
  orderId: string;
  ownerUserId?: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  description: string;
  reason?: string | null;
  timestampField:
    | 'acceptedAt'
    | 'preparingAt'
    | 'waitingDeliveryAt'
    | 'deliveringAt'
    | 'completedAt'
    | 'cancelledAt';
  restoreStock: boolean;
  actor: OrderTransitionActor;
}

export interface CheckoutContext {
  cart: CheckoutCartRecord | null;
  address: CheckoutAddressRecord | null;
  deliverySlot: CheckoutDeliverySlotRecord | null;
  scheduledOrderCount: number;
}

export interface OrderCreationItem {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
}

export interface OrderCreationPlan {
  orderNo: string;
  storeId: string;
  addressId: string;
  deliverySlotId: string | null;
  previewVersion: string;
  deliveryType: 'ASAP' | 'SCHEDULED';
  deliveryDate: Date | null;
  deliveryTime: string | null;
  remark: string | null;
  storeName: string;
  storeLogoUrl: string | null;
  storePhone: string;
  merchandiseTotal: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  payableTotal: Prisma.Decimal;
  addressRecipientName: string;
  addressPhone: string;
  addressCommunityName: string;
  addressBuilding: string;
  addressUnit: string | null;
  addressRoom: string;
  addressDetail: string | null;
  expiresAt: Date;
  items: OrderCreationItem[];
}

export class OrderStockConflictError extends Error {
  constructor(public readonly productId: string) {
    super('product stock changed during order creation');
  }
}

export class DuplicateOrderRequestError extends Error {}

export class OrderRecordNotFoundError extends Error {}

export class OrderStatusConflictError extends Error {}

async function getContext(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  addressId: string,
  deliverySlotId: string | null,
  deliveryDate: Date | null,
): Promise<CheckoutContext> {
  const [cart, address, deliverySlot, scheduledOrderCount] = await Promise.all([
    client.cart.findUnique({ where: { userId }, include: cartInclude }),
    client.address.findFirst({
      where: { id: addressId, userId, deletedAt: null },
      include: addressInclude,
    }),
    deliverySlotId
      ? client.deliverySlot.findUnique({ where: { id: deliverySlotId } })
      : Promise.resolve(null),
    deliverySlotId && deliveryDate
      ? client.order.count({
          where: {
            deliverySlotId,
            deliveryDate,
            status: { notIn: ['CANCELLED', 'REFUNDED'] },
          },
        })
      : Promise.resolve(0),
  ]);
  return { cart, address, deliverySlot, scheduledOrderCount };
}

async function lockUser(transaction: Prisma.TransactionClient, userId: string): Promise<void> {
  await transaction.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
}

async function lockDeliverySlot(
  transaction: Prisma.TransactionClient,
  deliverySlotId: string | null,
): Promise<void> {
  if (!deliverySlotId) return;
  await transaction.$queryRaw(
    Prisma.sql`SELECT id FROM delivery_slots WHERE id = ${deliverySlotId} FOR UPDATE`,
  );
}

export const orderRepository = {
  getCheckoutContext(
    userId: string,
    addressId: string,
    deliverySlotId: string | null,
    deliveryDate: Date | null,
  ): Promise<CheckoutContext> {
    return getContext(prisma, userId, addressId, deliverySlotId, deliveryDate);
  },

  createAtomic(
    userId: string,
    requestId: string,
    requestFingerprint: string,
    addressId: string,
    deliverySlotId: string | null,
    deliveryDate: Date | null,
    buildPlan: (context: CheckoutContext) => OrderCreationPlan,
  ): Promise<{ order: OrderRecord; idempotentReplay: boolean }> {
    return prisma.$transaction(async (transaction) => {
      await lockUser(transaction, userId);
      // Serialize the last-capacity check before any consistent read establishes
      // the transaction snapshot. The lock is intentionally coarse per slot.
      await lockDeliverySlot(transaction, deliverySlotId);
      const existing = await transaction.order.findUnique({
        where: { userId_requestId: { userId, requestId } },
        include: orderInclude,
      });
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new DuplicateOrderRequestError();
        }
        return { order: existing, idempotentReplay: true };
      }

      const context = await getContext(
        transaction,
        userId,
        addressId,
        deliverySlotId,
        deliveryDate,
      );
      const plan = buildPlan(context);
      for (const item of plan.items) {
        const deducted = await transaction.product.updateMany({
          where: {
            id: item.productId,
            storeId: plan.storeId,
            deletedAt: null,
            status: 'ON_SALE',
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (deducted.count !== 1) throw new OrderStockConflictError(item.productId);
      }

      const order = await transaction.order.create({
        data: {
          orderNo: plan.orderNo,
          userId,
          storeId: plan.storeId,
          addressId: plan.addressId,
          deliverySlotId: plan.deliverySlotId,
          requestId,
          requestFingerprint,
          previewVersion: plan.previewVersion,
          status: 'PENDING_PAYMENT',
          deliveryType: plan.deliveryType,
          deliveryDate: plan.deliveryDate,
          deliveryTime: plan.deliveryTime,
          remark: plan.remark,
          storeName: plan.storeName,
          storeLogoUrl: plan.storeLogoUrl,
          storePhone: plan.storePhone,
          merchandiseTotal: plan.merchandiseTotal,
          deliveryFee: plan.deliveryFee,
          payableTotal: plan.payableTotal,
          addressRecipientName: plan.addressRecipientName,
          addressPhone: plan.addressPhone,
          addressCommunityName: plan.addressCommunityName,
          addressBuilding: plan.addressBuilding,
          addressUnit: plan.addressUnit,
          addressRoom: plan.addressRoom,
          addressDetail: plan.addressDetail,
          expiresAt: plan.expiresAt,
          items: { create: plan.items },
          statusLogs: {
            create: {
              fromStatus: null,
              toStatus: 'PENDING_PAYMENT',
              operatorType: 'USER',
              operatorId: userId,
              description: '居民提交订单',
            },
          },
        },
        include: orderInclude,
      });
      await transaction.address.update({
        where: { id: plan.addressId },
        data: { lastUsedAt: new Date() },
      });
      if (context.cart) await transaction.cart.delete({ where: { id: context.cart.id } });
      return { order, idempotentReplay: false };
    });
  },

  async listResident(
    userId: string,
    status: OrderStatus | undefined,
    page: number,
    pageSize: number,
  ): Promise<{ list: OrderDetailRecord[]; total: number }> {
    const where = { userId, ...(status ? { status } : {}) };
    const [list, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: orderDetailInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ]);
    return { list, total };
  },

  findResidentDetail(userId: string, orderId: string): Promise<OrderDetailRecord | null> {
    return prisma.order.findFirst({
      where: { id: orderId, userId },
      include: orderDetailInclude,
    });
  },

  async listAdmin(
    filters: AdminOrderFilters,
    page: number,
    pageSize: number,
  ): Promise<{ list: OrderDetailRecord[]; total: number }> {
    const where: Prisma.OrderWhereInput = {
      ...(filters.orderNo ? { orderNo: { contains: filters.orderNo } } : {}),
      ...(filters.phone ? { addressPhone: { contains: filters.phone } } : {}),
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.communityName
        ? { addressCommunityName: { contains: filters.communityName } }
        : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.deliveryType ? { deliveryType: filters.deliveryType } : {}),
      ...(filters.createdFrom || filters.createdTo
        ? {
            createdAt: {
              ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
              ...(filters.createdTo ? { lt: filters.createdTo } : {}),
            },
          }
        : {}),
    };
    const [list, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: orderDetailInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ]);
    return { list, total };
  },

  findAdminDetail(orderId: string): Promise<OrderDetailRecord | null> {
    return prisma.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
  },

  listAdminOperations(orderId: string) {
    return prisma.operationLog.findMany({
      where: { module: 'order', businessDataId: orderId },
      select: {
        id: true,
        operatorName: true,
        action: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  transition(input: OrderTransitionInput): Promise<{
    order: OrderDetailRecord;
    idempotentReplay: boolean;
  }> {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM orders WHERE id = ${input.orderId} FOR UPDATE`,
      );
      const current = await transaction.order.findFirst({
        where: {
          id: input.orderId,
          ...(input.ownerUserId ? { userId: input.ownerUserId } : {}),
        },
        include: orderDetailInclude,
      });
      if (!current) throw new OrderRecordNotFoundError();
      if (current.status === input.toStatus) {
        return { order: current, idempotentReplay: true };
      }
      if (current.status !== input.fromStatus) throw new OrderStatusConflictError();
      if (
        input.toStatus === 'CANCELLED' &&
        (current.payment?.status === 'CREATING' ||
          current.payment?.status === 'PENDING' ||
          current.payment?.status === 'CLOSING')
      ) {
        throw new OrderStatusConflictError();
      }

      const changedAt = new Date();
      const shouldRestoreStock = input.restoreStock && !current.stockReleased;
      await transaction.order.update({
        where: { id: current.id },
        data: {
          status: input.toStatus,
          [input.timestampField]: changedAt,
          ...(input.reason !== undefined ? { cancellationReason: input.reason } : {}),
          ...(shouldRestoreStock ? { stockReleased: true } : {}),
        },
        include: orderDetailInclude,
      });
      if (shouldRestoreStock) {
        for (const item of current.items) {
          await transaction.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
      await transaction.orderStatusLog.create({
        data: {
          orderId: current.id,
          fromStatus: current.status,
          toStatus: input.toStatus,
          operatorType: input.actor.type,
          operatorId: input.actor.id,
          operatorName: input.actor.name,
          description: input.description,
          createdAt: changedAt,
        },
      });
      if (input.actor.type === 'ADMIN') {
        await auditRepository.create(transaction, {
          actor: {
            adminId: input.actor.id,
            operatorName: input.actor.name ?? '平台管理员',
            ...(input.actor.requestIp ? { requestIp: input.actor.requestIp } : {}),
            ...(input.actor.requestPath ? { requestPath: input.actor.requestPath } : {}),
            ...(input.actor.requestId ? { requestId: input.actor.requestId } : {}),
          },
          module: 'order',
          action: `status:${input.toStatus.toLowerCase()}`,
          businessDataId: current.id,
          description: input.description,
          beforeData: { status: current.status },
          afterData: { status: input.toStatus },
        });
      }
      return {
        order: await transaction.order.findUniqueOrThrow({
          where: { id: current.id },
          include: orderDetailInclude,
        }),
        idempotentReplay: false,
      };
    });
  },

  updateAdminRemark(
    orderId: string,
    remark: string | null,
    actor: OrderTransitionActor,
  ): Promise<OrderDetailRecord | null> {
    return prisma.$transaction(async (transaction) => {
      const current = await transaction.order.findUnique({
        where: { id: orderId },
        select: { id: true, adminRemark: true },
      });
      if (!current) return null;
      const updated = await transaction.order.update({
        where: { id: current.id },
        data: { adminRemark: remark },
        include: orderDetailInclude,
      });
      await auditRepository.create(transaction, {
        actor: {
          adminId: actor.id,
          operatorName: actor.name ?? '平台管理员',
          ...(actor.requestIp ? { requestIp: actor.requestIp } : {}),
          ...(actor.requestPath ? { requestPath: actor.requestPath } : {}),
          ...(actor.requestId ? { requestId: actor.requestId } : {}),
        },
        module: 'order',
        action: 'remark',
        businessDataId: current.id,
        description: remark ? '更新订单后台备注' : '清空订单后台备注',
        beforeData: { hasRemark: current.adminRemark !== null },
        afterData: { hasRemark: remark !== null },
      });
      return updated;
    });
  },
};
