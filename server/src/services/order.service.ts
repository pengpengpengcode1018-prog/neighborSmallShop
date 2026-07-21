import { createHash, randomBytes } from 'node:crypto';

import { ERROR_CODES } from '../constants/error-codes.js';
import { Prisma, type OrderStatus } from '../generated/prisma/client.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  DuplicateOrderRequestError,
  orderRepository,
  OrderRecordNotFoundError,
  OrderStatusConflictError,
  OrderStockConflictError,
  type AdminOrderFilters,
  type CheckoutContext,
  type OrderCreationPlan,
  type OrderDetailRecord,
  type OrderRecord,
  type OrderTransitionActor,
} from '../repositories/order.repository.js';
import type { PublicUser } from '../types/api.js';

export interface OrderSelectionInput {
  addressId: string;
  deliveryType: 'ASAP' | 'SCHEDULED';
  deliveryDate: string | null;
  deliverySlotId: string | null;
  remark: string | null;
}

export interface CreateOrderInput extends OrderSelectionInput {
  requestId: string;
  expectedPreviewVersion: string;
  expectedPayableAmount: string;
}

export type AdminOrderAction =
  'CLOSE' | 'ACCEPT' | 'START_PREPARING' | 'MARK_READY' | 'START_DELIVERY' | 'COMPLETE';

export interface AdminOrderActor {
  id: string;
  displayName: string;
  requestIp?: string;
  requestPath?: string;
  requestId?: string;
}

type CheckoutPlan = Omit<OrderCreationPlan, 'orderNo' | 'expiresAt'> & {
  estimatedDeliveryMinutes: number;
};

interface CheckoutCalculation {
  plan: CheckoutPlan;
  preview: ReturnType<typeof serializePreview>;
}

function checkoutError(status: number, code: string, message: string): HttpError {
  return new HttpError(status, code, message);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function shanghaiClock(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
}

function addUtcDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function databaseDate(date: string | null): Date | null {
  return date ? new Date(`${date}T00:00:00.000Z`) : null;
}

function generateOrderNo(): string {
  const { date } = shanghaiClock();
  return `NS${date.replaceAll('-', '')}${randomBytes(5).toString('hex').toUpperCase()}`;
}

function fullAddress(plan: CheckoutPlan): string {
  return [
    plan.addressCommunityName,
    plan.addressBuilding,
    plan.addressUnit,
    plan.addressRoom,
    plan.addressDetail,
  ]
    .filter(Boolean)
    .join(' ');
}

function serializePreview(plan: CheckoutPlan, minimumOrderAmount: Prisma.Decimal) {
  return {
    previewVersion: plan.previewVersion,
    store: { id: plan.storeId, name: plan.storeName },
    address: {
      id: plan.addressId,
      recipientName: plan.addressRecipientName,
      phone: plan.addressPhone,
      communityName: plan.addressCommunityName,
      building: plan.addressBuilding,
      unit: plan.addressUnit,
      room: plan.addressRoom,
      detail: plan.addressDetail,
      fullAddress: fullAddress(plan),
    },
    items: plan.items.map((item) => ({
      productId: item.productId,
      name: item.productName,
      imageUrl: item.productImageUrl,
      unitPrice: item.unitPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: item.lineTotal.toFixed(2),
    })),
    delivery: {
      type: plan.deliveryType,
      date: plan.deliveryDate?.toISOString().slice(0, 10) ?? null,
      time: plan.deliveryTime,
      estimatedDeliveryMinutes: plan.estimatedDeliveryMinutes,
    },
    remark: plan.remark,
    summary: {
      merchandiseTotal: plan.merchandiseTotal.toFixed(2),
      deliveryFee: plan.deliveryFee.toFixed(2),
      payableTotal: plan.payableTotal.toFixed(2),
      minimumOrderAmount: minimumOrderAmount.toFixed(2),
    },
  };
}

function serializeOrder(order: OrderRecord) {
  const address = {
    recipientName: order.addressRecipientName,
    phone: order.addressPhone,
    communityName: order.addressCommunityName,
    building: order.addressBuilding,
    unit: order.addressUnit,
    room: order.addressRoom,
    detail: order.addressDetail,
    fullAddress: [
      order.addressCommunityName,
      order.addressBuilding,
      order.addressUnit,
      order.addressRoom,
      order.addressDetail,
    ]
      .filter(Boolean)
      .join(' '),
  };
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    store: {
      id: order.storeId,
      name: order.storeName,
      logoUrl: order.storeLogoUrl,
      phone: order.storePhone,
    },
    address,
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.productName,
      imageUrl: item.productImageUrl,
      unitPrice: item.unitPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: item.lineTotal.toFixed(2),
    })),
    delivery: {
      type: order.deliveryType,
      date: order.deliveryDate?.toISOString().slice(0, 10) ?? null,
      time: order.deliveryTime,
    },
    remark: order.remark,
    summary: {
      merchandiseTotal: order.merchandiseTotal.toFixed(2),
      deliveryFee: order.deliveryFee.toFixed(2),
      payableTotal: order.payableTotal.toFixed(2),
    },
    expiresAt: order.expiresAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
  };
}

const statusLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: '待付款',
  PAID: '已支付待接单',
  ACCEPTED: '已接单',
  PREPARING: '制作中',
  WAITING_DELIVERY: '待配送',
  DELIVERING: '配送中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  REFUND_PENDING: '退款中',
  REFUNDED: '已退款',
};

const adminTransitions: Record<
  AdminOrderAction,
  {
    from: OrderStatus;
    to: OrderStatus;
    timestampField:
      | 'acceptedAt'
      | 'preparingAt'
      | 'waitingDeliveryAt'
      | 'deliveringAt'
      | 'completedAt'
      | 'cancelledAt';
    description: string;
    restoreStock: boolean;
  }
> = {
  CLOSE: {
    from: 'PENDING_PAYMENT',
    to: 'CANCELLED',
    timestampField: 'cancelledAt',
    description: '管理员关闭待付款订单',
    restoreStock: true,
  },
  ACCEPT: {
    from: 'PAID',
    to: 'ACCEPTED',
    timestampField: 'acceptedAt',
    description: '店铺已接单',
    restoreStock: false,
  },
  START_PREPARING: {
    from: 'ACCEPTED',
    to: 'PREPARING',
    timestampField: 'preparingAt',
    description: '店铺开始制作',
    restoreStock: false,
  },
  MARK_READY: {
    from: 'PREPARING',
    to: 'WAITING_DELIVERY',
    timestampField: 'waitingDeliveryAt',
    description: '商品制作完成，等待配送',
    restoreStock: false,
  },
  START_DELIVERY: {
    from: 'WAITING_DELIVERY',
    to: 'DELIVERING',
    timestampField: 'deliveringAt',
    description: '订单开始配送',
    restoreStock: false,
  },
  COMPLETE: {
    from: 'DELIVERING',
    to: 'COMPLETED',
    timestampField: 'completedAt',
    description: '订单配送完成',
    restoreStock: false,
  },
};

function residentAllowedActions(order: OrderDetailRecord): string[] {
  if (order.status === 'PAID' && !order.refund) return ['REFUND'];
  if (order.status === 'PENDING_PAYMENT') {
    return order.expiresAt.getTime() <= Date.now() ? [] : ['PAY', 'CANCEL'];
  }
  return [];
}

function adminAllowedActions(order: OrderDetailRecord): AdminOrderAction[] {
  const entry = Object.entries(adminTransitions).find(
    ([, transition]) => transition.from === order.status,
  );
  return entry ? [entry[0] as AdminOrderAction] : [];
}

function paymentStatus(
  order: OrderDetailRecord,
): 'UNPAID' | 'PAID' | 'REFUND_PENDING' | 'REFUNDED' {
  if (order.status === 'REFUND_PENDING') return 'REFUND_PENDING';
  if (order.status === 'REFUNDED') return 'REFUNDED';
  return order.paidAt ? 'PAID' : 'UNPAID';
}

function timestamps(order: OrderDetailRecord) {
  return {
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    acceptedAt: order.acceptedAt?.toISOString() ?? null,
    preparingAt: order.preparingAt?.toISOString() ?? null,
    waitingDeliveryAt: order.waitingDeliveryAt?.toISOString() ?? null,
    deliveringAt: order.deliveringAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    refundedAt: order.refundedAt?.toISOString() ?? null,
  };
}

