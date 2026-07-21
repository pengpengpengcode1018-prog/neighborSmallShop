import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateOrderResult,
  OrderPreview,
  OrderSelection,
  OrderStatus,
  ResidentOrderCard,
  ResidentOrderDetail,
  ResidentRefundDetail,
} from '../src/types/domain';
import { ApiRequestError } from '../src/utils/request';

const api = vi.hoisted(() => ({
  previewOrder: vi.fn(),
  createOrder: vi.fn(),
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  cancelOrder: vi.fn(),
  initializeWechatPayment: vi.fn(),
  getWechatPaymentStatus: vi.fn(),
  applyRefund: vi.fn(),
  getRefund: vi.fn(),
}));

vi.mock('../src/api/order', () => api);

import { useOrderStore } from '../src/stores/order';

const selection: OrderSelection = {
  addressId: 'address-current',
  deliveryType: 'ASAP',
  deliveryDate: null,
  deliverySlotId: null,
  remark: null,
};

function orderPreview(payableTotal = '27.00', previewVersion = 'a'.repeat(64)): OrderPreview {
  return {
    previewVersion,
    store: { id: 'store-current', name: '阳光生鲜' },
    address: {
      id: selection.addressId,
      recipientName: '张三',
      phone: '13812345678',
      communityName: '阳光小区',
      building: '1号楼',
      unit: '2单元',
      room: '301室',
      detail: null,
      fullAddress: '阳光小区 1号楼 2单元 301室',
    },
    items: [
      {
        productId: 'product-current',
        name: '鲜牛奶',
        imageUrl: null,
        unitPrice: '12.00',
        quantity: 2,
        lineTotal: '24.00',
      },
    ],
    delivery: {
      type: 'ASAP',
      date: null,
      time: null,
      estimatedDeliveryMinutes: 30,
    },
    remark: null,
    summary: {
      merchandiseTotal: '24.00',
      deliveryFee: '3.00',
      payableTotal,
      minimumOrderAmount: '20.00',
    },
  };
}

function createdResult(): CreateOrderResult {
  const preview = orderPreview();
  return {
    idempotentReplay: false,
    order: {
      id: 'order-current',
      orderNo: 'NS20260717A1B2C3D4E5',
      status: 'PENDING_PAYMENT',
      store: preview.store,
      address: {
        recipientName: preview.address.recipientName,
        phone: preview.address.phone,
        communityName: preview.address.communityName,
        building: preview.address.building,
        unit: preview.address.unit,
        room: preview.address.room,
        detail: preview.address.detail,
        fullAddress: preview.address.fullAddress,
      },
      items: preview.items,
      delivery: { type: 'ASAP', date: null, time: null },
      remark: null,
      summary: {
        merchandiseTotal: '24.00',
        deliveryFee: '3.00',
        payableTotal: '27.00',
      },
      expiresAt: '2026-07-17T06:15:00.000Z',
      createdAt: '2026-07-17T06:00:00.000Z',
    },
  };
}

function orderCard(status: OrderStatus = 'PENDING_PAYMENT', isExpired = false): ResidentOrderCard {
  const labels: Record<OrderStatus, string> = {
    PENDING_PAYMENT: '待付款',
    PAID: '待接单',
    ACCEPTED: '已接单',
    PREPARING: '备货中',
    WAITING_DELIVERY: '待配送',
    DELIVERING: '配送中',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    REFUND_PENDING: '退款中',
    REFUNDED: '已退款',
  };
  return {
    id: 'order-current',
    orderNo: 'NS20260717A1B2C3D4E5',
    store: { id: 'store-current', name: '阳光生鲜', logoUrl: null },
    productSummary: {
      items: [{ productId: 'product-current', name: '鲜牛奶', imageUrl: null, quantity: 2 }],
      totalQuantity: 2,
      distinctCount: 1,
    },
    payableAmount: '27.00',
    status,
    statusLabel: isExpired ? '关闭处理中' : labels[status],
    createdAt: '2026-07-17T06:00:00.000Z',
    expiresAt: '2026-07-17T06:15:00.000Z',
    isExpired,
    allowedActions:
      status === 'PENDING_PAYMENT' && !isExpired
        ? ['PAY', 'CANCEL']
        : status === 'PAID'
          ? ['REFUND']
          : [],
  };
}

