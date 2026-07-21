import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  applyRefund as applyOrderRefund,
  cancelOrder,
  createOrder,
  getOrder,
  getRefund,
  getWechatPaymentStatus,
  initializeWechatPayment,
  listOrders,
  previewOrder,
} from '../api/order';
import type {
  CreateOrderResult,
  CreatedOrder,
  OrderPreview,
  OrderSelection,
  OrderStatus,
  ResidentOrderCard,
  ResidentOrderDetail,
  ResidentRefundDetail,
  RefundReason,
} from '../types/domain';
import { ApiRequestError } from '../utils/request';

type PendingCreateInput = OrderSelection & {
  requestId: string;
  expectedPreviewVersion: string;
  expectedPayableAmount: string;
};

type PendingRefundInput = {
  orderId: string;
  requestId: string;
  reason: RefundReason;
  note: string | null;
};

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return '订单操作失败，请稍后重试';
  const messages: Record<string, string> = {
    CART_EMPTY: '购物车为空，请重新选购',
    ADDRESS_NOT_FOUND: '收货地址已失效，请重新选择',
    STORE_NOT_FOUND: '店铺已停用',
    STORE_PAUSED: '店铺当前暂停接单',
    STORE_CLOSED: '店铺当前不在营业时间',
    STORE_NOT_DELIVERABLE: '店铺暂不配送到该地址',
    PRODUCT_NOT_FOUND: '订单中的商品已不存在',
    PRODUCT_OFF_SHELF: '订单中的商品已下架',
    PRODUCT_STOCK_NOT_ENOUGH: '商品库存不足，请返回购物车调整',
    PRODUCT_PURCHASE_LIMIT_EXCEEDED: '购买数量超过限购数量',
    MINIMUM_ORDER_NOT_REACHED: '商品金额未达到起送金额',
    DELIVERY_SLOT_UNAVAILABLE: '所选配送时段已不可用，请重新选择',
    ORDER_PREVIEW_STALE: '订单内容已变化，请确认最新信息',
    DUPLICATE_REQUEST: '本次提交编号冲突，请重新提交',
    ORDER_NOT_FOUND: '订单不存在或已不可访问',
    INVALID_ORDER_STATUS: '订单状态已变化，请刷新后重试',
    ORDER_ALREADY_PAID: '订单已经支付，请刷新订单状态',
    PAYMENT_PROCESSING: '支付单正在创建，请稍后重试',
    PAYMENT_FAILED: '微信支付下单失败，请稍后重试',
    PAYMENT_UNAVAILABLE: '微信支付暂时不可用，请稍后重试',
    PAYMENT_CLOSE_UNCONFIRMED: '订单关闭结果暂未确认，库存仍为你保留，请稍后重试',
    REFUND_NOT_FOUND: '退款申请不存在或已不可访问',
    REFUND_NOT_ALLOWED: '订单状态已变化，当前不能申请退款',
    REFUND_ALREADY_EXISTS: '该订单已经提交过退款申请',
    INVALID_REFUND_STATUS: '退款状态已变化，请刷新后重试',
    REFUND_UNAVAILABLE: '微信退款结果暂未确认，请稍后重试',
    NETWORK_ERROR: '网络连接失败，可安全重试本次提交',
  };
  return messages[error.code] ?? error.message;
}

function sameSelection(left: OrderSelection | null, right: OrderSelection): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

