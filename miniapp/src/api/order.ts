import type {
  CancelOrderResult,
  ApplyRefundResult,
  CreateOrderResult,
  OrderPreview,
  OrderSelection,
  OrderStatus,
  ResidentOrderDetail,
  ResidentOrderListResult,
  ResidentRefundDetail,
  RefundReason,
  InitializeWechatPaymentResult,
  WechatPaymentStatusResult,
} from '../types/domain';
import { request } from '../utils/request';

function authorization(token: string) {
  return { authorization: `Bearer ${token}` };
}

export function previewOrder(token: string, selection: OrderSelection): Promise<OrderPreview> {
  return request<OrderPreview>('/orders/preview', {
    method: 'POST',
    header: authorization(token),
    data: selection,
  });
}

export function createOrder(
  token: string,
  input: OrderSelection & {
    requestId: string;
    expectedPreviewVersion: string;
    expectedPayableAmount: string;
  },
): Promise<CreateOrderResult> {
  return request<CreateOrderResult>('/orders', {
    method: 'POST',
    header: authorization(token),
    data: input,
  });
}

export function listOrders(token: string, status?: OrderStatus): Promise<ResidentOrderListResult> {
  const query = status ? `&status=${status}` : '';
  return request<ResidentOrderListResult>(`/orders?page=1&pageSize=50${query}`, {
    header: authorization(token),
  });
}

export function getOrder(token: string, orderId: string): Promise<ResidentOrderDetail> {
  return request<ResidentOrderDetail>(`/orders/${encodeURIComponent(orderId)}`, {
    header: authorization(token),
  });
}

export function cancelOrder(
  token: string,
  orderId: string,
  reason: string | null,
): Promise<CancelOrderResult> {
  return request<CancelOrderResult>(`/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    header: authorization(token),
    data: { reason },
  });
}

export function initializeWechatPayment(
  token: string,
  orderId: string,
): Promise<InitializeWechatPaymentResult> {
  return request<InitializeWechatPaymentResult>('/payments/wechat', {
    method: 'POST',
    header: authorization(token),
    data: { orderId },
  });
}

export function getWechatPaymentStatus(
  token: string,
  orderId: string,
): Promise<WechatPaymentStatusResult> {
  return request<WechatPaymentStatusResult>(
    `/payments/orders/${encodeURIComponent(orderId)}/status`,
    { header: authorization(token) },
  );
}

export function applyRefund(
  token: string,
  orderId: string,
  input: { requestId: string; reason: RefundReason; note: string | null },
): Promise<ApplyRefundResult> {
  return request<ApplyRefundResult>(`/orders/${encodeURIComponent(orderId)}/refunds`, {
    method: 'POST',
    header: authorization(token),
    data: input,
  });
}

export function getRefund(token: string, refundId: string): Promise<ResidentRefundDetail> {
  return request<ResidentRefundDetail>(`/refunds/${encodeURIComponent(refundId)}`, {
    header: authorization(token),
  });
}