function orderDetail(status: OrderStatus = 'PENDING_PAYMENT'): ResidentOrderDetail {
  const preview = orderPreview();
  return {
    ...orderCard(status),
    store: { ...orderCard(status).store, phone: '13700000000' },
    address: {
      recipientName: preview.address.recipientName,
      phone: preview.address.phone,
      communityName: preview.address.communityName,
      building: preview.address.building,
      unit: preview.address.unit,
      room: preview.address.room,
      detail: preview.address.detail,
      fullAddress: preview.address.fullAddress,
    },
    items: preview.items,
    delivery: { type: 'ASAP', date: null, time: null },
    remark: null,
    summary: {
      merchandiseTotal: '24.00',
      deliveryFee: '3.00',
      payableTotal: '27.00',
    },
    cancellationReason: status === 'CANCELLED' ? '不需要了' : null,
    timestamps: {
      createdAt: '2026-07-17T06:00:00.000Z',
      paidAt: status === 'PAID' ? '2026-07-17T06:01:00.000Z' : null,
      acceptedAt: null,
      preparingAt: null,
      waitingDeliveryAt: null,
      deliveringAt: null,
      completedAt: null,
      cancelledAt: status === 'CANCELLED' ? '2026-07-17T06:02:00.000Z' : null,
      refundedAt: status === 'REFUNDED' ? '2026-07-17T06:05:00.000Z' : null,
    },
    timeline: [
      {
        status,
        title: orderCard(status).statusLabel,
        description:
          status === 'PENDING_PAYMENT'
            ? '居民提交订单'
            : status === 'PAID'
              ? '微信支付确认成功'
              : '居民取消订单',
        time: '2026-07-17T06:00:00.000Z',
      },
    ],
    refund: null,
  };
}

function residentRefund(
  status: ResidentRefundDetail['status'] = 'PENDING_REVIEW',
): ResidentRefundDetail {
  return {
    id: 'refund-current',
    refundNo: 'RF20260717A1B2C3D4E5F6',
    order: {
      id: 'order-current',
      orderNo: 'NS20260717A1B2C3D4E5',
      storeName: '阳光生鲜',
      status: status === 'SUCCESS' ? 'REFUNDED' : 'REFUND_PENDING',
    },
    amount: '27.00',
    currency: 'CNY',
    reason: 'NO_LONGER_NEEDED',
    reasonLabel: '不想要了',
    userNote: null,
    reviewNote: null,
    status,
    statusLabel: status === 'SUCCESS' ? '退款成功' : '待审核',
    failureMessage: null,
    refreshPending: false,
    createdAt: '2026-07-17T06:03:00.000Z',
    reviewedAt: null,
    completedAt: status === 'SUCCESS' ? '2026-07-17T06:05:00.000Z' : null,
  };
}

