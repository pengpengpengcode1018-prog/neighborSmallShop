import { http } from './http';
import type { ApiSuccess, PageResult } from '../types/api';
import type { OrderStatus } from './orders';

export type RefundStatus =
  'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export interface AdminRefund {
  id: string;
  refundNo: string;
  order: {
    id: string;
    orderNo: string;
    storeName: string;
    status: OrderStatus;
    recipientName: string;
    phone: string;
  };
  amount: string;
  currency: 'CNY';
  reason: string;
  reasonLabel: string;
  userNote: string | null;
  reviewNote: string | null;
  status: RefundStatus;
  statusLabel: string;
  failureMessage: string | null;
  refreshPending: boolean;
  createdAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
  providerRefundId: string | null;
  providerStatus: string | null;
  failureReason: string | null;
  reviewedBy: { id: string; displayName: string } | null;
  applyAttemptCount: number;
  allowedActions: Array<'APPROVE' | 'REJECT'>;
}

export interface AdminRefundQuery {
  page: number;
  pageSize: number;
  status?: RefundStatus;
  orderNo?: string;
}

export async function listRefunds(query: AdminRefundQuery): Promise<PageResult<AdminRefund>> {
  const response = await http.get<ApiSuccess<PageResult<AdminRefund>>>('/admin/refunds', {
    params: query,
  });
  return response.data.data;
}

export async function getRefund(refundId: string): Promise<AdminRefund> {
  const response = await http.get<ApiSuccess<AdminRefund>>(`/admin/refunds/${refundId}`);
  return response.data.data;
}

export async function approveRefund(
  refundId: string,
  reviewNote: string | null,
): Promise<{ idempotentReplay: boolean; refund: AdminRefund }> {
  const response = await http.post<ApiSuccess<{ idempotentReplay: boolean; refund: AdminRefund }>>(
    `/admin/refunds/${refundId}/approve`,
    { reviewNote },
  );
  return response.data.data;
}

export async function rejectRefund(
  refundId: string,
  reviewNote: string,
): Promise<{ idempotentReplay: boolean; refund: AdminRefund }> {
  const response = await http.post<ApiSuccess<{ idempotentReplay: boolean; refund: AdminRefund }>>(
    `/admin/refunds/${refundId}/reject`,
    { reviewNote },
  );
  return response.data.data;
}
