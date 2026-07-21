import { prisma } from '../config/database.js';
import { Prisma, type RefundStatus } from '../generated/prisma/client.js';
import type {
  WechatRefundProviderStatus,
  WechatRefundResult,
} from '../providers/wechat-payment.provider.js';
import { auditRepository } from './audit.repository.js';

const refundInclude = {
  order: { include: { items: { orderBy: { createdAt: 'asc' as const } } } },
  payment: true,
  reviewedByAdmin: { select: { id: true, displayName: true } },
} satisfies Prisma.RefundInclude;

export type RefundRecord = Prisma.RefundGetPayload<{ include: typeof refundInclude }>;

export interface RefundActor {
  id: string;
  name: string;
  requestIp?: string;
  requestPath?: string;
  requestId?: string;
}

export type RefundApprovalClaim =
  | { kind: 'APPLY'; refund: RefundRecord; idempotentReplay: boolean }
  | { kind: 'QUERY'; refund: RefundRecord; idempotentReplay: true }
  | { kind: 'SUCCESS'; refund: RefundRecord; idempotentReplay: true };

export interface RefundProviderEvent {
  result: WechatRefundResult;
  source: 'APPLY' | 'QUERY' | 'NOTIFY';
  notification?: {
    id: string;
    eventType: string;
    payloadDigest: string;
  };
}

export class RefundNotFoundError extends Error {}
export class RefundOrderStatusError extends Error {}
export class RefundAlreadyExistsError extends Error {}
export class RefundDuplicateRequestError extends Error {}
export class RefundStatusConflictError extends Error {}
export class RefundDataMismatchError extends Error {}