function productSummary(order: OrderDetailRecord) {
  return {
    items: order.items.slice(0, 3).map((item) => ({
      productId: item.productId,
      name: item.productName,
      imageUrl: item.productImageUrl,
      quantity: item.quantity,
    })),
    totalQuantity: order.items.reduce((total, item) => total + item.quantity, 0),
    distinctCount: order.items.length,
  };
}

function residentCard(order: OrderDetailRecord) {
  const isExpired = order.status === 'PENDING_PAYMENT' && order.expiresAt.getTime() <= Date.now();
  return {
    id: order.id,
    orderNo: order.orderNo,
    store: { id: order.storeId, name: order.storeName, logoUrl: order.storeLogoUrl },
    productSummary: productSummary(order),
    payableAmount: order.payableTotal.toFixed(2),
    status: order.status,
    statusLabel: isExpired ? '关闭处理中' : statusLabels[order.status],
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt.toISOString(),
    isExpired,
    allowedActions: residentAllowedActions(order),
  };
}

function addressSnapshot(order: OrderDetailRecord) {
  return {
    recipientName: order.addressRecipientName,
    phone: order.addressPhone,
    communityName: order.addressCommunityName,
    building: order.addressBuilding,
    unit: order.addressUnit,
    room: order.addressRoom,
    detail: order.addressDetail,
    fullAddress: [
      order.addressCommunityName,
      order.addressBuilding,
      order.addressUnit,
      order.addressRoom,
      order.addressDetail,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function deliverySnapshot(order: OrderDetailRecord) {
  return {
    type: order.deliveryType,
    date: order.deliveryDate?.toISOString().slice(0, 10) ?? null,
    time: order.deliveryTime,
  };
}

function itemSnapshots(order: OrderDetailRecord) {
  return order.items.map((item) => ({
    productId: item.productId,
    name: item.productName,
    imageUrl: item.productImageUrl,
    unitPrice: item.unitPrice.toFixed(2),
    quantity: item.quantity,
    lineTotal: item.lineTotal.toFixed(2),
  }));
}

function amountSnapshot(order: OrderDetailRecord) {
  return {
    merchandiseTotal: order.merchandiseTotal.toFixed(2),
    deliveryFee: order.deliveryFee.toFixed(2),
    payableTotal: order.payableTotal.toFixed(2),
  };
}

function residentDetail(order: OrderDetailRecord) {
  return {
    ...residentCard(order),
    store: {
      id: order.storeId,
      name: order.storeName,
      logoUrl: order.storeLogoUrl,
      phone: order.storePhone,
    },
    address: addressSnapshot(order),
    items: itemSnapshots(order),
    delivery: deliverySnapshot(order),
    remark: order.remark,
    summary: amountSnapshot(order),
    expiresAt: order.expiresAt.toISOString(),
    cancellationReason: order.cancellationReason,
    timestamps: timestamps(order),
    timeline: order.statusLogs.map((log) => ({
      status: log.toStatus,
      title: statusLabels[log.toStatus],
      description: log.description,
      time: log.createdAt.toISOString(),
    })),
    refund: order.refund
      ? {
          id: order.refund.id,
          status: order.refund.status,
          amount: order.refund.amount.toFixed(2),
          reason: order.refund.reason,
          createdAt: order.refund.createdAt.toISOString(),
        }
      : null,
  };
}

function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

function adminCard(order: OrderDetailRecord) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    user: {
      id: order.user.id,
      nickname: order.user.nickname,
      phone: maskPhone(order.addressPhone),
    },
    store: { id: order.storeId, name: order.storeName },
    communityName: order.addressCommunityName,
    productSummary: productSummary(order),
    merchandiseTotal: order.merchandiseTotal.toFixed(2),
    deliveryFee: order.deliveryFee.toFixed(2),
    payableTotal: order.payableTotal.toFixed(2),
    paymentStatus: paymentStatus(order),
    status: order.status,
    statusLabel: statusLabels[order.status],
    deliveryType: order.deliveryType,
    deliveryDate: order.deliveryDate?.toISOString().slice(0, 10) ?? null,
    deliveryTime: order.deliveryTime,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    allowedActions: adminAllowedActions(order),
    refund: order.refund
      ? { id: order.refund.id, status: order.refund.status, amount: order.refund.amount.toFixed(2) }
      : null,
  };
}

async function adminDetail(order: OrderDetailRecord) {
  const operations = await orderRepository.listAdminOperations(order.id);
  return {
    ...adminCard(order),
    user: { id: order.user.id, nickname: order.user.nickname },
    store: {
      id: order.storeId,
      name: order.storeName,
      logoUrl: order.storeLogoUrl,
      phone: order.storePhone,
    },
    address: addressSnapshot(order),
    items: itemSnapshots(order),
    delivery: deliverySnapshot(order),
    remark: order.remark,
    adminRemark: order.adminRemark,
    summary: amountSnapshot(order),
    cancellationReason: order.cancellationReason,
    timestamps: timestamps(order),
    statusLogs: order.statusLogs.map((log) => ({
      id: log.id,
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      operatorType: log.operatorType,
      operatorId: log.operatorId,
      operatorName: log.operatorName,
      description: log.description,
      createdAt: log.createdAt.toISOString(),
    })),
    operationLogs: operations.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}

function transitionActor(actor: AdminOrderActor): OrderTransitionActor {
  return {
    type: 'ADMIN',
    id: actor.id,
    name: actor.displayName,
    ...(actor.requestIp ? { requestIp: actor.requestIp } : {}),
    ...(actor.requestPath ? { requestPath: actor.requestPath } : {}),
    ...(actor.requestId ? { requestId: actor.requestId } : {}),
  };
}

function orderNotFound(): HttpError {
  return checkoutError(404, ERROR_CODES.ORDER_NOT_FOUND, '订单不存在');
}

function invalidOrderStatus(): HttpError {
  return checkoutError(409, ERROR_CODES.INVALID_ORDER_STATUS, '当前订单状态不允许此操作');
}

function requestFingerprint(input: CreateOrderInput): string {
  return sha256({
    addressId: input.addressId,
    deliveryType: input.deliveryType,
    deliveryDate: input.deliveryDate,
    deliverySlotId: input.deliverySlotId,
    remark: input.remark,
    expectedPreviewVersion: input.expectedPreviewVersion,
    expectedPayableAmount: input.expectedPayableAmount,
  });
}

function calculateCheckout(
  context: CheckoutContext,
  input: OrderSelectionInput,
): CheckoutCalculation {
  const { cart, address, deliverySlot } = context;
  if (!cart || cart.items.length === 0) {
    throw checkoutError(409, ERROR_CODES.CART_EMPTY, '购物车为空');
  }
  if (!address || address.community.status !== 'ENABLED' || address.community.deletedAt !== null) {
    throw checkoutError(404, ERROR_CODES.ADDRESS_NOT_FOUND, '收货地址不存在或已失效');
  }
  const store = cart.store;
  if (store.deletedAt !== null || store.status === 'DISABLED') {
    throw checkoutError(404, ERROR_CODES.STORE_NOT_FOUND, '店铺不存在或已停用');
  }
  if (store.status === 'PAUSED') {
    throw checkoutError(409, ERROR_CODES.STORE_PAUSED, '店铺当前暂停接单');
  }
  const deliveryRelation = store.communities.find(
    (relation) =>
      relation.communityId === address.communityId &&
      relation.status === 'ACTIVE' &&
      relation.community.status === 'ENABLED' &&
      relation.community.deletedAt === null,
  );
  if (!deliveryRelation) {
    throw checkoutError(409, ERROR_CODES.STORE_NOT_DELIVERABLE, '店铺暂不配送到该地址');
  }

  let merchandiseTotal = new Prisma.Decimal(0);
  const items = cart.items.map((item) => {
    const product = item.product;
    if (product.storeId !== store.id || product.deletedAt !== null) {
      throw checkoutError(404, ERROR_CODES.PRODUCT_NOT_FOUND, '商品不存在');
    }
    if (
      product.status === 'OFF_SHELF' ||
      product.category.status !== 'ENABLED' ||
      product.category.deletedAt !== null
    ) {
      throw checkoutError(409, ERROR_CODES.PRODUCT_OFF_SHELF, '商品已下架');
    }
    if (product.status === 'SOLD_OUT' || item.quantity > product.stock) {
      throw checkoutError(409, ERROR_CODES.PRODUCT_STOCK_NOT_ENOUGH, '商品库存不足');
    }
    if (product.purchaseLimit !== null && item.quantity > product.purchaseLimit) {
      throw checkoutError(409, ERROR_CODES.PRODUCT_PURCHASE_LIMIT_EXCEEDED, '购买数量超过限购数量');
    }
    const lineTotal = product.price.mul(item.quantity);
    merchandiseTotal = merchandiseTotal.plus(lineTotal);
    return {
      productId: product.id,
      productName: product.name,
      productImageUrl: product.mainImageUrl,
      unitPrice: product.price,
      quantity: item.quantity,
      lineTotal,
    };
  });
  const minimumOrderAmount =
    deliveryRelation.minimumOrderAmountOverride ?? store.minimumOrderAmount;
  if (merchandiseTotal.lessThan(minimumOrderAmount)) {
    throw checkoutError(409, ERROR_CODES.MINIMUM_ORDER_NOT_REACHED, '商品金额未达到起送金额');
  }
  const deliveryFee = deliveryRelation.deliveryFeeOverride ?? store.defaultDeliveryFee;
  const clock = shanghaiClock();
  let deliveryDate: Date | null = null;
  let deliveryTime: string | null = null;
  if (input.deliveryType === 'ASAP') {
    if (!store.asapDeliveryEnabled) {
      throw checkoutError(409, ERROR_CODES.DELIVERY_SLOT_UNAVAILABLE, '店铺未开启即时配送');
    }
    if (clock.time < store.businessStartTime || clock.time >= store.businessEndTime) {
      throw checkoutError(409, ERROR_CODES.STORE_CLOSED, '店铺当前不在营业时间');
    }
  } else {
    if (!store.scheduledDeliveryEnabled || !input.deliveryDate || !input.deliverySlotId) {
      throw checkoutError(409, ERROR_CODES.DELIVERY_SLOT_UNAVAILABLE, '预约配送方式不可用');
    }
    const lastAvailableDate = addUtcDays(clock.date, 6);
    if (input.deliveryDate < clock.date || input.deliveryDate > lastAvailableDate) {
      throw checkoutError(409, ERROR_CODES.DELIVERY_SLOT_UNAVAILABLE, '预约日期不在可选范围内');
    }
    if (
      !deliverySlot ||
      deliverySlot.storeId !== store.id ||
      deliverySlot.status !== 'ENABLED' ||
      (input.deliveryDate === clock.date && clock.time >= deliverySlot.cutoffTime) ||
      context.scheduledOrderCount >= deliverySlot.maxOrders
    ) {
      throw checkoutError(409, ERROR_CODES.DELIVERY_SLOT_UNAVAILABLE, '预约时段已不可用');
    }
    deliveryDate = databaseDate(input.deliveryDate);
    deliveryTime = deliverySlot.deliveryTime;
  }

  const version = sha256({
    store: {
      id: store.id,
      name: store.name,
      status: store.status,
      businessStartTime: store.businessStartTime,
      businessEndTime: store.businessEndTime,
      minimumOrderAmount: minimumOrderAmount.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      asapDeliveryEnabled: store.asapDeliveryEnabled,
      scheduledDeliveryEnabled: store.scheduledDeliveryEnabled,
    },
    address: {
      id: address.id,
      communityId: address.communityId,
      recipientName: address.recipientName,
      phone: address.phone,
      building: address.building,
      unit: address.unit,
      room: address.room,
      detail: address.detail,
    },
    items: items.map((item) => ({
      productId: item.productId,
      name: item.productName,
      imageUrl: item.productImageUrl,
      unitPrice: item.unitPrice.toFixed(2),
      quantity: item.quantity,
    })),
    delivery: {
      type: input.deliveryType,
      date: input.deliveryDate,
      slotId: input.deliverySlotId,
      time: deliveryTime,
    },
    remark: input.remark,
  });
  const plan = {
    storeId: store.id,
    addressId: address.id,
    deliverySlotId: deliverySlot?.id ?? null,
    previewVersion: version,
    deliveryType: input.deliveryType,
    deliveryDate,
    deliveryTime,
    remark: input.remark,
    storeName: store.name,
    storeLogoUrl: store.logoUrl,
    storePhone: store.phone,
    merchandiseTotal,
    deliveryFee,
    payableTotal: merchandiseTotal.plus(deliveryFee),
    addressRecipientName: address.recipientName,
    addressPhone: address.phone,
    addressCommunityName: address.community.name,
    addressBuilding: address.building,
    addressUnit: address.unit,
    addressRoom: address.room,
    addressDetail: address.detail,
    estimatedDeliveryMinutes:
      deliveryRelation.estimatedDeliveryMinutesOverride ?? store.estimatedDeliveryMinutes,
    items,
  };
  return { plan, preview: serializePreview(plan, minimumOrderAmount) };
}

export const orderService = {
  async preview(user: PublicUser, input: OrderSelectionInput) {
    const context = await orderRepository.getCheckoutContext(
      user.id,
      input.addressId,
      input.deliverySlotId,
      databaseDate(input.deliveryDate),
    );
    return calculateCheckout(context, input).preview;
  },

  async create(user: PublicUser, input: CreateOrderInput) {
    const fingerprint = requestFingerprint(input);
    try {
      const result = await orderRepository.createAtomic(
        user.id,
        input.requestId,
        fingerprint,
        input.addressId,
        input.deliverySlotId,
        databaseDate(input.deliveryDate),
        (context) => {
          const checkout = calculateCheckout(context, input);
          if (
            checkout.plan.previewVersion !== input.expectedPreviewVersion ||
            !checkout.plan.payableTotal.equals(new Prisma.Decimal(input.expectedPayableAmount))
          ) {
            throw checkoutError(
              409,
              ERROR_CODES.ORDER_PREVIEW_STALE,
              '订单内容或金额已变化，请重新确认',
            );
          }
          return {
            ...checkout.plan,
            orderNo: generateOrderNo(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          };
        },
      );
      return {
        idempotentReplay: result.idempotentReplay,
        order: serializeOrder(result.order),
      };
    } catch (error) {
      if (error instanceof DuplicateOrderRequestError) {
        throw checkoutError(409, ERROR_CODES.DUPLICATE_REQUEST, '请求编号已用于其他订单内容');
      }
      if (error instanceof OrderStockConflictError) {
        throw checkoutError(409, ERROR_CODES.PRODUCT_STOCK_NOT_ENOUGH, '商品库存不足');
      }
      throw error;
    }
  },

  async listResident(
    user: PublicUser,
    status: OrderStatus | undefined,
    page: number,
    pageSize: number,
  ) {
    const result = await orderRepository.listResident(user.id, status, page, pageSize);
    return {
      list: result.list.map(residentCard),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  },

  async detailResident(user: PublicUser, orderId: string) {
    const order = await orderRepository.findResidentDetail(user.id, orderId);
    if (!order) throw orderNotFound();
    return residentDetail(order);
  },

  async listAdmin(filters: AdminOrderFilters, page: number, pageSize: number) {
    const result = await orderRepository.listAdmin(filters, page, pageSize);
    return {
      list: result.list.map(adminCard),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  },

  async detailAdmin(orderId: string) {
    const order = await orderRepository.findAdminDetail(orderId);
    if (!order) throw orderNotFound();
    return adminDetail(order);
  },

  async transitionAdmin(
    orderId: string,
    action: Exclude<AdminOrderAction, 'CLOSE'>,
    expectedStatus: OrderStatus,
    remark: string | null,
    actor: AdminOrderActor,
  ) {
    const transition = adminTransitions[action];
    if (transition.from !== expectedStatus) throw invalidOrderStatus();
    try {
      const result = await orderRepository.transition({
        orderId,
        fromStatus: transition.from,
        toStatus: transition.to,
        description: transition.description,
        ...(transition.to === 'CANCELLED' ? { reason: remark ?? '管理员关闭待付款订单' } : {}),
        timestampField: transition.timestampField,
        restoreStock: transition.restoreStock,
        actor: transitionActor(actor),
      });
      return {
        idempotentReplay: result.idempotentReplay,
        order: await adminDetail(result.order),
      };
    } catch (error) {
      if (error instanceof OrderRecordNotFoundError) throw orderNotFound();
      if (error instanceof OrderStatusConflictError) throw invalidOrderStatus();
      throw error;
    }
  },

  async updateAdminRemark(orderId: string, remark: string | null, actor: AdminOrderActor) {
    const order = await orderRepository.updateAdminRemark(orderId, remark, transitionActor(actor));
    if (!order) throw orderNotFound();
    return adminDetail(order);
  },
};
