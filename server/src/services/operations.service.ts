import { ERROR_CODES } from '../constants/error-codes.js';
import { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { publicAuditJson } from '../repositories/audit.repository.js';
import {
  operationsRepository,
  type OperationLogFilters,
} from '../repositories/operations.repository.js';

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function shanghaiDate(value: Date): string {
  return shanghaiDateFormatter.format(value);
}

function localDateOffset(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function startOfShanghaiDate(date: string): Date {
  return new Date(`${date}T00:00:00+08:00`);
}

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function countStatus(
  groups: Array<{ status: string; _count: { _all: number } }>,
  status: string,
): number {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

function serializeOperationLog<T extends { createdAt: Date }>(log: T) {
  return { ...log, createdAt: log.createdAt.toISOString() };
}

export const operationsService = {
  async dashboard(trendDays: 7 | 30, now = new Date()) {
    const businessDate = shanghaiDate(now);
    const firstTrendDate = localDateOffset(businessDate, -(trendDays - 1));
    const todayStart = startOfShanghaiDate(businessDate);
    const todayEnd = startOfShanghaiDate(localDateOffset(businessDate, 1));
    const result = await operationsRepository.dashboard({
      todayStart,
      todayEnd,
      trendStart: startOfShanghaiDate(firstTrendDate),
    });

    const grossAmount = result.todayPayments._sum.amount ?? zero();
    const refundAmount = result.todayRefunds._sum.amount ?? zero();
    const daily = new Map<
      string,
      { successfulPayments: number; grossAmount: Prisma.Decimal; refundAmount: Prisma.Decimal }
    >();
    for (let index = 0; index < trendDays; index += 1) {
      daily.set(localDateOffset(firstTrendDate, index), {
        successfulPayments: 0,
        grossAmount: zero(),
        refundAmount: zero(),
      });
    }
    for (const payment of result.trendPaymentRows) {
      if (!payment.succeededAt) continue;
      const bucket = daily.get(shanghaiDate(payment.succeededAt));
      if (!bucket) continue;
      bucket.successfulPayments += 1;
      bucket.grossAmount = bucket.grossAmount.add(payment.amount);
    }
    for (const refund of result.trendRefundRows) {
      if (!refund.completedAt) continue;
      const bucket = daily.get(shanghaiDate(refund.completedAt));
      if (!bucket) continue;
      bucket.refundAmount = bucket.refundAmount.add(refund.amount);
    }

    const stores = new Map<
      string,
      {
        storeId: string;
        storeName: string;
        effectivePaidOrders: number;
        grossAmount: Prisma.Decimal;
        refundAmount: Prisma.Decimal;
      }
    >();
    const storeBucket = (storeId: string, storeName: string) => {
      const existing = stores.get(storeId);
      if (existing) return existing;
      const created = {
        storeId,
        storeName,
        effectivePaidOrders: 0,
        grossAmount: zero(),
        refundAmount: zero(),
      };
      stores.set(storeId, created);
      return created;
    };
    for (const order of result.effectiveOrdersByStore) {
      storeBucket(order.storeId, order.storeName).effectivePaidOrders += 1;
    }
    for (const payment of result.todayPaymentRows) {
      const bucket = storeBucket(payment.order.storeId, payment.order.storeName);
      bucket.grossAmount = bucket.grossAmount.add(payment.amount);
    }
    for (const refund of result.todayRefundRows) {
      const bucket = storeBucket(refund.order.storeId, refund.order.storeName);
      bucket.refundAmount = bucket.refundAmount.add(refund.amount);
    }

    return {
      businessDate,
      timeZone: 'Asia/Shanghai',
      generatedAt: now.toISOString(),
      definitions: {
        effectivePaidOrders:
          '支付时间落在业务日内，且当前未退款成功；退款审核中仍计为有效支付订单。',
        transactionAmount:
          '净成交额 = 业务日内成功支付金额 - 业务日内退款成功金额；退款审核中不扣减。',
        todayOrders: '按订单创建时间统计，包含未支付和已取消订单。',
      },
      overview: {
        totalStores: result.totalStores,
        openStores: result.openStores,
        totalUsers: result.totalUsers,
        todayNewUsers: result.todayNewUsers,
        totalProducts: result.totalProducts,
        onSaleProducts: result.onSaleProducts,
        todayOrders: result.todayOrders,
        todayEffectivePaidOrders: result.todayEffectiveOrders,
        todaySuccessfulPayments: result.todayPayments._count,
        todayGrossAmount: grossAmount.toFixed(2),
        todaySuccessfulRefunds: result.todayRefunds._count,
        todayRefundAmount: refundAmount.toFixed(2),
        todayNetAmount: grossAmount.sub(refundAmount).toFixed(2),
        pendingAcceptanceOrders: countStatus(result.orderStatusCounts, 'PAID'),
        preparingOrders: countStatus(result.orderStatusCounts, 'PREPARING'),
        deliveringOrders: countStatus(result.orderStatusCounts, 'DELIVERING'),
        refundInProgressOrders: result.activeRefunds,
      },
      trend: Array.from(daily, ([date, bucket]) => ({
        date,
        successfulPayments: bucket.successfulPayments,
        grossAmount: bucket.grossAmount.toFixed(2),
        refundAmount: bucket.refundAmount.toFixed(2),
        netAmount: bucket.grossAmount.sub(bucket.refundAmount).toFixed(2),
      })),
      stores: Array.from(stores.values())
        .sort((left, right) => {
          const amountOrder = right.grossAmount
            .sub(right.refundAmount)
            .comparedTo(left.grossAmount.sub(left.refundAmount));
          return amountOrder || right.effectivePaidOrders - left.effectivePaidOrders;
        })
        .slice(0, 10)
        .map((store) => ({
          storeId: store.storeId,
          storeName: store.storeName,
          effectivePaidOrders: store.effectivePaidOrders,
          grossAmount: store.grossAmount.toFixed(2),
          refundAmount: store.refundAmount.toFixed(2),
          netAmount: store.grossAmount.sub(store.refundAmount).toFixed(2),
        })),
    };
  },

  async listOperationLogs(filters: OperationLogFilters, page: number, pageSize: number) {
    const result = await operationsRepository.listOperationLogs(filters, page, pageSize);
    return {
      list: result.list.map(serializeOperationLog),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  },

  async operationLogDetail(id: string) {
    const log = await operationsRepository.findOperationLog(id);
    if (!log) throw new HttpError(404, ERROR_CODES.NOT_FOUND, '操作日志不存在');
    return {
      ...serializeOperationLog(log),
      beforeData: publicAuditJson(log.beforeData),
      afterData: publicAuditJson(log.afterData),
    };
  },
};