function createRequestId(): string {
  return `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createRefundRequestId(): string {
  return `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const useOrderStore = defineStore('order', () => {
  const selection = ref<OrderSelection | null>(null);
  const preview = ref<OrderPreview | null>(null);
  const createdOrder = ref<CreatedOrder | null>(null);
  const isPreviewLoading = ref(false);
  const isSubmitting = ref(false);
  const previewError = ref<string | null>(null);
  const submitError = ref<string | null>(null);
  const amountChangeNotice = ref<string | null>(null);
  const requiresLatestConfirmation = ref(false);
  const pendingCreateInput = ref<PendingCreateInput | null>(null);
  const orders = ref<ResidentOrderCard[]>([]);
  const selectedStatus = ref<OrderStatus | null>(null);
  const total = ref(0);
  const isListLoading = ref(false);
  const listError = ref<string | null>(null);
  const detail = ref<ResidentOrderDetail | null>(null);
  const isDetailLoading = ref(false);
  const detailError = ref<string | null>(null);
  const isOrderMutating = ref(false);
  const orderMutationError = ref<string | null>(null);
  const isPaying = ref(false);
  const paymentError = ref<string | null>(null);
  const paymentOutcome = ref<'PAID' | 'CANCELLED' | 'UNKNOWN' | 'FAILED' | null>(null);
  const refundDetail = ref<ResidentRefundDetail | null>(null);
  const isRefundLoading = ref(false);
  const isRefundMutating = ref(false);
  const refundError = ref<string | null>(null);
  const pendingRefundInput = ref<PendingRefundInput | null>(null);
  const activeOrderId = computed(() => createdOrder.value?.id ?? null);
  let listRequestVersion = 0;
  let detailRequestVersion = 0;

  async function loadPreview(
    token: string,
    nextSelection: OrderSelection,
    forceLatestConfirmation = false,
  ): Promise<OrderPreview | null> {
    if (isPreviewLoading.value) return preview.value;
    const refreshesSameSelection = sameSelection(selection.value, nextSelection);
    const previousAmount = refreshesSameSelection ? preview.value?.summary.payableTotal : undefined;
    if (!refreshesSameSelection) pendingCreateInput.value = null;
    selection.value = { ...nextSelection };
    preview.value = null;
    previewError.value = null;
    submitError.value = null;
    amountChangeNotice.value = null;
    requiresLatestConfirmation.value = false;
    isPreviewLoading.value = true;
    try {
      const confirmed = await previewOrder(token, nextSelection);
      preview.value = confirmed;
      if (previousAmount && previousAmount !== confirmed.summary.payableTotal) {
        amountChangeNotice.value = `应付金额已由 ¥${previousAmount} 更新为 ¥${confirmed.summary.payableTotal}`;
        requiresLatestConfirmation.value = true;
      } else if (forceLatestConfirmation) {
        amountChangeNotice.value = '订单内容已更新，请确认最新商品、配送和金额';
        requiresLatestConfirmation.value = true;
      }
      return confirmed;
    } catch (error) {
      previewError.value = errorMessage(error);
      return null;
    } finally {
      isPreviewLoading.value = false;
    }
  }

  function confirmLatest(): void {
    requiresLatestConfirmation.value = false;
    amountChangeNotice.value = null;
  }

  async function submit(token: string): Promise<CreateOrderResult | null> {
    if (
      isSubmitting.value ||
      !selection.value ||
      !preview.value ||
      requiresLatestConfirmation.value
    ) {
      return null;
    }
    const input =
      pendingCreateInput.value ??
      ({
        ...selection.value,
        requestId: createRequestId(),
        expectedPreviewVersion: preview.value.previewVersion,
        expectedPayableAmount: preview.value.summary.payableTotal,
      } satisfies PendingCreateInput);
    pendingCreateInput.value = input;
    submitError.value = null;
    isSubmitting.value = true;
    try {
      const result = await createOrder(token, input);
      createdOrder.value = result.order;
      pendingCreateInput.value = null;
      return result;
    } catch (error) {
      submitError.value = errorMessage(error);
      if (error instanceof ApiRequestError && error.code === 'ORDER_PREVIEW_STALE') {
        pendingCreateInput.value = null;
        const currentSelection = { ...selection.value };
        await loadPreview(token, currentSelection, true);
        submitError.value = errorMessage(error);
      } else if (!(error instanceof ApiRequestError) || error.code !== 'NETWORK_ERROR') {
        pendingCreateInput.value = null;
      }
      return null;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function loadOrders(token: string, status: OrderStatus | null = null): Promise<void> {
    const version = ++listRequestVersion;
    selectedStatus.value = status;
    isListLoading.value = true;
    listError.value = null;
    try {
      const result = await listOrders(token, status ?? undefined);
      if (version !== listRequestVersion) return;
      orders.value = result.list;
      total.value = result.total;
    } catch (error) {
      if (version !== listRequestVersion) return;
      orders.value = [];
      total.value = 0;
      listError.value = errorMessage(error);
    } finally {
      if (version === listRequestVersion) isListLoading.value = false;
    }
  }

  async function loadDetail(token: string, orderId: string): Promise<void> {
    const version = ++detailRequestVersion;
    detail.value = null;
    isDetailLoading.value = true;
    detailError.value = null;
    orderMutationError.value = null;
    try {
      const result = await getOrder(token, orderId);
      if (version === detailRequestVersion) detail.value = result;
    } catch (error) {
      if (version === detailRequestVersion) detailError.value = errorMessage(error);
    } finally {
      if (version === detailRequestVersion) isDetailLoading.value = false;
    }
  }

  async function cancel(token: string, orderId: string, reason: string | null): Promise<boolean> {
    if (isOrderMutating.value) return false;
    isOrderMutating.value = true;
    orderMutationError.value = null;
    try {
      const result = await cancelOrder(token, orderId, reason);
      detail.value = result.order;
      const index = orders.value.findIndex((order) => order.id === orderId);
      if (index >= 0) {
        orders.value[index] = {
          id: result.order.id,
          orderNo: result.order.orderNo,
          store: result.order.store,
          productSummary: result.order.productSummary,
          payableAmount: result.order.payableAmount,
          status: result.order.status,
          statusLabel: result.order.statusLabel,
          createdAt: result.order.createdAt,
          expiresAt: result.order.expiresAt,
          isExpired: result.order.isExpired,
          allowedActions: result.order.allowedActions,
        };
      }
      return true;
    } catch (error) {
      orderMutationError.value = errorMessage(error);
      return false;
    } finally {
      isOrderMutating.value = false;
    }
  }

  function launchWechatPayment(parameters: {
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: 'RSA';
    paySign: string;
  }): Promise<'SUCCESS' | 'CANCELLED' | 'FAILED'> {
    return new Promise((resolve) => {
      uni.requestPayment({
        provider: 'wxpay',
        ...parameters,
        success: () => resolve('SUCCESS'),
        fail: (error) =>
          resolve(error.errMsg?.toLowerCase().includes('cancel') ? 'CANCELLED' : 'FAILED'),
      });
    });
  }

  async function applyPaidOrder(token: string, orderId: string): Promise<void> {
    const confirmed = await getOrder(token, orderId);
    detail.value = confirmed;
    const index = orders.value.findIndex((order) => order.id === orderId);
    if (index >= 0) {
      orders.value[index] = {
        id: confirmed.id,
        orderNo: confirmed.orderNo,
        store: confirmed.store,
        productSummary: confirmed.productSummary,
        payableAmount: confirmed.payableAmount,
        status: confirmed.status,
        statusLabel: confirmed.statusLabel,
        createdAt: confirmed.createdAt,
        expiresAt: confirmed.expiresAt,
        isExpired: confirmed.isExpired,
        allowedActions: confirmed.allowedActions,
      };
    }
  }

  async function pay(token: string, orderId: string): Promise<boolean> {
    if (isPaying.value) return false;
    isPaying.value = true;
    paymentError.value = null;
    paymentOutcome.value = null;
    try {
      const initialized = await initializeWechatPayment(token, orderId);
      const launchResult = await launchWechatPayment(initialized.parameters);
      let status;
      try {
        status = await getWechatPaymentStatus(token, orderId);
      } catch {
        paymentOutcome.value = 'UNKNOWN';
        paymentError.value = '支付结果暂未确认，请稍后在订单详情刷新';
        return false;
      }
      if (status.paymentStatus === 'PAID') {
        paymentOutcome.value = 'PAID';
        await applyPaidOrder(token, orderId);
        return true;
      }
      if (launchResult === 'CANCELLED') {
        paymentOutcome.value = 'CANCELLED';
        paymentError.value = '已取消支付，可在订单到期前重新支付';
        return false;
      }
      if (status.paymentStatus === 'FAILED') {
        paymentOutcome.value = 'FAILED';
        paymentError.value = '支付未成功，请稍后重试';
        return false;
      }
      paymentOutcome.value = 'UNKNOWN';
      paymentError.value = '支付结果确认中，请稍后刷新订单';
      return false;
    } catch (error) {
      paymentOutcome.value = error instanceof ApiRequestError ? 'FAILED' : 'UNKNOWN';
      paymentError.value = errorMessage(error);
      return false;
    } finally {
      isPaying.value = false;
    }
  }

  async function applyRefund(
    token: string,
    orderId: string,
    reason: RefundReason,
    note: string | null,
  ): Promise<ResidentRefundDetail | null> {
    if (isRefundMutating.value) return null;
    const normalizedNote = note?.trim() || null;
    const reusable =
      pendingRefundInput.value?.orderId === orderId &&
      pendingRefundInput.value.reason === reason &&
      pendingRefundInput.value.note === normalizedNote;
    const input = reusable
      ? pendingRefundInput.value!
      : { orderId, requestId: createRefundRequestId(), reason, note: normalizedNote };
    pendingRefundInput.value = input;
    isRefundMutating.value = true;
    refundError.value = null;
    try {
      const result = await applyOrderRefund(token, orderId, {
        requestId: input.requestId,
        reason: input.reason,
        note: input.note,
      });
      refundDetail.value = result.refund;
      pendingRefundInput.value = null;
      try {
        await loadDetail(token, orderId);
      } catch {
        // 退款申请已由服务端确认，订单详情可稍后刷新。
      }
      return result.refund;
    } catch (error) {
      refundError.value = errorMessage(error);
      if (!(error instanceof ApiRequestError) || error.code !== 'NETWORK_ERROR') {
        pendingRefundInput.value = null;
      }
      return null;
    } finally {
      isRefundMutating.value = false;
    }
  }

  async function loadRefund(token: string, refundId: string): Promise<void> {
    isRefundLoading.value = true;
    refundError.value = null;
    try {
      refundDetail.value = await getRefund(token, refundId);
    } catch (error) {
      refundDetail.value = null;
      refundError.value = errorMessage(error);
    } finally {
      isRefundLoading.value = false;
    }
  }

  function reset(): void {
    selection.value = null;
    preview.value = null;
    createdOrder.value = null;
    isPreviewLoading.value = false;
    isSubmitting.value = false;
    previewError.value = null;
    submitError.value = null;
    amountChangeNotice.value = null;
    requiresLatestConfirmation.value = false;
    pendingCreateInput.value = null;
    orders.value = [];
    selectedStatus.value = null;
    total.value = 0;
    isListLoading.value = false;
    listError.value = null;
    detail.value = null;
    isDetailLoading.value = false;
    detailError.value = null;
    isOrderMutating.value = false;
    orderMutationError.value = null;
    isPaying.value = false;
    paymentError.value = null;
    paymentOutcome.value = null;
    refundDetail.value = null;
    isRefundLoading.value = false;
    isRefundMutating.value = false;
    refundError.value = null;
    pendingRefundInput.value = null;
  }

  return {
    selection,
    preview,
    createdOrder,
    activeOrderId,
    isPreviewLoading,
    isSubmitting,
    previewError,
    submitError,
    amountChangeNotice,
    requiresLatestConfirmation,
    orders,
    selectedStatus,
    total,
    isListLoading,
    listError,
    detail,
    isDetailLoading,
    detailError,
    isOrderMutating,
    orderMutationError,
    isPaying,
    paymentError,
    paymentOutcome,
    refundDetail,
    isRefundLoading,
    isRefundMutating,
    refundError,
    loadPreview,
    confirmLatest,
    submit,
    loadOrders,
    loadDetail,
    cancel,
    pay,
    applyRefund,
    loadRefund,
    reset,
  };
});