async function lockOrder(transaction: Prisma.TransactionClient, orderId: string): Promise<void> {
  await transaction.$queryRaw(Prisma.sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`);
}

async function lockRefund(transaction: Prisma.TransactionClient, refundId: string): Promise<void> {
  await transaction.$queryRaw(Prisma.sql`SELECT id FROM refunds WHERE id = ${refundId} FOR UPDATE`);
}

function providerFailure(status: WechatRefundProviderStatus): string | null {
  if (status === 'CLOSED') return 'provider_closed';
  if (status === 'ABNORMAL') return 'provider_abnormal';
  return null;
}

const refundTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
};

export const refundRepository = {
  apply(input: {
    userId: string;
    orderId: string;
    refundNo: string;
    requestId: string;
    requestFingerprint: string;
    reason: string;
    userNote: string | null;
    now: Date;
  }): Promise<{ refund: RefundRecord; idempotentReplay: boolean }> {
    return prisma.$transaction(async (transaction) => {
      await lockOrder(transaction, input.orderId);
      const order = await transaction.order.findFirst({
        where: { id: input.orderId, userId: input.userId },
        include: { payment: true, refund: true },
      });
      if (!order) throw new RefundNotFoundError();
      if (order.refund) {
        const existing = await transaction.refund.findUniqueOrThrow({
          where: { id: order.refund.id },
          include: refundInclude,
        });
        if (
          existing.requestId === input.requestId &&
          existing.requestFingerprint === input.requestFingerprint
        ) {
          return { refund: existing, idempotentReplay: true };
        }
        throw new RefundAlreadyExistsError();
      }
      const duplicateRequest = await transaction.refund.findUnique({
        where: { userId_requestId: { userId: input.userId, requestId: input.requestId } },
      });
      if (duplicateRequest) throw new RefundDuplicateRequestError();
      if (
        order.status !== 'PAID' ||
        !order.payment ||
        order.payment.status !== 'SUCCESS' ||
        !order.payment.transactionId ||
        !order.paidAt ||
        order.paidAt.getTime() < input.now.getTime() - 365 * 24 * 60 * 60 * 1000 ||
        !order.payment.amount.equals(order.payableTotal) ||
        order.payment.currency !== 'CNY'
      ) {
        throw new RefundOrderStatusError();
      }

      const refund = await transaction.refund.create({
        data: {
          refundNo: input.refundNo,
          orderId: order.id,
          paymentId: order.payment.id,
          userId: input.userId,
          requestId: input.requestId,
          requestFingerprint: input.requestFingerprint,
          amount: order.payment.amount,
          currency: order.payment.currency,
          reason: input.reason,
          userNote: input.userNote,
          createdAt: input.now,
        },
        include: refundInclude,
      });
      await transaction.order.update({
        where: { id: order.id },
        data: { status: 'REFUND_PENDING' },
      });
      await transaction.orderStatusLog.create({
        data: {
          orderId: order.id,
          fromStatus: 'PAID',
          toStatus: 'REFUND_PENDING',
          operatorType: 'USER',
          operatorId: input.userId,
          description: '居民提交整单退款申请',
          createdAt: input.now,
        },
      });
      return {
        refund: await transaction.refund.findUniqueOrThrow({
          where: { id: refund.id },
          include: refundInclude,
        }),
        idempotentReplay: false,
      };
    }, refundTransactionOptions);
  },

  findResident(userId: string, refundId: string): Promise<RefundRecord | null> {
    return prisma.refund.findFirst({
      where: { id: refundId, userId },
      include: refundInclude,
    });
  },

  findAdmin(refundId: string): Promise<RefundRecord | null> {
    return prisma.refund.findUnique({ where: { id: refundId }, include: refundInclude });
  },

  findByRefundNo(refundNo: string): Promise<RefundRecord | null> {
    return prisma.refund.findUnique({ where: { refundNo }, include: refundInclude });
  },

  async listAdmin(
    filters: { status?: RefundStatus; orderNo?: string },
    page: number,
    pageSize: number,
  ): Promise<{ list: RefundRecord[]; total: number }> {
    const where: Prisma.RefundWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.orderNo ? { order: { orderNo: { contains: filters.orderNo } } } : {}),
    };
    const [list, total] = await prisma.$transaction([
      prisma.refund.findMany({
        where,
        include: refundInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.refund.count({ where }),
    ]);
    return { list, total };
  },

  claimApproval(refundId: string, actor: RefundActor, reviewNote: string | null) {
    return prisma.$transaction(async (transaction): Promise<RefundApprovalClaim> => {
      const reference = await transaction.refund.findUnique({
        where: { id: refundId },
        select: { id: true, orderId: true },
      });
      if (!reference) throw new RefundNotFoundError();
      await lockOrder(transaction, reference.orderId);
      await lockRefund(transaction, reference.id);
      const current = await transaction.refund.findUniqueOrThrow({
        where: { id: reference.id },
        include: refundInclude,
      });
      if (current.status === 'SUCCESS') {
        return { kind: 'SUCCESS', refund: current, idempotentReplay: true };
      }
      if (current.status === 'PROCESSING') {
        return { kind: 'QUERY', refund: current, idempotentReplay: true };
      }
      if (current.status !== 'PENDING_REVIEW' && current.status !== 'APPROVED') {
        throw new RefundStatusConflictError();
      }
      if (current.order.status !== 'REFUND_PENDING') throw new RefundOrderStatusError();

      const firstApproval = current.status === 'PENDING_REVIEW';
      const now = new Date();
      const updated = await transaction.refund.update({
        where: { id: current.id },
        data: {
          status: 'APPROVED',
          reviewedByAdminId: current.reviewedByAdminId ?? actor.id,
          reviewedAt: current.reviewedAt ?? now,
          reviewNote: current.reviewNote ?? reviewNote,
          applyAttemptCount: { increment: 1 },
          lastApplyAttemptAt: now,
          failureReason: null,
        },
        include: refundInclude,
      });
      if (firstApproval) {
        await auditRepository.create(transaction, {
          actor: {
            adminId: actor.id,
            operatorName: actor.name,
            ...(actor.requestIp ? { requestIp: actor.requestIp } : {}),
            ...(actor.requestPath ? { requestPath: actor.requestPath } : {}),
            ...(actor.requestId ? { requestId: actor.requestId } : {}),
          },
          module: 'refund',
          action: 'approve',
          businessDataId: current.id,
          description: '审核通过整单退款申请',
          beforeData: { status: 'PENDING_REVIEW' },
          afterData: { status: 'APPROVED' },
        });
      }
      return { kind: 'APPLY', refund: updated, idempotentReplay: !firstApproval };
    }, refundTransactionOptions);
  },

  reject(
    refundId: string,
    actor: RefundActor,
    reviewNote: string,
  ): Promise<{ refund: RefundRecord; idempotentReplay: boolean }> {
    return prisma.$transaction(async (transaction) => {
      const reference = await transaction.refund.findUnique({
        where: { id: refundId },
        select: { id: true, orderId: true },
      });
      if (!reference) throw new RefundNotFoundError();
      await lockOrder(transaction, reference.orderId);
      await lockRefund(transaction, reference.id);
      const current = await transaction.refund.findUniqueOrThrow({
        where: { id: reference.id },
        include: refundInclude,
      });
      if (current.status === 'REJECTED') {
        return { refund: current, idempotentReplay: true };
      }
      if (current.status !== 'PENDING_REVIEW' || current.order.status !== 'REFUND_PENDING') {
        throw new RefundStatusConflictError();
      }
      const now = new Date();
      await transaction.order.update({ where: { id: current.orderId }, data: { status: 'PAID' } });
      await transaction.orderStatusLog.create({
        data: {
          orderId: current.orderId,
          fromStatus: 'REFUND_PENDING',
          toStatus: 'PAID',
          operatorType: 'ADMIN',
          operatorId: actor.id,
          operatorName: actor.name,
          description: '退款申请审核拒绝，订单恢复待接单',
          createdAt: now,
        },
      });
      const refund = await transaction.refund.update({
        where: { id: current.id },
        data: {
          status: 'REJECTED',
          reviewedByAdminId: actor.id,
          reviewedAt: now,
          reviewNote,
        },
        include: refundInclude,
      });
      await auditRepository.create(transaction, {
        actor: {
          adminId: actor.id,
          operatorName: actor.name,
          ...(actor.requestIp ? { requestIp: actor.requestIp } : {}),
          ...(actor.requestPath ? { requestPath: actor.requestPath } : {}),
          ...(actor.requestId ? { requestId: actor.requestId } : {}),
        },
        module: 'refund',
        action: 'reject',
        businessDataId: current.id,
        description: '审核拒绝整单退款申请',
        beforeData: { status: 'PENDING_REVIEW' },
        afterData: { status: 'REJECTED' },
      });
      return { refund, idempotentReplay: false };
    }, refundTransactionOptions);
  },

  async recordProviderFailure(refundId: string, reason: string): Promise<RefundRecord> {
    await prisma.refund.updateMany({
      where: { id: refundId, status: { in: ['APPROVED', 'PROCESSING'] } },
      data: { failureReason: reason.slice(0, 64) },
    });
    return prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: refundInclude });
  },

  applyProviderEvent(
    refundId: string,
    event: RefundProviderEvent,
  ): Promise<{ refund: RefundRecord; idempotentReplay: boolean }> {
    return prisma.$transaction(async (transaction) => {
      const reference = await transaction.refund.findUnique({
        where: { id: refundId },
        select: { id: true, orderId: true },
      });
      if (!reference) throw new RefundNotFoundError();
      await lockOrder(transaction, reference.orderId);
      await lockRefund(transaction, reference.id);
      const current = await transaction.refund.findUniqueOrThrow({
        where: { id: reference.id },
        include: refundInclude,
      });
      if (event.notification) {
        const duplicate = await transaction.refundNotification.findUnique({
          where: { notificationId: event.notification.id },
        });
        if (duplicate) {
          if (
            duplicate.refundId !== current.id ||
            duplicate.payloadDigest !== event.notification.payloadDigest ||
            duplicate.eventType !== event.notification.eventType
          ) {
            throw new RefundDataMismatchError();
          }
          return { refund: current, idempotentReplay: true };
        }
      }

      const resultAmount = new Prisma.Decimal(event.result.amountRefund).div(100);
      const totalAmount = new Prisma.Decimal(event.result.amountTotal).div(100);
      if (
        event.result.outRefundNo !== current.refundNo ||
        event.result.outTradeNo !== current.payment.outTradeNo ||
        event.result.transactionId !== current.payment.transactionId ||
        event.result.currency !== current.currency ||
        !resultAmount.equals(current.amount) ||
        !totalAmount.equals(current.payment.amount) ||
        (current.providerRefundId && current.providerRefundId !== event.result.refundId)
      ) {
        throw new RefundDataMismatchError();
      }
      if (current.status === 'PENDING_REVIEW' || current.status === 'REJECTED') {
        throw new RefundStatusConflictError();
      }

      const terminalReplay = current.status === 'SUCCESS';
      const now = new Date();
      if (!terminalReplay && event.result.status === 'SUCCESS') {
        if (current.order.status !== 'REFUND_PENDING') throw new RefundOrderStatusError();
        const completedAt = event.result.successTime ? new Date(event.result.successTime) : now;
        if (Number.isNaN(completedAt.getTime())) throw new RefundDataMismatchError();
        const shouldRestoreStock = !current.order.stockReleased;
        await transaction.refund.update({
          where: { id: current.id },
          data: {
            status: 'SUCCESS',
            providerRefundId: event.result.refundId,
            providerStatus: event.result.status,
            failureReason: null,
            providerAcceptedAt: current.providerAcceptedAt ?? now,
            completedAt,
            ...(event.source === 'QUERY' ? { lastQueriedAt: now } : {}),
          },
        });
        await transaction.order.update({
          where: { id: current.orderId },
          data: {
            status: 'REFUNDED',
            refundedAt: completedAt,
            ...(shouldRestoreStock ? { stockReleased: true } : {}),
          },
        });
        if (shouldRestoreStock) {
          for (const item of current.order.items) {
            await transaction.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
            const decremented = await transaction.product.updateMany({
              where: { id: item.productId, salesVolume: { gte: item.quantity } },
              data: { salesVolume: { decrement: item.quantity } },
            });
            if (decremented.count !== 1) throw new RefundDataMismatchError();
          }
        }
        await transaction.orderStatusLog.create({
          data: {
            orderId: current.orderId,
            fromStatus: 'REFUND_PENDING',
            toStatus: 'REFUNDED',
            operatorType: 'WECHAT',
            description: '微信确认整单退款成功',
            createdAt: completedAt,
          },
        });
      } else if (!terminalReplay && event.result.status === 'PROCESSING') {
        if (current.status !== 'FAILED') {
          await transaction.refund.update({
            where: { id: current.id },
            data: {
              status: 'PROCESSING',
              providerRefundId: event.result.refundId,
              providerStatus: event.result.status,
              failureReason: null,
              providerAcceptedAt: current.providerAcceptedAt ?? now,
              ...(event.source === 'QUERY' ? { lastQueriedAt: now } : {}),
            },
          });
        }
      } else if (!terminalReplay) {
        await transaction.refund.update({
          where: { id: current.id },
          data: {
            status: 'FAILED',
            providerRefundId: event.result.refundId,
            providerStatus: event.result.status,
            failureReason: providerFailure(event.result.status),
            providerAcceptedAt: current.providerAcceptedAt ?? now,
            ...(event.source === 'QUERY' ? { lastQueriedAt: now } : {}),
          },
        });
      }

      if (event.notification) {
        await transaction.refundNotification.create({
          data: {
            refundId: current.id,
            notificationId: event.notification.id,
            eventType: event.notification.eventType,
            payloadDigest: event.notification.payloadDigest,
            providerStatus: event.result.status,
            outcome: terminalReplay ? 'ALREADY_PROCESSED' : 'PROCESSED',
          },
        });
      }
      return {
        refund: await transaction.refund.findUniqueOrThrow({
          where: { id: current.id },
          include: refundInclude,
        }),
        idempotentReplay: terminalReplay,
      };
    }, refundTransactionOptions);
  },
};
