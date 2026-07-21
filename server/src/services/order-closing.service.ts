import { createHash } from 'node:crypto';

import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  PaymentAlreadyPaidError,
  PaymentCloseInProgressError,
  PaymentDataMismatchError,
  paymentRepository,
  PaymentOrderNotFoundError,
  PaymentOrderStatusError,
  PaymentRecordNotFoundError,
  type PaymentCloseActor,
  type PaymentCloseClaim,
} from '../repositories/payment.repository.js';
import {
  WechatPaymentProviderError,
  type WechatPaymentProvider,
  type WechatPaymentQueryResult,
} from '../providers/wechat-payment.provider.js';
import { successInput, validateSuccessIdentity } from './payment.service.js';

export interface CloseOrderResult {
  outcome: 'CANCELLED' | 'PAID';
  idempotentReplay: boolean;
}

export interface ExpiredOrderBatchResult {
  scanned: number;
  closed: number;
  paid: number;
  deferred: number;
}

interface OrderClosingOptions {
  leaseMs?: number;
  now?: () => Date;
}

function closeError(status: number, code: string, message: string): HttpError {
  return new HttpError(status, code, message);
}

function queryDigest(query: WechatPaymentQueryResult): string {
  return createHash('sha256').update(JSON.stringify(query)).digest('hex');
}