describe('miniapp order confirmation store', () => {
  beforeEach(() => {
    api.previewOrder.mockReset();
    api.createOrder.mockReset();
    api.listOrders.mockReset();
    api.getOrder.mockReset();
    api.cancelOrder.mockReset();
    api.initializeWechatPayment.mockReset();
    api.getWechatPaymentStatus.mockReset();
    api.applyRefund.mockReset();
    api.getRefund.mockReset();
    vi.stubGlobal('uni', {
      requestPayment: vi.fn(),
    });
    setActivePinia(createPinia());
  });

  it('uses only the server preview as the displayed order truth', async () => {
    api.previewOrder.mockResolvedValueOnce(orderPreview());
    const store = useOrderStore();
    await store.loadPreview('service-token', selection);
    expect(api.previewOrder).toHaveBeenCalledWith('service-token', selection);
    expect(store.preview?.summary.payableTotal).toBe('27.00');
    expect(store.previewError).toBeNull();
  });

  it('reuses the exact request id and body after an ambiguous network failure', async () => {
    api.previewOrder.mockResolvedValueOnce(orderPreview());
    api.createOrder
      .mockRejectedValueOnce(new ApiRequestError('NETWORK_ERROR', 'network failed'))
      .mockResolvedValueOnce(createdResult());
    const store = useOrderStore();
    await store.loadPreview('service-token', selection);
    expect(await store.submit('service-token')).toBeNull();
    expect(store.submitError).toBe('网络连接失败，可安全重试本次提交');
    const firstInput = api.createOrder.mock.calls[0][1];

    const retried = await store.submit('service-token');
    expect(retried?.order.id).toBe('order-current');
    expect(api.createOrder.mock.calls[1][1]).toEqual(firstInput);
    expect(store.activeOrderId).toBe('order-current');
  });

  it('refreshes a stale preview and blocks submission until the latest amount is confirmed', async () => {
    api.previewOrder
      .mockResolvedValueOnce(orderPreview())
      .mockResolvedValueOnce(orderPreview('29.00', 'b'.repeat(64)));
    api.createOrder.mockRejectedValueOnce(
      new ApiRequestError('ORDER_PREVIEW_STALE', 'preview changed'),
    );
    const store = useOrderStore();
    await store.loadPreview('service-token', selection);
    expect(await store.submit('service-token')).toBeNull();
    expect(api.previewOrder).toHaveBeenCalledTimes(2);
    expect(store.preview?.summary.payableTotal).toBe('29.00');
    expect(store.amountChangeNotice).toBe('应付金额已由 ¥27.00 更新为 ¥29.00');
    expect(store.requiresLatestConfirmation).toBe(true);

    expect(await store.submit('service-token')).toBeNull();
    expect(api.createOrder).toHaveBeenCalledTimes(1);
    store.confirmLatest();
    expect(store.requiresLatestConfirmation).toBe(false);
  });

  it('maps capacity failures and clears checkout state on reset', async () => {
    api.previewOrder.mockRejectedValueOnce(
      new ApiRequestError('DELIVERY_SLOT_UNAVAILABLE', 'slot full'),
    );
    const store = useOrderStore();
    await store.loadPreview('service-token', {
      ...selection,
      deliveryType: 'SCHEDULED',
      deliveryDate: '2026-07-18',
      deliverySlotId: 'slot-evening',
    });
    expect(store.previewError).toBe('所选配送时段已不可用，请重新选择');
    store.reset();
    expect(store.preview).toBeNull();
    expect(store.selection).toBeNull();
    expect(store.activeOrderId).toBeNull();
  });

  it('loads status-filtered resident orders from the server', async () => {
    api.listOrders.mockResolvedValueOnce({
      list: [orderCard()],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });
    const store = useOrderStore();
    await store.loadOrders('service-token', 'PENDING_PAYMENT');
    expect(api.listOrders).toHaveBeenCalledWith('service-token', 'PENDING_PAYMENT');
    expect(store.orders).toEqual([orderCard()]);
    expect(store.total).toBe(1);
    expect(store.listError).toBeNull();
  });

  it('keeps an expired pending order non-payable while the close worker finishes', async () => {
    api.listOrders.mockResolvedValueOnce({
      list: [orderCard('PENDING_PAYMENT', true)],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });
    const store = useOrderStore();
    await store.loadOrders('service-token', 'PENDING_PAYMENT');
    expect(store.orders[0]).toMatchObject({
      statusLabel: '关闭处理中',
      isExpired: true,
      allowedActions: [],
    });
  });

  it('loads details and applies only a server-confirmed cancellation', async () => {
    api.listOrders.mockResolvedValueOnce({
      list: [orderCard()],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });
    api.getOrder.mockResolvedValueOnce(orderDetail());
    api.cancelOrder.mockResolvedValueOnce({
      idempotentReplay: false,
      order: orderDetail('CANCELLED'),
    });
    const store = useOrderStore();
    await store.loadOrders('service-token');
    await store.loadDetail('service-token', 'order-current');
    expect(store.detail?.allowedActions).toEqual(['PAY', 'CANCEL']);
    expect(await store.cancel('service-token', 'order-current', '不需要了')).toBe(true);
    expect(api.cancelOrder).toHaveBeenCalledWith('service-token', 'order-current', '不需要了');
    expect(store.detail?.status).toBe('CANCELLED');
    expect(store.orders[0]?.status).toBe('CANCELLED');
  });

  it('clears stale history on a protected order failure', async () => {
    api.listOrders.mockResolvedValueOnce({
      list: [orderCard()],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1,
    });
    api.listOrders.mockRejectedValueOnce(new ApiRequestError('UNAUTHORIZED', 'expired'));
    const store = useOrderStore();
    await store.loadOrders('service-token');
    await store.loadOrders('expired-token');
    expect(store.orders).toEqual([]);
    expect(store.listError).toBe('expired');
  });

  it('reuses the refund request id after an ambiguous network failure', async () => {
    api.applyRefund
      .mockRejectedValueOnce(new ApiRequestError('NETWORK_ERROR', 'offline'))
      .mockResolvedValueOnce({ idempotentReplay: true, refund: residentRefund() });
    api.getOrder.mockResolvedValueOnce(orderDetail('REFUND_PENDING'));
    const store = useOrderStore();

    expect(
      await store.applyRefund('service-token', 'order-current', 'NO_LONGER_NEEDED', null),
    ).toBeNull();
    const firstInput = api.applyRefund.mock.calls[0][2];
    expect(store.refundError).toBe('网络连接失败，可安全重试本次提交');

    const refund = await store.applyRefund(
      'service-token',
      'order-current',
      'NO_LONGER_NEEDED',
      null,
    );
    expect(api.applyRefund.mock.calls[1][2]).toEqual(firstInput);
    expect(refund?.id).toBe('refund-current');
    expect(store.detail?.status).toBe('REFUND_PENDING');
  });

  it('loads a resident refund detail from the server', async () => {
    api.getRefund.mockResolvedValueOnce(residentRefund('SUCCESS'));
    const store = useOrderStore();
    await store.loadRefund('service-token', 'refund-current');
    expect(api.getRefund).toHaveBeenCalledWith('service-token', 'refund-current');
    expect(store.refundDetail?.status).toBe('SUCCESS');
    expect(store.refundError).toBeNull();
  });

  it('shows paid only after the server confirms the WeChat transaction', async () => {
    api.initializeWechatPayment.mockResolvedValueOnce({
      paymentId: 'payment-current',
      orderId: 'order-current',
      amount: '27.00',
      idempotentReplay: false,
      parameters: {
        timeStamp: '1784268000',
        nonceStr: 'nonce-payment',
        package: 'prepay_id=wx-prepay',
        signType: 'RSA',
        paySign: 'signed-payment',
      },
    });
    vi.mocked(uni.requestPayment).mockImplementationOnce(({ success }) =>
      success?.({ errMsg: 'ok' }),
    );
    api.getWechatPaymentStatus.mockResolvedValueOnce({
      orderId: 'order-current',
      orderStatus: 'PAID',
      paymentStatus: 'PAID',
      transactionId: 'wechat-transaction',
      paidAt: '2026-07-17T06:01:00.000Z',
    });
    api.getOrder.mockResolvedValueOnce(orderDetail('PAID'));
    const store = useOrderStore();

    expect(await store.pay('service-token', 'order-current')).toBe(true);
    expect(uni.requestPayment).toHaveBeenCalledWith(
      expect.objectContaining({ package: 'prepay_id=wx-prepay', signType: 'RSA' }),
    );
    expect(store.paymentOutcome).toBe('PAID');
    expect(store.detail?.status).toBe('PAID');
  });

  it('keeps the order pending when the resident cancels the WeChat sheet', async () => {
    api.initializeWechatPayment.mockResolvedValueOnce({
      paymentId: 'payment-current',
      orderId: 'order-current',
      amount: '27.00',
      idempotentReplay: false,
      parameters: {
        timeStamp: '1784268000',
        nonceStr: 'nonce-payment',
        package: 'prepay_id=wx-prepay',
        signType: 'RSA',
        paySign: 'signed-payment',
      },
    });
    vi.mocked(uni.requestPayment).mockImplementationOnce(({ fail }) =>
      fail?.({ errMsg: 'requestPayment:fail cancel' }),
    );
    api.getWechatPaymentStatus.mockResolvedValueOnce({
      orderId: 'order-current',
      orderStatus: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      transactionId: null,
      paidAt: null,
    });
    const store = useOrderStore();

    expect(await store.pay('service-token', 'order-current')).toBe(false);
    expect(store.paymentOutcome).toBe('CANCELLED');
    expect(store.paymentError).toContain('取消支付');
  });

  it('reports an unknown result when server confirmation cannot be reached', async () => {
    api.initializeWechatPayment.mockResolvedValueOnce({
      paymentId: 'payment-current',
      orderId: 'order-current',
      amount: '27.00',
      idempotentReplay: false,
      parameters: {
        timeStamp: '1784268000',
        nonceStr: 'nonce-payment',
        package: 'prepay_id=wx-prepay',
        signType: 'RSA',
        paySign: 'signed-payment',
      },
    });
    vi.mocked(uni.requestPayment).mockImplementationOnce(({ success }) =>
      success?.({ errMsg: 'ok' }),
    );
    api.getWechatPaymentStatus.mockRejectedValueOnce(new Error('offline'));
    const store = useOrderStore();

    expect(await store.pay('service-token', 'order-current')).toBe(false);
    expect(store.paymentOutcome).toBe('UNKNOWN');
    expect(store.paymentError).toContain('暂未确认');
  });

  it('does not open WeChat when the server reports unavailable payment', async () => {
    api.initializeWechatPayment.mockRejectedValueOnce(
      new ApiRequestError('PAYMENT_UNAVAILABLE', 'missing merchant config'),
    );
    const store = useOrderStore();

    expect(await store.pay('service-token', 'order-current')).toBe(false);
    expect(uni.requestPayment).not.toHaveBeenCalled();
    expect(store.paymentOutcome).toBe('FAILED');
    expect(store.paymentError).toBe('微信支付暂时不可用，请稍后重试');
  });
});
