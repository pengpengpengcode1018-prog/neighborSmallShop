import { http } from './http';
import type { ApiSuccess, PageResult } from '../types/api';

export type AdminAlertType = 'NEW_PAID_ORDER' | 'UNACCEPTED_ORDER' | 'REFUND_REQUEST' | 'LOW_STOCK';
export type AdminAlertStatus = 'UNREAD' | 'READ' | 'RESOLVED';
export type AdminAlertSeverity = 'INFO' | 'WARNING' | 'URGENT';

export interface AdminAlert {
  id: string;
  type: AdminAlertType;
  resourceType: 'order' | 'refund' | 'product';
  resourceId: string;
  title: string;
  message: string;
  severity: AdminAlertSeverity;
  status: AdminAlertStatus;
  occurredAt: string;
  readAt: string | null;
  resolvedAt: string | null;
}

export interface AdminAlertSummary {
  unread: number;
  byType: Record<AdminAlertType, number>;
  latestSoundEvent: {
    id: string;
    type: 'NEW_PAID_ORDER' | 'UNACCEPTED_ORDER';
    occurredAt: string;
  } | null;
}

export async function listAlerts(query: {
  page: number;
  pageSize: number;
  type?: AdminAlertType;
  status?: AdminAlertStatus;
}): Promise<PageResult<AdminAlert>> {
  const response = await http.get<ApiSuccess<PageResult<AdminAlert>>>('/admin/alerts', {
    params: query,
  });
  return response.data.data;
}

export async function getAlertSummary(): Promise<AdminAlertSummary> {
  const response = await http.get<ApiSuccess<AdminAlertSummary>>('/admin/alerts/summary');
  return response.data.data;
}

export async function markAlertRead(alertId: string): Promise<AdminAlert> {
  const response = await http.post<ApiSuccess<AdminAlert>>(`/admin/alerts/${alertId}/read`);
  return response.data.data;
}
