import { http } from './http';
import type { ApiSuccess, PageResult } from '../types/api';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'WAITING_DELIVERY'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED';
export type DeliveryType = 'ASAP' | 'SCHEDULED';
export type AdminOrderAction =
  'CLOSE' | 'ACCEPT' | 'START_PREPARING' | 'MARK_READY' | 'START_DELIVERY' | 'COMPLETE';

export interface AdminOrderCard {
  id: string;
  orderNo: string;
  user: { id: string; nickname: string | null; phone: string };
  store: { id: string; name: string };
  communityName: string;
  productSummary: {
    items: Array<{ productId: string; name: string; imageUrl: string | null; quantity: number }>;
    totalQuantity: number;
    distinctCount: number;
  };
  merchandiseTotal: string;
  deliveryFee: string;
  payableTotal: string;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUND_PENDING' | 'REFUNDED';
  status: OrderStatus;
  statusLabel: string;
  deliveryType: DeliveryType;
  deliveryDate: string | null;
  deliveryTime: string | null;
  createdAt: string;
  paidAt: string | null;
  allowedActions: AdminOrderAction[];
}

export interface AdminOrderDetail extends Omit<AdminOrderCard, 'user' | 'store'> {
  user: { id: string; nickname: string | null };
  store: { id: string; name: string; logoUrl: string | null; phone: string | null };
  address: {
    recipientName: string;
    phone: string;
    communityName: string;
    building: string;
    unit: string | null;
    room: string;
    detail: string | null;
    fullAddress: string;
  };
  items: Array<{
    productId: string;
    name: string;
    imageUrl: string | null;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
  }>;
  delivery: { type: DeliveryType; date: string | null; time: string | null };
  remark: string | null;
  adminRemark: string | null;
  summary: { merchandiseTotal: string; deliveryFee: string; payableTotal: string };
  cancellationReason: string | null;
  timestamps: Record<string, string | null>;
  statusLogs: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    operatorType: 'USER' | 'ADMIN' | 'SYSTEM' | 'WECHAT';
    operatorId: string | null;
    operatorName: string | null;
    description: string;
    createdAt: string;
  }>;
  operationLogs: Array<{
    id: string;
    operatorName: string;
    action: string;
    description: string;
    createdAt: string;
  }>;
}

export interface AdminOrderQuery {
  page: number;
  pageSize: number;
  orderNo?: string;
  phone?: string;
  storeId?: string;
  communityName?: string;
  status?: OrderStatus;
  deliveryType?: DeliveryType;
  createdFrom?: string;
  createdTo?: string;
}

export async function listOrders(query: AdminOrderQuery): Promise<PageResult<AdminOrderCard>> {
  const response = await http.get<ApiSuccess<PageResult<AdminOrderCard>>>('/admin/orders', {
    params: query,
  });
  return response.data.data;
}

export async function getOrder(orderId: string): Promise<AdminOrderDetail> {
  const response = await http.get<ApiSuccess<AdminOrderDetail>>(`/admin/orders/${orderId}`);
  return response.data.data;
}

export async function transitionOrder(
  orderId: string,
  input: { action: AdminOrderAction; expectedStatus: OrderStatus; remark?: string },
): Promise<{ idempotentReplay: boolean; order: AdminOrderDetail }> {
  const response = await http.post<
    ApiSuccess<{ idempotentReplay: boolean; order: AdminOrderDetail }>
  >(`/admin/orders/${orderId}/status`, input);
  return response.data.data;
}

export async function updateOrderRemark(
  orderId: string,
  remark: string | null,
): Promise<AdminOrderDetail> {
  const response = await http.put<ApiSuccess<AdminOrderDetail>>(`/admin/orders/${orderId}/remark`, {
    remark,
  });
  return response.data.data;
}
