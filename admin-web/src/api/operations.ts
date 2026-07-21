import { http } from './http';
import type { ApiSuccess } from '../types/api';

export interface OperationsDashboard {
  businessDate: string;
  timeZone: 'Asia/Shanghai';
  generatedAt: string;
  definitions: {
    effectivePaidOrders: string;
    transactionAmount: string;
    todayOrders: string;
  };
  overview: {
    totalStores: number;
    openStores: number;
    totalUsers: number;
    todayNewUsers: number;
    totalProducts: number;
    onSaleProducts: number;
    todayOrders: number;
    todayEffectivePaidOrders: number;
    todaySuccessfulPayments: number;
    todayGrossAmount: string;
    todaySuccessfulRefunds: number;
    todayRefundAmount: string;
    todayNetAmount: string;
    pendingAcceptanceOrders: number;
    preparingOrders: number;
    deliveringOrders: number;
    refundInProgressOrders: number;
  };
  trend: Array<{
    date: string;
    successfulPayments: number;
    grossAmount: string;
    refundAmount: string;
    netAmount: string;
  }>;
  stores: Array<{
    storeId: string;
    storeName: string;
    effectivePaidOrders: number;
    grossAmount: string;
    refundAmount: string;
    netAmount: string;
  }>;
}

export interface OperationLogSummary {
  id: string;
  adminId: string | null;
  operatorName: string;
  module: string;
  action: string;
  businessDataId: string | null;
  description: string;
  requestIp: string | null;
  requestPath: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface OperationLogDetail extends OperationLogSummary {
  beforeData: unknown;
  afterData: unknown;
}

export interface OperationLogQuery {
  module?: string;
  action?: string;
  operatorName?: string;
  businessDataId?: string;
  requestId?: string;
  createdFrom?: string;
  createdTo?: string;
  page: number;
  pageSize: number;
}

export async function getOperationsDashboard(trendDays: 7 | 30): Promise<OperationsDashboard> {
  const response = await http.get<ApiSuccess<OperationsDashboard>>('/admin/operations/dashboard', {
    params: { trendDays },
  });
  return response.data.data;
}

export async function listOperationLogs(query: OperationLogQuery) {
  const response = await http.get<
    ApiSuccess<{
      list: OperationLogSummary[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    }>
  >('/admin/operation-logs', { params: query });
  return response.data.data;
}

export async function getOperationLog(id: string): Promise<OperationLogDetail> {
  const response = await http.get<ApiSuccess<OperationLogDetail>>(`/admin/operation-logs/${id}`);
  return response.data.data;
}
