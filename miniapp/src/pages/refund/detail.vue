<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

import { useOrderStore } from '../../stores/order';
import { useUserStore } from '../../stores/user';

const orderStore = useOrderStore();
const { refundDetail, isRefundLoading, refundError } = storeToRefs(orderStore);
const userStore = useUserStore();
const refundId = ref('');
const initialized = ref(false);

const statusDescription = computed(() => {
  const refund = refundDetail.value;
  if (!refund) return '';
  if (refund.refreshPending) return '微信退款结果暂未刷新成功，系统会继续查询，请稍后再看。';
  if (refund.status === 'PENDING_REVIEW') return '平台正在审核你的申请，审核结果会显示在这里。';
  if (refund.status === 'APPROVED') return '审核已通过，平台正在向微信提交退款。';
  if (refund.status === 'PROCESSING') return '微信正在处理退款，最终结果以微信退款状态为准。';
  if (refund.status === 'SUCCESS') return '退款已完成，请留意原支付账户的入账信息。';
  if (refund.status === 'REJECTED') return refund.reviewNote || '本次退款申请未通过审核。';
  return refund.failureMessage || '退款处理异常，请联系平台处理。';
});

const statusTone = computed(() => {
  if (refundDetail.value?.status === 'SUCCESS') return 'success';
  if (refundDetail.value?.status === 'REJECTED' || refundDetail.value?.status === 'FAILED') {
    return 'danger';
  }
  return 'pending';
});

onLoad((query) => {
  refundId.value = typeof query?.id === 'string' ? query.id : '';
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
  await orderStore.loadRefund(userStore.accessToken, refundId.value);
}

function openOrder(): void {
  if (refundDetail.value) {
    void uni.navigateTo({
      url: `/pages/order/detail?id=${encodeURIComponent(refundDetail.value.order.id)}`,
    });
  }
}

function formatTime(value: string | null): string {
  if (!value) return '-';
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
  <view class="refund-page">
    <view v-if="isRefundLoading" class="page-state">
      <van-loading type="spinner" color="#1f8f63">正在查询退款</van-loading>
    </view>
    <view v-else-if="refundError || !refundDetail" class="page-state">
      <van-empty :description="refundError ?? '退款申请不存在'" />
      <van-button size="small" type="primary" @click="load">重新加载</van-button>
    </view>
    <template v-else>
      <view class="status-card" :class="`status-card--${statusTone}`">
        <text class="status-card__eyebrow">整单退款 ¥{{ refundDetail.amount }}</text>
        <text class="status-card__title">{{ refundDetail.statusLabel }}</text>
        <text class="status-card__description">{{ statusDescription }}</text>
      </view>

      <view v-if="refundDetail.refreshPending" class="notice-card">
        当前展示的是最近一次已保存状态，刷新页面可再次查询微信结果。
      </view>

      <view class="section-card info-list">
        <view @click="openOrder">
          <text>关联订单</text>
          <text class="link-text">{{ refundDetail.order.orderNo }} ›</text>
        </view>
        <view
          ><text>店铺</text><text>{{ refundDetail.order.storeName }}</text></view
        >
        <view
          ><text>退款编号</text><text>{{ refundDetail.refundNo }}</text></view
        >
        <view
          ><text>退款金额</text><text>¥{{ refundDetail.amount }}</text></view
        >
        <view
          ><text>退款原因</text><text>{{ refundDetail.reasonLabel }}</text></view
        >
        <view
          ><text>补充说明</text><text>{{ refundDetail.userNote || '无' }}</text></view
        >
        <view v-if="refundDetail.reviewNote">
          <text>审核说明</text><text>{{ refundDetail.reviewNote }}</text>
        </view>
      </view>

      <view class="section-card time-list">
        <text class="section-title">处理时间</text>
        <view
          ><text>申请时间</text><text>{{ formatTime(refundDetail.createdAt) }}</text></view
        >
        <view
          ><text>审核时间</text><text>{{ formatTime(refundDetail.reviewedAt) }}</text></view
        >
        <view
          ><text>完成时间</text><text>{{ formatTime(refundDetail.completedAt) }}</text></view
        >
      </view>

      <button class="refresh-button" @click="load">刷新退款状态</button>
    </template>
  </view>
</template>

<style scoped lang="scss">
.refund-page {
  min-height: 100vh;
  padding: 28rpx;
}
.page-state {
  display: flex;
  min-height: 70vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.status-card {
  padding: 38rpx 32rpx;
  color: #ffffff;
  border-radius: 26rpx;
}
.status-card--pending {
  background: linear-gradient(135deg, #b66b12, #d99b47);
}
.status-card--success {
  background: linear-gradient(135deg, #1f8f63, #43ad82);
}
.status-card--danger {
  background: linear-gradient(135deg, #a9473e, #cc746c);
}
.status-card__eyebrow,
.status-card__title,
.status-card__description {
  display: block;
}
.status-card__eyebrow {
  font-size: 23rpx;
  opacity: 0.86;
}
.status-card__title {
  margin-top: 14rpx;
  font-size: 42rpx;
  font-weight: 750;
}
.status-card__description {
  margin-top: 18rpx;
  font-size: 24rpx;
  line-height: 1.6;
}
.notice-card {
  margin-top: 20rpx;
  padding: 20rpx 24rpx;
  color: #82510e;
  background: #fff6df;
  border-radius: 18rpx;
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
.section-title {
  display: block;
  margin-bottom: 14rpx;
  font-size: 28rpx;
  font-weight: 700;
}
.info-list > view,
.time-list > view {
  display: flex;
  gap: 28rpx;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14rpx 0;
  color: #6a7871;
  font-size: 24rpx;
}
.info-list > view text:last-child,
.time-list > view text:last-child {
  max-width: 68%;
  color: #273a31;
  line-height: 1.45;
  text-align: right;
  word-break: break-all;
}
.info-list > view .link-text {
  color: #1f8f63;
}
.refresh-button {
  margin: 30rpx 0 0;
  color: #1f8f63;
  font-size: 27rpx;
  line-height: 78rpx;
  background: #e8f6f0;
  border: 0;
  border-radius: 40rpx;
}
.refresh-button::after {
  border: 0;
}
</style>
