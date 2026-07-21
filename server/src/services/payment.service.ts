import { createHash } from 'node:crypto';

import { ERROR_CODES } from '../constants/error-codes.js';
import { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  PaymentAlreadyPaidError,
  PaymentDataMismatchError,
  PaymentInProgressError,
  PaymentOrderNotFoundError,
  PaymentOrderStatusError,
  paymentRepository,
  PaymentRecordNotFoundError,
  type PaymentSuccessInput,
  type ResidentOrderPaymentRecord,
} from '../repositories/payment.repository.js';
import {
  WechatPaymentProviderError,
  type WechatPaymentNotification,
  type WechatPaymentProvider,
  type WechatPaymentSuccess,
} from '../providers/wechat-payment.provider.js';
import type { PublicUser } from '../types/api.js';

function paymentError(status: number, code: string, message: string): HttpError {
  return new HttpError(status, code, message);
}

function amountToFen(amount: Prisma.Decimal): number {
  return amount.mul(100).toNumber();
}

export function validateSuccessIdentity(
  provider: WechatPaymentProvider,
  success: WechatPaymentSuccess,
): void {
  if (
    !provider.merchant ||
    success.appId !== provider.merchant.appId ||
    success.merchantId !== provider.merchant.merchantId
  ) {
    throw paymentError(400, ERROR_CODES.PAYMENT_NOTIFICATION_INVALID, '支付通知身份校验失败');
  }
}

export function successInput(
  success: WechatPaymentSuccess,
  options: {
    notificationId: string;
    source: 'NOTIFY' | 'QUERY';
    eventType: string;
    payloadDigest: string;
  },
): PaymentSuccessInput {
  const successTime = new Date(success.successTime);
  if (Number.isNaN(successTime.getTime())) {
    throw paymentError(400, ERROR_CODES.PAYMENT_NOTIFICATION_INVALID, '支付完成时间不正确');
  }
  return {
    ...options,
    outTradeNo: success.outTradeNo,
    transactionId: success.transactionId,
    amount: new Prisma.Decimal(success.amountTotal).div(100),
    currency: success.currency,
    successTime,
  };
}

function serializeStatus(order: ResidentOrderPaymentRecord) {
  const payment = order.payment;
  const paymentStatus =
    order.status === 'PAID' || payment?.status === 'SUCCESS'
      ? 'PAID'
      : payment?.status === 'CREATING' ||
          payment?.status === 'PENDING' ||
          payment?.status === 'CLOSING'
        ? 'PENDING'
        : payment?.status === 'FAILED' || payment?.status === 'CLOSED'
          ? 'FAILED'
          : 'UNPAID';
  return {
    orderId: order.id,
    orderStatus: order.status,
    paymentStatus,
    paidAt: order.paidAt?.toISOString() ?? null,
    expiresAt: order.expiresAt.toISOString(),
    transactionId: payment?.transactionId ?? null,
    tradeState: payment?.tradeState ?? null,
  };
}

function mapRepositoryError(error: unknown): never {
  if (error instanceof PaymentOrderNotFoundError) {
    throw paymentError(404, ERROR_CODES.ORDER_NOT_FOUND, '订单不存在');
  }
  if (error instanceof PaymentAlreadyPaidError) {
    throw paymentError(409, ERROR_CODES.ORDER_ALREADY_PAID, '订单已经支付');
  }
  if (error instanceof PaymentInProgressError) {
    throw paymentError(409, ERROR_CODES.PAYMENT_PROCESSING, '支付单正在创建，请稍后重试');
  }
  if (error instanceof PaymentOrderStatusError) {
    throw paymentError(409, ERROR_CODES.INVALID_ORDER_STATUS, '当前订单状态不能支付');
  }
  if (error instanceof PaymentRecordNotFoundError || error instanceof PaymentDataMismatchError) {
    throw paymentError(400, ERROR_CODES.PAYMENT_NOTIFICATION_INVALID, '支付通知与订单不匹配');
  }
  throw error;
}

export class PaymentService {
  constructor(private readonly provider: WechatPaymentProvider) {}

