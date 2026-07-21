import { createHash, randomBytes } from 'node:crypto';

import { ERROR_CODES } from '../constants/error-codes.js';
import { Prisma, type RefundStatus } from '../generated/prisma/client.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  WechatPaymentProviderError,
  type WechatNotificationRequest,
  type WechatRefundProvider,
  type WechatRefundResult,
} from '../providers/wechat-payment.provider.js';
import {
  RefundAlreadyExistsError,
  RefundDataMismatchError,
  RefundDuplicateRequestError,
  RefundNotFoundError,
  refundRepository,
  RefundOrderStatusError,
  RefundStatusConflictError,
  type RefundActor,
  type RefundRecord,
} from '../repositories/refund.repository.js';
import type { PublicUser } from '../types/api.js';

export const refundReasons = [
  'NO_LONGER_NEEDED',
  'WRONG_PRODUCT',
  'WRONG_ADDRESS',
  'UNSUITABLE_DELIVERY_TIME',
  'DUPLICATE_ORDER',
  'WAIT_TOO_LONG',
  'OTHER',
] as const;

export type RefundReason = (typeof refundReasons)[number];

const reasonLabels: Record<RefundReason, string> = {
  NO_LONGER_NEEDED: '不想要了',
  WRONG_PRODUCT: '商品选错',
  WRONG_ADDRESS: '地址填写错误',
  UNSUITABLE_DELIVERY_TIME: '配送时间不合适',
  DUPLICATE_ORDER: '重复下单',
  WAIT_TOO_LONG: '店铺等待时间过长',
  OTHER: '其他',
};

const statusLabels: Record<RefundStatus, string> = {
  PENDING_REVIEW: '待审核',
  APPROVED: '审核通过，退款提交中',
  REJECTED: '审核已拒绝',
  PROCESSING: '退款处理中',
  SUCCESS: '退款成功',
  FAILED: '退款失败',
};

export interface RefundApplicationInput {
  requestId: string;
  reason: RefundReason;
  note: string | null;
}

function refundError(status: number, code: string, message: string): HttpError {
  return new HttpError(status, code, message);
}

function shanghaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .replaceAll('-', '');
}

function generateRefundNo(now: Date): string {
  return `RF${shanghaiDate(now)}${randomBytes(6).toString('hex').toUpperCase()}`;
}

function amountToFen(amount: Prisma.Decimal): number {
  return amount.mul(100).toNumber();
}

