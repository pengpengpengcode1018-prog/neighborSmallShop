<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

import { useOrderStore } from '../../stores/order';
import { useUserStore } from '../../stores/user';
import { selectRefundReason, type RefundReasonOption } from '../../utils/refund-reason-selection';
import { resolveApiAssetUrl } from '../../utils/request';

const orderStore = useOrderStore();
const {
  detail,
  isDetailLoading,
  detailError,
  isOrderMutating,
  orderMutationError,
  isPaying,
  paymentError,
  paymentOutcome,
  isRefundMutating,
  refundError,
} = storeToRefs(orderStore);
const userStore = useUserStore();
const orderId = ref('');
const initialized = ref(false);

onLoad((query) => {
  orderId.value = typeof query?.id === 'string' ? query.id : '';
});

onShow(() => {
  if (!initialized.value) void load();
});

async function load(): Promise<void> {
  initialized.value = true;
  await userStore.restoreSession();
  if (!userStore.accessToken) {
    void uni.redirectTo({ url: '/pages/home/index' });
    return;
  }
  await orderStore.loadDetail(userStore.accessToken, orderId.value);
}

function confirmCancel(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '取消订单？',
      content: '系统会先确认并关闭微信交易，再取消订单并释放库存。',
      confirmText: '确认取消',
      confirmColor: '#c33b31',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

async function cancel(): Promise<void> {
  if (!userStore.accessToken || !detail.value || isPaying.value || !(await confirmCancel())) {
    return;
  }
  const succeeded = await orderStore.cancel(userStore.accessToken, detail.value.id, '居民主动取消');
  uni.showToast({
    title: succeeded ? '订单已取消' : (orderMutationError.value ?? '取消失败'),
    icon: succeeded ? 'success' : 'none',
  });
}

async function pay(): Promise<void> {
  if (!userStore.accessToken || !detail.value || isOrderMutating.value) return;
  const succeeded = await orderStore.pay(userStore.accessToken, detail.value.id);
  uni.showToast({
    title: succeeded
      ? '支付已确认'
      : paymentOutcome.value === 'CANCELLED'
        ? '已取消支付'
        : (paymentError.value ?? '支付结果暂未确认'),
    icon: succeeded ? 'success' : 'none',
  });
}

function confirmRefund(reason: RefundReasonOption): Promise<string | null | false> {
  return new Promise((resolve) => {
    uni.showModal({
      title: `申请整单退款：${reason.label}`,
      content: reason.value === 'OTHER' ? '' : '退款金额以实际支付金额为准，提交后需等待平台审核。',
      editable: true,
      placeholderText: reason.value === 'OTHER' ? '请填写退款说明（必填）' : '补充说明（选填）',
      confirmText: '提交申请',
      confirmColor: '#c77a16',
      success: (result) => {
        if (!result.confirm) return resolve(false);
        const note = result.content?.trim() || null;
        if (reason.value === 'OTHER' && !note) {
          uni.showToast({ title: '请填写退款说明', icon: 'none' });
          return resolve(false);
        }
        resolve(note);
      },
      fail: () => resolve(false),
    });
  });
}

async function applyRefund(): Promise<void> {
  if (!userStore.accessToken || !detail.value || isPaying.value || isOrderMutating.value) return;
  const selection = await selectRefundReason((options) => {
    uni.showActionSheet(options);
  });
  if (!selection.option) {
    if (selection.error) uni.showToast({ title: selection.error, icon: 'none' });
    return;
  }
  const selected = selection.option;
  const note = await confirmRefund(selected);
  if (note === false) return;
  const refund = await orderStore.applyRefund(
    userStore.accessToken,
    detail.value.id,
    selected.value,
    note,
  );
  if (!refund) {
    uni.showToast({ title: refundError.value ?? '退款申请失败', icon: 'none' });
    return;
  }
  uni.showToast({ title: '退款申请已提交', icon: 'success' });
  setTimeout(() => {
    void uni.navigateTo({ url: `/pages/refund/detail?id=${encodeURIComponent(refund.id)}` });
  }, 500);
}

function openRefund(): void {
  if (detail.value?.refund) {
    void uni.navigateTo({
      url: `/pages/refund/detail?id=${encodeURIComponent(detail.value.refund.id)}`,
    });
  }
}

function openNotifications(): void {
  void uni.navigateTo({ url: '/pages/notification/index' });
}

function callStore(): void {
  if (detail.value?.store.phone) void uni.makePhoneCall({ phoneNumber: detail.value.store.phone });
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}
</script>

<template>
  <view class="detail-page">
    <view v-if="isDetailLoading" class="detail-state">
      <van-loading type="spinner" color="#1f8f63">正在加载订单</van-loading>
    </view>
    <view v-else-if="detailError || !detail" class="detail-state">
      <van-empty :description="detailError ?? '订单不存在'" />
      <van-button size="small" type="primary" @click="load">重新加载</van-button>
    </view>
    <template v-else>
      <view class="status-card">
        <text class="status-card__title">{{ detail.statusLabel }}</text>
        <text class="status-card__description">订单号 {{ detail.orderNo }}</text>
        <text
          v-if="detail.status === 'PENDING_PAYMENT' && detail.isExpired"
          class="status-card__hint"
        >
          支付时间已结束，系统正在确认支付结果并关闭订单，请稍后刷新
        </text>
        <text v-else-if="detail.status === 'PENDING_PAYMENT'" class="status-card__hint">
          请在 {{ formatTime(detail.expiresAt) }} 前完成支付；支付结果以服务端确认为准
        </text>
        <text v-if="detail.cancellationReason" class="status-card__hint">
          取消原因：{{ detail.cancellationReason }}
        </text>
      </view>

      <view class="section-card">
        <view class="section-heading">
          <text>{{ detail.store.name }}</text>
          <text v-if="detail.store.phone" class="section-link" @click="callStore">联系店铺</text>
        </view>
        <view v-for="item in detail.items" :key="item.productId" class="detail-item">
          <image
            v-if="item.imageUrl"
            class="detail-item__image"
            :src="resolveApiAssetUrl(item.imageUrl)"
            mode="aspectFill"
          />
          <view v-else class="detail-item__image detail-item__fallback">{{
            item.name.slice(0, 1)
          }}</view>
          <view class="detail-item__content">
            <text>{{ item.name }}</text>
            <text>¥{{ item.unitPrice }} × {{ item.quantity }}</text>
          </view>
          <text>¥{{ item.lineTotal }}</text>
        </view>
      </view>

      <view class="section-card info-list">
        <view
          ><text>收货人</text
          ><text>{{ detail.address.recipientName }} · {{ detail.address.phone }}</text></view
        >
        <view
          ><text>收货地址</text><text>{{ detail.address.fullAddress }}</text></view
        >
        <view
          ><text>配送方式</text
          ><text>{{
            detail.delivery.type === 'ASAP'
              ? '尽快送达'
              : `${detail.delivery.date} ${detail.delivery.time}`
          }}</text></view
        >
        <view
          ><text>订单备注</text><text>{{ detail.remark || '无' }}</text></view
        >
      </view>

      <view class="section-card price-list">
        <view
          ><text>商品金额</text><text>¥{{ detail.summary.merchandiseTotal }}</text></view
        >
        <view
          ><text>配送费</text><text>¥{{ detail.summary.deliveryFee }}</text></view
        >
        <view class="price-list__total"
          ><text>应付金额</text><text>¥{{ detail.summary.payableTotal }}</text></view
        >
      </view>

      <view v-if="detail.refund" class="section-card refund-card" @click="openRefund">
        <view>
          <text class="section-title">退款申请</text>
          <text class="refund-card__hint">金额 ¥{{ detail.refund.amount }}</text>
        </view>
        <text class="section-link">查看退款详情 ›</text>
      </view>

      <view class="section-card notification-card" @click="openNotifications">
        <view>
          <text class="section-title">微信订单通知</text>
          <text class="refund-card__hint">主动订阅支付、接单、配送与退款进度</text>
        </view>
        <text class="section-link">通知设置 ›</text>
      </view>

      <view class="section-card">
        <text class="section-title">订单进度</text>
        <view class="timeline">
          <view
            v-for="event in detail.timeline"
            :key="`${event.status}-${event.time}`"
            class="timeline-item"
          >
            <view class="timeline-item__dot" />
            <view>
              <text class="timeline-item__title">{{ event.title }}</text>
              <text class="timeline-item__description">{{ event.description }}</text>
              <text class="timeline-item__time">{{ formatTime(event.time) }}</text>
            </view>
          </view>
        </view>
      </view>

      <text v-if="orderMutationError" class="mutation-error">{{ orderMutationError }}</text>
      <text v-if="paymentError" class="mutation-error">{{ paymentError }}</text>
      <text v-if="refundError" class="mutation-error">{{ refundError }}</text>
      <view
        v-if="
          detail.allowedActions.includes('PAY') ||
          detail.allowedActions.includes('CANCEL') ||
          detail.allowedActions.includes('REFUND')
        "
        class="action-bar"
      >
        <button
          v-if="detail.allowedActions.includes('CANCEL')"
          class="cancel-button"
          :disabled="isOrderMutating || isPaying"
          @click="cancel"
        >
          {{ isOrderMutating ? '取消中…' : '取消订单' }}
        </button>
        <button
          v-if="detail.allowedActions.includes('REFUND')"
          class="refund-button"
          :disabled="isRefundMutating || isPaying || isOrderMutating"
          @click="applyRefund"
        >
          {{ isRefundMutating ? '提交中…' : `申请退款 ¥${detail.summary.payableTotal}` }}
        </button>
        <button
          v-if="detail.allowedActions.includes('PAY')"
          class="pay-button"
          :disabled="isPaying || isOrderMutating"
          @click="pay"
        >
          {{ isPaying ? '支付确认中…' : `立即支付 ¥${detail.summary.payableTotal}` }}
        </button>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.detail-page {
  min-height: 100vh;
  padding: 28rpx 28rpx 150rpx;
}
.detail-state {
  display: flex;
  min-height: 70vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.status-card {
  padding: 36rpx 30rpx;
  color: #ffffff;
  background: linear-gradient(135deg, #1f8f63, #43ad82);
  border-radius: 24rpx;
}
.status-card__title,
.status-card__description,
.status-card__hint {
  display: block;
}
.status-card__title {
  font-size: 42rpx;
  font-weight: 750;
}
.status-card__description {
  margin-top: 12rpx;
  font-size: 23rpx;
  opacity: 0.85;
}
.status-card__hint {
  margin-top: 18rpx;
  font-size: 23rpx;
  line-height: 1.5;
}
.section-card {
  margin-top: 22rpx;
  padding: 28rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}
.section-heading,
.detail-item,
.info-list > view,
.price-list > view {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-heading,
.section-title {
  font-size: 28rpx;
  font-weight: 700;
}
.section-link {
  color: #1f8f63;
  font-size: 24rpx;
  font-weight: 400;
}
.detail-item {
  gap: 18rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #edf2ef;
}
.detail-item:last-child {
  border-bottom: 0;
}
.detail-item__image {
  display: flex;
  width: 88rpx;
  height: 88rpx;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
}
.detail-item__fallback {
  color: #1f8f63;
  background: #e8f6f0;
  font-weight: 700;
}
.detail-item__content {
  min-width: 0;
  flex: 1;
}
.detail-item__content text {
  display: block;
  font-size: 25rpx;
}
.detail-item__content text:last-child {
  margin-top: 10rpx;
  color: #7c8a83;
  font-size: 21rpx;
}
.info-list > view,
.price-list > view {
  gap: 30rpx;
  padding: 13rpx 0;
  color: #627168;
  font-size: 24rpx;
}
.info-list > view text:last-child {
  max-width: 72%;
  color: #273a31;
  line-height: 1.5;
  text-align: right;
}
.price-list > .price-list__total {
  color: #21302a;
  font-size: 29rpx;
  font-weight: 700;
}
.refund-card,
.notification-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.refund-card__hint {
  display: block;
  margin-top: 10rpx;
  color: #7c8a83;
  font-size: 23rpx;
}
.timeline {
  margin-top: 26rpx;
}
.timeline-item {
  position: relative;
  padding: 0 0 28rpx 36rpx;
  border-left: 2rpx solid #dbe8e2;
}
.timeline-item:last-child {
  padding-bottom: 0;
  border-left-color: transparent;
}
.timeline-item__dot {
  position: absolute;
  top: 2rpx;
  left: -9rpx;
  width: 16rpx;
  height: 16rpx;
  background: #1f8f63;
  border: 4rpx solid #dff2ea;
  border-radius: 50%;
}
.timeline-item__title,
.timeline-item__description,
.timeline-item__time {
  display: block;
}
.timeline-item__title {
  font-size: 26rpx;
  font-weight: 700;
}
.timeline-item__description {
  margin-top: 8rpx;
  color: #607168;
  font-size: 23rpx;
}
.timeline-item__time {
  margin-top: 8rpx;
  color: #91a098;
  font-size: 20rpx;
}
.mutation-error {
  display: block;
  margin-top: 18rpx;
  color: #c33b31;
  font-size: 23rpx;
  text-align: center;
}
.action-bar {
  position: fixed;
  display: flex;
  gap: 18rpx;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #ffffff;
  box-shadow: 0 -8rpx 28rpx rgb(31 64 50 / 8%);
}
.cancel-button {
  flex: 1;
  margin: 0;
  color: #c33b31;
  font-size: 28rpx;
  line-height: 82rpx;
  background: #fff5f3;
  border: 1rpx solid #e6b9b3;
  border-radius: 42rpx;
}
.cancel-button::after {
  border: 0;
}
.pay-button {
  flex: 2;
  margin: 0;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 82rpx;
  background: #1f8f63;
  border: 0;
  border-radius: 42rpx;
}
.refund-button {
  flex: 2;
  margin: 0;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 82rpx;
  background: #c77a16;
  border: 0;
  border-radius: 42rpx;
}
.refund-button::after {
  border: 0;
}
.pay-button::after {
  border: 0;
}
.pay-button[disabled],
.cancel-button[disabled],
.refund-button[disabled] {
  opacity: 0.5;
}
</style>
