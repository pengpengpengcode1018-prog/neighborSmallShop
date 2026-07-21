import { prisma } from '../config/database.js';
import { Prisma, type OrderOperatorType, type Payment } from '../generated/prisma/client.js';
import { auditRepository } from './audit.repository.js';

const payableOrderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  user: { select: { id: true, wechatOpenId: true } },
} satisfies Prisma.OrderInclude;

const paymentStatusInclude = {
  order: { select: { id: true, userId: true, status: true, paidAt: true, expiresAt: true } },
} satisfies Prisma.PaymentInclude;

const paymentSuccessInclude = {
  order: { include: { items: { orderBy: { createdAt: 'asc' as const } } } },
} satisfies Prisma.PaymentInclude;

const closeOrderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  payment: true,
} satisfies Prisma.OrderInclude;

export type PayableOrderRecord = Prisma.OrderGetPayload<{ include: typeof payableOrderInclude }>;
export type PaymentStatusRecord = Prisma.PaymentGetPayload<{
  include: typeof paymentStatusInclude;
}>;
export type PaymentSuccessRecord = Prisma.PaymentGetPayload<{
  include: typeof paymentSuccessInclude;
}>;
export type ResidentOrderPaymentRecord = Prisma.OrderGetPayload<{
  select: {
    id: true;
    userId: true;
    status: true;
    paidAt: true;
    expiresAt: true;
    payment: true;
  };
}>;

export interface PaymentSuccessInput {
  notificationId: string;
  source: 'NOTIFY' | 'QUERY';
  eventType: string;
  payloadDigest: string;
  outTradeNo: string;
  transactionId: string;
  amount: Prisma.Decimal;
  currency: string;
  successTime: Date;
}

export interface PaymentCloseActor {
  type: Exclude<OrderOperatorType, 'WECHAT'>;
  id: string | null;
  name: string | null;
  requestIp?: string;
  requestPath?: string;
  requestId?: string;
}

export interface ClaimPaymentCloseInput {
  orderId: string;
  ownerUserId?: string;
  requireExpired: boolean;
  reason: string;
  actor: PaymentCloseActor;
  now: Date;
  leaseMs: number;
}

export type PaymentCloseClaim =
  | { kind: 'ALREADY_CLOSED'; orderId: string; idempotentReplay: true }
  | {
      kind: 'LOCAL';
      orderId: string;
      paymentId: string | null;
      reason: string;
      actor: PaymentCloseActor;
    }
  | {
      kind: 'EXTERNAL';
      orderId: string;
      paymentId: string;
      outTradeNo: string;
      reason: string;
      actor: PaymentCloseActor;
    };

export class PaymentOrderNotFoundError extends Error {}
export class PaymentOrderStatusError extends Error {}
export class PaymentAlreadyPaidError extends Error {}
export class PaymentInProgressError extends Error {}
export class PaymentCloseInProgressError extends Error {}
export class PaymentRecordNotFoundError extends Error {}
export class PaymentDataMismatchError extends Error {}