export class OrderClosingService {
  private readonly leaseMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly provider: WechatPaymentProvider,
    options: OrderClosingOptions = {},
  ) {
    this.leaseMs = options.leaseMs ?? 30_000;
    this.now = options.now ?? (() => new Date());
  }

  async closeResident(userId: string, orderId: string, reason: string): Promise<CloseOrderResult> {
    const result = await this.close({
      orderId,
      ownerUserId: userId,
      requireExpired: false,
      reason,
      actor: { type: 'USER', id: userId, name: null },
    });
    if (result.outcome === 'PAID') {
      throw closeError(409, ERROR_CODES.ORDER_ALREADY_PAID, '订单已经支付');
    }
    return result;
  }

  async closeAdmin(
    orderId: string,
    reason: string,
    actor: Omit<PaymentCloseActor, 'type'>,
  ): Promise<CloseOrderResult> {
    const result = await this.close({
      orderId,
      requireExpired: false,
      reason,
      actor: { type: 'ADMIN', ...actor },
    });
    if (result.outcome === 'PAID') {
      throw closeError(409, ERROR_CODES.ORDER_ALREADY_PAID, '订单已经支付');
    }
    return result;
  }

  async closeExpired(orderId: string): Promise<CloseOrderResult> {
    return this.close({
      orderId,
      requireExpired: true,
      reason: '支付超时，订单已自动关闭',
      actor: { type: 'SYSTEM', id: null, name: '超时关单任务' },
    });
  }

  async closeExpiredBatch(batchSize: number): Promise<ExpiredOrderBatchResult> {
    const candidates = await paymentRepository.listExpiredOrderIds(this.now(), batchSize);
    const result: ExpiredOrderBatchResult = {
      scanned: candidates.length,
      closed: 0,
      paid: 0,
      deferred: 0,
    };
    for (const candidate of candidates) {
      try {
        const closed = await this.closeExpired(candidate.id);
        if (closed.outcome === 'PAID') result.paid += 1;
        else result.closed += 1;
      } catch {
        result.deferred += 1;
      }
    }
    return result;
  }

  private async close(input: {
    orderId: string;
    ownerUserId?: string;
    requireExpired: boolean;
    reason: string;
    actor: PaymentCloseActor;
  }): Promise<CloseOrderResult> {
    let claim: PaymentCloseClaim;
    try {
      claim = await paymentRepository.claimClose({
        ...input,
        now: this.now(),
        leaseMs: this.leaseMs,
      });
    } catch (error) {
      this.mapRepositoryError(error);
    }
    if (claim.kind === 'ALREADY_CLOSED') {
      return { outcome: 'CANCELLED', idempotentReplay: true };
    }
    if (claim.kind === 'LOCAL') return this.finalize(claim);

    const firstQuery = await this.query(claim);
    if (firstQuery.success) return this.settlePaid(claim, firstQuery);
    if (firstQuery.tradeState === 'CLOSED') return this.finalize(claim);
    if (firstQuery.tradeState !== 'NOTPAY') {
      await paymentRepository.recordCloseFailure(
        claim.paymentId,
        `close_blocked_${firstQuery.tradeState.toLowerCase()}`,
        firstQuery.tradeState,
      );
      throw closeError(409, ERROR_CODES.PAYMENT_PROCESSING, '支付状态处理中，请稍后重试');
    }

    try {
      await this.provider.closeTransaction(claim.outTradeNo);
      return this.finalize(claim);
    } catch {
      const confirmation = await this.query(claim);
      if (confirmation.success) return this.settlePaid(claim, confirmation);
      if (confirmation.tradeState === 'CLOSED') return this.finalize(claim);
      await paymentRepository.recordCloseFailure(
        claim.paymentId,
        'close_result_unconfirmed',
        confirmation.tradeState,
      );
      throw closeError(
        503,
        ERROR_CODES.PAYMENT_CLOSE_UNCONFIRMED,
        '微信关单结果暂未确认，请稍后重试',
      );
    }
  }

  private async query(claim: Extract<PaymentCloseClaim, { kind: 'EXTERNAL' }>) {
    try {
      const result = await this.provider.queryTransaction(claim.outTradeNo);
      if (
        !this.provider.merchant ||
        result.appId !== this.provider.merchant.appId ||
        result.merchantId !== this.provider.merchant.merchantId ||
        result.outTradeNo !== claim.outTradeNo
      ) {
        throw new WechatPaymentProviderError('unavailable');
      }
      await paymentRepository.recordCloseQueryState(claim.paymentId, result.tradeState);
      return result;
    } catch (error) {
      await paymentRepository.recordCloseFailure(
        claim.paymentId,
        error instanceof WechatPaymentProviderError
          ? `close_query_${error.reason}`
          : 'close_query_unavailable',
      );
      throw closeError(503, ERROR_CODES.PAYMENT_UNAVAILABLE, '微信支付状态暂不可用');
    }
  }

  private async settlePaid(
    claim: Extract<PaymentCloseClaim, { kind: 'EXTERNAL' }>,
    query: WechatPaymentQueryResult,
  ): Promise<CloseOrderResult> {
    const paid = query.success;
    if (!paid) throw new Error('paid query result required');
    validateSuccessIdentity(this.provider, paid);
    try {
      const result = await paymentRepository.completeSuccess(
        successInput(paid, {
          notificationId: `query-${paid.transactionId}`,
          source: 'QUERY',
          eventType: 'TRANSACTION.QUERY.SUCCESS',
          payloadDigest: queryDigest(query),
        }),
      );
      return { outcome: 'PAID', idempotentReplay: result.idempotentReplay };
    } catch (error) {
      if (
        error instanceof PaymentRecordNotFoundError ||
        error instanceof PaymentDataMismatchError
      ) {
        await paymentRepository.recordCloseFailure(
          claim.paymentId,
          'close_query_payment_mismatch',
          query.tradeState,
        );
        throw closeError(
          503,
          ERROR_CODES.PAYMENT_CLOSE_UNCONFIRMED,
          '微信支付结果与订单暂不一致，请联系平台处理',
        );
      }
      throw error;
    }
  }

  private async finalize(
    claim: Extract<PaymentCloseClaim, { kind: 'LOCAL' | 'EXTERNAL' }>,
  ): Promise<CloseOrderResult> {
    try {
      const result = await paymentRepository.finalizeClose({
        orderId: claim.orderId,
        paymentId: claim.paymentId,
        reason: claim.reason,
        actor: claim.actor,
        closedAt: this.now(),
      });
      return { outcome: 'CANCELLED', idempotentReplay: result.idempotentReplay };
    } catch (error) {
      this.mapRepositoryError(error);
    }
  }

  private mapRepositoryError(error: unknown): never {
    if (error instanceof PaymentOrderNotFoundError) {
      throw closeError(404, ERROR_CODES.ORDER_NOT_FOUND, '订单不存在');
    }
    if (error instanceof PaymentAlreadyPaidError) {
      throw closeError(409, ERROR_CODES.ORDER_ALREADY_PAID, '订单已经支付');
    }
    if (error instanceof PaymentCloseInProgressError) {
      throw closeError(409, ERROR_CODES.PAYMENT_PROCESSING, '订单正在确认支付或关闭');
    }
    if (error instanceof PaymentOrderStatusError) {
      throw closeError(409, ERROR_CODES.INVALID_ORDER_STATUS, '当前订单状态不能关闭');
    }
    throw error;
  }
}
