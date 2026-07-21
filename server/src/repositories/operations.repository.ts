import { prisma } from '../config/database.js';
import type { OrderStatus, Prisma, RefundStatus } from '../generated/prisma/client.js';

export const effectivePaidOrderStatuses: OrderStatus[] = [
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'WAITING_DELIVERY',
  'DELIVERING',
  'COMPLETED',
  'REFUND_PENDING',
];

const activeRefundStatuses: RefundStatus[] = ['PENDING_REVIEW', 'APPROVED', 'PROCESSING'];

export interface DashboardWindow {
  todayStart: Date;
  todayEnd: Date;
  trendStart: Date;
}

export interface OperationLogFilters {
  module?: string;
  action?: string;
  operatorName?: string;
  businessDataId?: string;
  requestId?: string;
  createdFrom?: Date;
  createdTo?: Date;
}

export const operationsRepository = {
  async dashboard(window: DashboardWindow) {
    const today = { gte: window.todayStart, lt: window.todayEnd };
    const trend = { gte: window.trendStart, lt: window.todayEnd };
    const [
      totalStores,
      openStores,
      totalUsers,
      todayNewUsers,
      totalProducts,
      onSaleProducts,
      todayOrders,
      todayEffectiveOrders,
      todayPayments,
      todayRefunds,
      orderStatusCounts,
      activeRefunds,
      effectiveOrdersByStore,
      todayPaymentRows,
      todayRefundRows,
      trendPaymentRows,
      trendRefundRows,
    ] = await prisma.$transaction([
      prisma.store.count({ where: { deletedAt: null } }),
      prisma.store.count({ where: { deletedAt: null, status: 'OPEN' } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: today } }),
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.product.count({ where: { deletedAt: null, status: 'ON_SALE' } }),
      prisma.order.count({ where: { createdAt: today } }),
      prisma.order.count({
        where: { paidAt: today, status: { in: effectivePaidOrderStatuses } },
      }),
      prisma.payment.aggregate({
        where: { status: 'SUCCESS', succeededAt: today },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.refund.aggregate({
        where: { status: 'SUCCESS', completedAt: today },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: { status: { in: ['PAID', 'PREPARING', 'DELIVERING'] } },
        _count: { _all: true },
      }),
      prisma.refund.count({ where: { status: { in: activeRefundStatuses } } }),
      prisma.order.findMany({
        where: { paidAt: today, status: { in: effectivePaidOrderStatuses } },
        select: { storeId: true, storeName: true },
      }),
      prisma.payment.findMany({
        where: { status: 'SUCCESS', succeededAt: today },
        select: {
          amount: true,
          succeededAt: true,
          order: { select: { storeId: true, storeName: true } },
        },
      }),
      prisma.refund.findMany({
        where: { status: 'SUCCESS', completedAt: today },
        select: {
          amount: true,
          completedAt: true,
          order: { select: { storeId: true, storeName: true } },
        },
      }),
      prisma.payment.findMany({
        where: { status: 'SUCCESS', succeededAt: trend },
        select: { amount: true, succeededAt: true },
      }),
      prisma.refund.findMany({
        where: { status: 'SUCCESS', completedAt: trend },
        select: { amount: true, completedAt: true },
      }),
    ]);

    return {
      totalStores,
      openStores,
      totalUsers,
      todayNewUsers,
      totalProducts,
      onSaleProducts,
      todayOrders,
      todayEffectiveOrders,
      todayPayments,
      todayRefunds,
      orderStatusCounts,
      activeRefunds,
      effectiveOrdersByStore,
      todayPaymentRows,
      todayRefundRows,
      trendPaymentRows,
      trendRefundRows,
    };
  },

  async listOperationLogs(filters: OperationLogFilters, page: number, pageSize: number) {
    const where: Prisma.OperationLogWhereInput = {
      ...(filters.module ? { module: filters.module } : {}),
      ...(filters.action ? { action: { contains: filters.action } } : {}),
      ...(filters.operatorName ? { operatorName: { contains: filters.operatorName } } : {}),
      ...(filters.businessDataId ? { businessDataId: { contains: filters.businessDataId } } : {}),
      ...(filters.requestId ? { requestId: filters.requestId } : {}),
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
      prisma.operationLog.findMany({
        where,
        select: {
          id: true,
          adminId: true,
          operatorName: true,
          module: true,
          action: true,
          businessDataId: true,
          description: true,
          requestIp: true,
          requestPath: true,
          requestId: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.operationLog.count({ where }),
    ]);
    return { list, total };
  },

  findOperationLog(id: string) {
    return prisma.operationLog.findUnique({ where: { id } });
  },
};