  async initialize(user: PublicUser, orderId: string) {
    let prepared: Awaited<ReturnType<typeof paymentRepository.prepare>>;
    try {
      prepared = await paymentRepository.prepare(user.id, orderId);
    } catch (error) {
      mapRepositoryError(error);
    }
    if (!prepared.shouldCreate && prepared.payment.prepayId) {
      return {
        paymentId: prepared.payment.id,
        orderId: prepared.order.id,
        amount: prepared.payment.amount.toFixed(2),
        parameters: this.provider.buildClientParameters(prepared.payment.prepayId),
        idempotentReplay: true,
      };
    }

    try {
      const created = await this.provider.createTransaction({
        orderNo: prepared.order.orderNo,
        description: `近邻小铺子-${prepared.order.storeName}`.slice(0, 127),
        amountTotal: amountToFen(prepared.order.payableTotal),
        openId: prepared.order.user.wechatOpenId,
        expiresAt: prepared.order.expiresAt,
      });
      const prepayExpiresAt = new Date(
        Math.min(prepared.order.expiresAt.getTime(), Date.now() + 2 * 60 * 60 * 1000),
      );
      await paymentRepository.attachPrepay(prepared.payment.id, created.prepayId, prepayExpiresAt);
      return {
        paymentId: prepared.payment.id,
        orderId: prepared.order.id,
        amount: prepared.payment.amount.toFixed(2),
        parameters: created.clientParameters,
        idempotentReplay: false,
      };
    } catch (error) {
      const reason = error instanceof WechatPaymentProviderError ? error.reason : 'unavailable';
      await paymentRepository.markInitializationFailed(prepared.payment.id, reason);
      throw paymentError(
        reason === 'rejected' ? 502 : 503,
        reason === 'rejected' ? ERROR_CODES.PAYMENT_FAILED : ERROR_CODES.PAYMENT_UNAVAILABLE,
        reason === 'rejected' ? '微信支付拒绝了本次下单' : '微信支付暂时不可用',
      );
    }
  }

  async notify(input: Parameters<WechatPaymentProvider['verifyNotification']>[0]) {
    let notification: WechatPaymentNotification;
    try {
      notification = await this.provider.verifyNotification(input);
    } catch {
      throw paymentError(400, ERROR_CODES.PAYMENT_NOTIFICATION_INVALID, '支付通知验签失败');
    }
    validateSuccessIdentity(this.provider, notification);
    try {
      const result = await paymentRepository.completeSuccess(
        successInput(notification, {
          notificationId: notification.notificationId,
          source: 'NOTIFY',
          eventType: notification.eventType,
          payloadDigest: notification.payloadDigest,
        }),
      );
      return { accepted: true, idempotentReplay: result.idempotentReplay };
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  async status(user: PublicUser, orderId: string) {
    let order = await paymentRepository.findResidentOrderPayment(user.id, orderId);
    if (!order) throw paymentError(404, ERROR_CODES.ORDER_NOT_FOUND, '订单不存在');
    if (!order.payment || order.status === 'PAID' || order.payment.status === 'SUCCESS') {
      return serializeStatus(order);
    }

    try {
      const query = await this.provider.queryTransaction(order.payment.outTradeNo);
      if (query.success) {
        validateSuccessIdentity(this.provider, query.success);
        const digest = createHash('sha256').update(JSON.stringify(query.success)).digest('hex');
        await paymentRepository.completeSuccess(
          successInput(query.success, {
            notificationId: `query-${query.success.transactionId}`,
            source: 'QUERY',
            eventType: 'TRANSACTION.QUERY.SUCCESS',
            payloadDigest: digest,
          }),
        );
      } else {
        await paymentRepository.recordQueryState(order.payment.id, query.tradeState);
      }
    } catch (error) {
      if (
        error instanceof PaymentDataMismatchError ||
        error instanceof PaymentOrderStatusError ||
        error instanceof PaymentRecordNotFoundError
      ) {
        mapRepositoryError(error);
      }
      if (!(error instanceof WechatPaymentProviderError)) throw error;
    }
    order = await paymentRepository.findResidentOrderPayment(user.id, orderId);
    if (!order) throw paymentError(404, ERROR_CODES.ORDER_NOT_FOUND, '订单不存在');
    return serializeStatus(order);
  }
}