function maskPhone(value: string): string {
  if (value.length < 7) return '***';
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function failureMessage(refund: RefundRecord): string | null {
  if (!refund.failureReason) return null;
  if (refund.failureReason === 'provider_abnormal') return '微信退款异常，请联系平台处理';
  if (refund.failureReason === 'provider_closed') return '微信退款已关闭，请联系平台处理';
  return '退款结果暂未确认，请稍后查看';
}

function publicRefund(refund: RefundRecord, refreshPending = false) {
  return {
    id: refund.id,
    refundNo: refund.refundNo,
    order: {
      id: refund.order.id,
      orderNo: refund.order.orderNo,
      storeName: refund.order.storeName,
      status: refund.order.status,
    },
    amount: refund.amount.toFixed(2),
    currency: refund.currency,
    reason: refund.reason,
    reasonLabel: reasonLabels[refund.reason as RefundReason] ?? refund.reason,
    userNote: refund.userNote,
    reviewNote: refund.reviewNote,
    status: refund.status,
    statusLabel: statusLabels[refund.status],
    failureMessage: failureMessage(refund),
    refreshPending,
    createdAt: refund.createdAt.toISOString(),
    reviewedAt: refund.reviewedAt?.toISOString() ?? null,
    completedAt: refund.completedAt?.toISOString() ?? null,
  };
}

function adminRefund(refund: RefundRecord, refreshPending = false) {
  return {
    ...publicRefund(refund, refreshPending),
    order: {
      id: refund.order.id,
      orderNo: refund.order.orderNo,
      storeName: refund.order.storeName,
      status: refund.order.status,
      recipientName: refund.order.addressRecipientName,
      phone: maskPhone(refund.order.addressPhone),
    },
    providerRefundId: refund.providerRefundId,
    providerStatus: refund.providerStatus,
    failureReason: refund.failureReason,
    reviewedBy: refund.reviewedByAdmin
      ? { id: refund.reviewedByAdmin.id, displayName: refund.reviewedByAdmin.displayName }
      : null,
    applyAttemptCount: refund.applyAttemptCount,
    allowedActions: refund.status === 'PENDING_REVIEW' ? ['APPROVE', 'REJECT'] : [],
  };
}

function mapRepositoryError(error: unknown): never {
  if (error instanceof RefundNotFoundError) {
    throw refundError(404, ERROR_CODES.REFUND_NOT_FOUND, '退款申请不存在');
  }
  if (error instanceof RefundOrderStatusError) {
    throw refundError(409, ERROR_CODES.REFUND_NOT_ALLOWED, '当前订单不能申请或处理退款');
  }
  if (error instanceof RefundAlreadyExistsError) {
    throw refundError(409, ERROR_CODES.REFUND_ALREADY_EXISTS, '该订单已经存在退款申请');
  }
  if (error instanceof RefundDuplicateRequestError) {
    throw refundError(409, ERROR_CODES.DUPLICATE_REQUEST, '重复请求参数不一致');
  }
  if (error instanceof RefundStatusConflictError) {
    throw refundError(409, ERROR_CODES.INVALID_REFUND_STATUS, '当前退款状态不能执行该操作');
  }
  if (error instanceof RefundDataMismatchError) {
    throw refundError(400, ERROR_CODES.REFUND_NOTIFICATION_INVALID, '退款结果与订单不匹配');
  }
  throw error;
}

export class RefundService {
  constructor(private readonly provider: WechatRefundProvider) {}

  async apply(user: PublicUser, orderId: string, input: RefundApplicationInput) {
    const now = new Date();
    try {
      const result = await refundRepository.apply({
        userId: user.id,
        orderId,
        refundNo: generateRefundNo(now),
        requestId: input.requestId,
        requestFingerprint: createHash('sha256')
          .update(JSON.stringify({ orderId, reason: input.reason, note: input.note }))
          .digest('hex'),
        reason: input.reason,
        userNote: input.note,
        now,
      });
      return {
        idempotentReplay: result.idempotentReplay,
        refund: publicRefund(result.refund),
      };
    } catch (error) {
      if (error instanceof RefundNotFoundError) {
        throw refundError(404, ERROR_CODES.ORDER_NOT_FOUND, '订单不存在');
      }
      mapRepositoryError(error);
    }
  }

  async residentDetail(user: PublicUser, refundId: string) {
    const refund = await refundRepository.findResident(user.id, refundId);
    if (!refund) throw refundError(404, ERROR_CODES.REFUND_NOT_FOUND, '退款申请不存在');
    const refreshed = await this.refresh(refund);
    return publicRefund(refreshed.refund, refreshed.refreshPending);
  }

  async adminList(
    filters: { status?: RefundStatus; orderNo?: string },
    page: number,
    pageSize: number,
  ) {
    const result = await refundRepository.listAdmin(filters, page, pageSize);
    return {
      list: result.list.map((refund) => adminRefund(refund)),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  }

  async adminDetail(refundId: string) {
    const refund = await refundRepository.findAdmin(refundId);
    if (!refund) throw refundError(404, ERROR_CODES.REFUND_NOT_FOUND, '退款申请不存在');
    const refreshed = await this.refresh(refund);
    return adminRefund(refreshed.refund, refreshed.refreshPending);
  }

  async approve(refundId: string, actor: RefundActor, reviewNote: string | null) {
    let claim: Awaited<ReturnType<typeof refundRepository.claimApproval>>;
    try {
      claim = await refundRepository.claimApproval(refundId, actor, reviewNote);
    } catch (error) {
      mapRepositoryError(error);
    }
    if (claim.kind === 'SUCCESS') {
      return { idempotentReplay: true, refund: adminRefund(claim.refund) };
    }

    try {
      const result =
        claim.kind === 'QUERY'
          ? await this.provider.queryRefund(claim.refund.refundNo)
          : await this.provider.createRefund({
              transactionId: claim.refund.payment.transactionId!,
              outRefundNo: claim.refund.refundNo,
              reason: reasonLabels[claim.refund.reason as RefundReason] ?? '订单退款',
              amountRefund: amountToFen(claim.refund.amount),
              amountTotal: amountToFen(claim.refund.payment.amount),
              currency: 'CNY',
            });
      const applied = await this.applyProviderResult(claim.refund, result, claim.kind);
      return {
        idempotentReplay: claim.idempotentReplay || applied.idempotentReplay,
        refund: adminRefund(applied.refund),
      };
    } catch (error) {
      if (!(error instanceof WechatPaymentProviderError)) throw error;
      try {
        const confirmation = await this.provider.queryRefund(claim.refund.refundNo);
        const applied = await this.applyProviderResult(claim.refund, confirmation, 'QUERY');
        return {
          idempotentReplay: claim.idempotentReplay || applied.idempotentReplay,
          refund: adminRefund(applied.refund),
        };
      } catch {
        await refundRepository.recordProviderFailure(
          claim.refund.id,
          `refund_${claim.kind.toLowerCase()}_${error.reason}`,
        );
        throw refundError(503, ERROR_CODES.REFUND_UNAVAILABLE, '微信退款结果暂未确认，请稍后重试');
      }
    }
  }

  async reject(refundId: string, actor: RefundActor, reviewNote: string) {
    try {
      const result = await refundRepository.reject(refundId, actor, reviewNote);
      return {
        idempotentReplay: result.idempotentReplay,
        refund: adminRefund(result.refund),
      };
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  async notify(input: WechatNotificationRequest) {
    let notification: Awaited<ReturnType<WechatRefundProvider['verifyRefundNotification']>>;
    try {
      notification = await this.provider.verifyRefundNotification(input);
    } catch {
      throw refundError(400, ERROR_CODES.REFUND_NOTIFICATION_INVALID, '退款通知校验失败');
    }
    const expectedStatus = notification.eventType.replace('REFUND.', '');
    if (expectedStatus !== notification.status) {
      throw refundError(400, ERROR_CODES.REFUND_NOTIFICATION_INVALID, '退款通知状态不一致');
    }
    try {
      const target = await this.refundByNumber(notification.outRefundNo);
      const result = await refundRepository.applyProviderEvent(target.id, {
        result: notification,
        source: 'NOTIFY',
        notification: {
          id: notification.notificationId,
          eventType: notification.eventType,
          payloadDigest: notification.payloadDigest,
        },
      });
      return { received: true, idempotentReplay: result.idempotentReplay };
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  private async refundByNumber(outRefundNo: string): Promise<RefundRecord> {
    const refund = await refundRepository.findByRefundNo(outRefundNo);
    if (!refund) throw new RefundNotFoundError();
    return refund;
  }

  private async applyProviderResult(
    refund: RefundRecord,
    result: WechatRefundResult,
    source: 'APPLY' | 'QUERY',
  ) {
    try {
      return await refundRepository.applyProviderEvent(refund.id, { result, source });
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  private async refresh(
    refund: RefundRecord,
  ): Promise<{ refund: RefundRecord; refreshPending: boolean }> {
    if (refund.status !== 'APPROVED' && refund.status !== 'PROCESSING') {
      return { refund, refreshPending: false };
    }
    try {
      const result = await this.provider.queryRefund(refund.refundNo);
      const applied = await this.applyProviderResult(refund, result, 'QUERY');
      return { refund: applied.refund, refreshPending: false };
    } catch (error) {
      await refundRepository.recordProviderFailure(
        refund.id,
        error instanceof WechatPaymentProviderError
          ? `refund_query_${error.reason}`
          : 'refund_query_unavailable',
      );
      return {
        refund: (await refundRepository.findAdmin(refund.id)) ?? refund,
        refreshPending: true,
      };
    }
  }
}