async function lockOrder(transaction: Prisma.TransactionClient, orderId: string): Promise<void> {
  await transaction.$queryRaw(Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
}

async function lockPayment(
  transaction: Prisma.TransactionClient,
  paymentId: string,
): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`,
  );
}

export const paymentRepository = {
  prepare(
    userId: string,
    orderId: string,
  ): Promise<{ order: PayableOrderRecord; payment: Payment; shouldCreate: boolean }> {
    return prisma.$transaction(async (transaction) => {
      await lockOrder(transaction, orderId);
      const order = await transaction.order.findFirst({
        where: { id: orderId, userId },
        include: payableOrderInclude,
      });
      if (!order) throw new PaymentOrderNotFoundError();
      if (order.status === 'PAID') throw new PaymentAlreadyPaidError();
      if (
        order.status !== 'PENDING_PAYMENT' ||
        order.stockReleased ||
        order.expiresAt.getTime() <= Date.now()
      ) {
        throw new PaymentOrderStatusError();
      }

      const existing = await transaction.payment.findUnique({ where: { orderId } });
      if (existing?.status === 'SUCCESS') throw new PaymentAlreadyPaidError();
      if (
        existing?.status === 'PENDING' &&
        existing.prepayId &&
        existing.prepayExpiresAt &&
        existing.prepayExpiresAt.getTime() > Date.now()
      ) {
        return { order, payment: existing, shouldCreate: false };
      }
      if (existing?.status === 'CREATING' || existing?.status === 'CLOSING') {
        throw new PaymentInProgressError();
      }
      if (existing?.status === 'CLOSED') throw new PaymentOrderStatusError();
      if (existing) {
        return {
          order,
          payment: await transaction.payment.update({
            where: { id: existing.id },
            data: {
              status: 'CREATING',
              failureReason: null,
              tradeState: null,
            },
          }),
          shouldCreate: true,
        };
      }

      return {
        order,
        payment: await transaction.payment.create({
          data: {
            orderId: order.id,
            outTradeNo: order.orderNo,
            status: 'CREATING',
            amount: order.payableTotal,
            currency: 'CNY',
          },
        }),
        shouldCreate: true,
      };
    });
  },

  async attachPrepay(paymentId: string, prepayId: string, prepayExpiresAt: Date): Promise<Payment> {
    const attached = await prisma.payment.updateMany({
      where: { id: paymentId, status: 'CREATING' },
      data: {
        status: 'PENDING',
        prepayId,
        prepayExpiresAt,
        failureReason: null,
      },
    });
    if (attached.count !== 1) throw new PaymentInProgressError();
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  },

  async markInitializationFailed(paymentId: string, reason: string): Promise<Payment> {
    await prisma.payment.updateMany({
      where: { id: paymentId, status: 'CREATING' },
      data: { status: 'FAILED', failureReason: reason.slice(0, 64) },
    });
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  },

  findResidentStatus(userId: string, orderId: string): Promise<PaymentStatusRecord | null> {
    return prisma.payment.findFirst({
      where: { orderId, order: { userId } },
      include: paymentStatusInclude,
    });
  },

  findResidentOrderPayment(
    userId: string,
    orderId: string,
  ): Promise<ResidentOrderPaymentRecord | null> {
    return prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        userId: true,
        status: true,
        paidAt: true,
        expiresAt: true,
        payment: true,
      },
    });
  },

  recordQueryState(paymentId: string, tradeState: string): Promise<Payment> {
    return prisma.payment.update({
      where: { id: paymentId },
      data: { tradeState: tradeState.slice(0, 32), lastQueriedAt: new Date() },
    });
  },

  async recordCloseQueryState(paymentId: string, tradeState: string): Promise<Payment> {
    await prisma.payment.updateMany({
      where: { id: paymentId, status: 'CLOSING' },
      data: { tradeState: tradeState.slice(0, 32), lastQueriedAt: new Date() },
    });
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  },

  listExpiredOrderIds(now: Date, take: number): Promise<Array<{ id: string }>> {
    return prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT', expiresAt: { lte: now } },
      select: { id: true },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take,
    });
  },

  claimClose(input: ClaimPaymentCloseInput): Promise<PaymentCloseClaim> {
    return prisma.$transaction(async (transaction) => {
      await lockOrder(transaction, input.orderId);
      const order = await transaction.order.findFirst({
        where: {
          id: input.orderId,
          ...(input.ownerUserId ? { userId: input.ownerUserId } : {}),
        },
        include: closeOrderInclude,
      });
      if (!order) throw new PaymentOrderNotFoundError();
      if (order.status === 'CANCELLED' && order.stockReleased) {
        return { kind: 'ALREADY_CLOSED', orderId: order.id, idempotentReplay: true };
      }
      if (order.status === 'PAID' || order.payment?.status === 'SUCCESS') {
        throw new PaymentAlreadyPaidError();
      }
      if (
        order.status !== 'PENDING_PAYMENT' ||
        order.stockReleased ||
        (input.requireExpired && order.expiresAt.getTime() > input.now.getTime())
      ) {
        throw new PaymentOrderStatusError();
      }
      if (!order.payment) {
        return {
          kind: 'LOCAL',
          orderId: order.id,
          paymentId: null,
          reason: input.reason,
          actor: input.actor,
        };
      }

      await lockPayment(transaction, order.payment.id);
      const payment = await transaction.payment.findUniqueOrThrow({
        where: { id: order.payment.id },
      });
      if (payment.status === 'SUCCESS') throw new PaymentAlreadyPaidError();

      const claimTime = payment.lastCloseAttemptAt ?? payment.updatedAt;
      const leaseCutoff = input.now.getTime() - input.leaseMs;
      if (
        (payment.status === 'CLOSING' || payment.status === 'CREATING') &&
        claimTime.getTime() > leaseCutoff
      ) {
        throw new PaymentCloseInProgressError();
      }

      const preservesOriginalActor = payment.status === 'CLOSING';
      const updated = await transaction.payment.update({
        where: { id: payment.id },
        data: {
          status: 'CLOSING',
          closeReason: preservesOriginalActor
            ? (payment.closeReason ?? input.reason)
            : input.reason,
          closeOperatorType: preservesOriginalActor
            ? (payment.closeOperatorType ?? input.actor.type)
            : input.actor.type,
          closeOperatorId: preservesOriginalActor
            ? (payment.closeOperatorId ?? input.actor.id)
            : input.actor.id,
          closeOperatorName: preservesOriginalActor
            ? (payment.closeOperatorName ?? input.actor.name)
            : input.actor.name,
          closeRequestedAt: payment.closeRequestedAt ?? input.now,
          lastCloseAttemptAt: input.now,
          closeAttemptCount: { increment: 1 },
          failureReason: null,
        },
      });
      const closeOperatorType =
        updated.closeOperatorType && updated.closeOperatorType !== 'WECHAT'
          ? updated.closeOperatorType
          : input.actor.type;
      const actor: PaymentCloseActor = {
        type: closeOperatorType,
        id: updated.closeOperatorId,
        name: updated.closeOperatorName,
        ...(input.actor.requestIp ? { requestIp: input.actor.requestIp } : {}),
        ...(input.actor.requestPath ? { requestPath: input.actor.requestPath } : {}),
      };
      const claim = {
        orderId: order.id,
        paymentId: updated.id,
        reason: updated.closeReason ?? input.reason,
        actor,
      };
      if (payment.status === 'CLOSED' || payment.failureReason === 'not_configured') {
        return { kind: 'LOCAL', ...claim };
      }
      return { kind: 'EXTERNAL', outTradeNo: payment.outTradeNo, ...claim };
    });
  },

  async recordCloseFailure(
    paymentId: string,
    reason: string,
    tradeState?: string,
  ): Promise<Payment> {
    await prisma.payment.updateMany({
      where: { id: paymentId, status: 'CLOSING' },
      data: {
        failureReason: reason.slice(0, 64),
        ...(tradeState ? { tradeState: tradeState.slice(0, 32) } : {}),
      },
    });
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  },

  finalizeClose(input: {
    orderId: string;
    paymentId: string | null;
    reason: string;
    actor: PaymentCloseActor;
    closedAt: Date;
  }): Promise<{ idempotentReplay: boolean }> {
    return prisma.$transaction(async (transaction) => {
      await lockOrder(transaction, input.orderId);
      const order = await transaction.order.findUnique({
        where: { id: input.orderId },
        include: closeOrderInclude,
      });
      if (!order) throw new PaymentOrderNotFoundError();
      if (order.status === 'CANCELLED' && order.stockReleased) {
        return { idempotentReplay: true };
      }
      if (order.status === 'PAID' || order.payment?.status === 'SUCCESS') {
        throw new PaymentAlreadyPaidError();
      }
      if (order.status !== 'PENDING_PAYMENT' || order.stockReleased) {
        throw new PaymentOrderStatusError();
      }
      if (input.paymentId) {
        await lockPayment(transaction, input.paymentId);
        const payment = await transaction.payment.findUniqueOrThrow({
          where: { id: input.paymentId },
        });
        if (payment.status === 'SUCCESS') throw new PaymentAlreadyPaidError();
        if (payment.status !== 'CLOSING' && payment.status !== 'CLOSED') {
          throw new PaymentCloseInProgressError();
        }
        await transaction.payment.update({
          where: { id: payment.id },
          data: {
            status: 'CLOSED',
            tradeState: 'CLOSED',
            closedAt: input.closedAt,
            failureReason: null,
          },
        });
      }

      await transaction.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: input.closedAt,
          cancellationReason: input.reason,
          stockReleased: true,
        },
      });
      for (const item of order.items) {
        await transaction.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      const description =
        input.actor.type === 'SYSTEM'
          ? '支付超时，系统自动关闭订单'
          : input.actor.type === 'ADMIN'
            ? '管理员关闭待付款订单'
            : '居民取消订单';
      await transaction.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: 'PENDING_PAYMENT',
          toStatus: 'CANCELLED',
          operatorType: input.actor.type,
          operatorId: input.actor.id,
          operatorName: input.actor.name,
          description,
          createdAt: input.closedAt,
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
          action: 'status:cancelled',
          businessDataId: order.id,
          description,
          beforeData: { status: 'PENDING_PAYMENT' },
          afterData: { status: 'CANCELLED' },
        });
      }
      return { idempotentReplay: false };
    });
  },

  async completeSuccess(input: PaymentSuccessInput): Promise<{
    payment: PaymentSuccessRecord;
    idempotentReplay: boolean;
  }> {
    const reference = await prisma.payment.findUnique({
      where: { outTradeNo: input.outTradeNo },
      select: { id: true, orderId: true },
    });
    if (!reference) throw new PaymentRecordNotFoundError();

    return prisma.$transaction(async (transaction) => {
      await lockOrder(transaction, reference.orderId);
      await lockPayment(transaction, reference.id);
      const payment = await transaction.payment.findUniqueOrThrow({
        where: { id: reference.id },
        include: paymentSuccessInclude,
      });
      const previousNotification = await transaction.paymentNotification.findUnique({
        where: { notificationId: input.notificationId },
      });
      if (previousNotification) {
        if (previousNotification.paymentId !== payment.id) {
          throw new PaymentDataMismatchError();
        }
        return { payment, idempotentReplay: true };
      }
      if (
        !payment.amount.equals(input.amount) ||
        payment.currency !== input.currency ||
        payment.outTradeNo !== input.outTradeNo
      ) {
        throw new PaymentDataMismatchError();
      }

      if (payment.status === 'SUCCESS' && payment.order.status === 'PAID') {
        if (payment.transactionId !== input.transactionId) {
          throw new PaymentDataMismatchError();
        }
        await transaction.paymentNotification.create({
          data: {
            paymentId: payment.id,
            notificationId: input.notificationId,
            source: input.source,
            eventType: input.eventType,
            payloadDigest: input.payloadDigest,
            transactionId: input.transactionId,
            outcome: 'ALREADY_PROCESSED',
          },
        });
        return { payment, idempotentReplay: true };
      }
      if (
        payment.order.status !== 'PENDING_PAYMENT' ||
        payment.order.stockReleased ||
        payment.status === 'CLOSED'
      ) {
        throw new PaymentOrderStatusError();
      }

      await transaction.order.update({
        where: { id: payment.order.id },
        data: { status: 'PAID', paidAt: input.successTime },
      });
      await transaction.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          transactionId: input.transactionId,
          tradeState: 'SUCCESS',
          succeededAt: input.successTime,
          failureReason: null,
          ...(input.source === 'QUERY' ? { lastQueriedAt: new Date() } : {}),
        },
      });
      for (const item of payment.order.items) {
        await transaction.product.update({
          where: { id: item.productId },
          data: { salesVolume: { increment: item.quantity } },
        });
      }
      await transaction.orderStatusLog.create({
        data: {
          orderId: payment.order.id,
          fromStatus: 'PENDING_PAYMENT',
          toStatus: 'PAID',
          operatorType: 'WECHAT',
          operatorId: input.transactionId,
          operatorName: '微信支付',
          description: input.source === 'NOTIFY' ? '微信支付通知确认成功' : '微信支付查单确认成功',
          createdAt: input.successTime,
        },
      });
      await transaction.paymentNotification.create({
        data: {
          paymentId: payment.id,
          notificationId: input.notificationId,
          source: input.source,
          eventType: input.eventType,
          payloadDigest: input.payloadDigest,
          transactionId: input.transactionId,
          outcome: 'PROCESSED',
        },
      });
      return {
        payment: await transaction.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: paymentSuccessInclude,
        }),
        idempotentReplay: false,
      };
    });
  },
};
