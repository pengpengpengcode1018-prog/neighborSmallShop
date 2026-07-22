<script setup lang="ts">
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';

import { useOrderStore } from '../../stores/order';
import { useUserStore } from '../../stores/user';
import type { OrderStatus, ResidentOrderCard } from '../../types/domain';
import { resolveApiAssetUrl } from '../../utils/request';

const filters: Array<{ label: string; value: OrderStatus | null }> = [
  { label: '全部', value: null },
  { label: '待付款', value: 'PENDING_PAYMENT' },
  { label: '待接单', value: 'PAID' },
  { label: '制作中', value: 'PREPARING' },
  { label: '配送中', value: 'DELIVERING' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '已取消', value: 'CANCELLED' },
];

const orderStore = useOrderStore();
const { orders, selectedStatus, isListLoading, listError } = storeToRefs(orderStore);
const userStore = useUserStore();

onShow(() => void load());

onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

async function load(): Promise<void> {
  await userStore.restoreSession();
  if (!userStore.accessToken) {
    void uni.redirectTo({ url: '/pages/home/index' });
    return;
  }
  await orderStore.loadOrders(userStore.accessToken, selectedStatus.value);
}

async function changeFilter(status: OrderStatus | null): Promise<void> {
  if (!userStore.accessToken || status === selectedStatus.value) return;
  await orderStore.loadOrders(userStore.accessToken, status);
}

function openDetail(order: ResidentOrderCard): void {
  void uni.navigateTo({ url: `/pages/order/detail?id=${encodeURIComponent(order.id)}` });
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function goShopping(): void {
  void uni.reLaunch({ url: '/pages/home/index' });
}
</script>

<template>
  <view class="orders-page">
    <scroll-view class="status-tabs" scroll-x enhanced :show-scrollbar="false">
      <view class="status-tabs__inner">
        <view
          v-for="filter in filters"
          :key="filter.label"
          class="status-tab"
          :class="{ 'status-tab--active': selectedStatus === filter.value }"
          @click="changeFilter(filter.value)"
        >
          {{ filter.label }}
        </view>
      </view>
    </scroll-view>

    <view v-if="isListLoading && orders.length === 0" class="order-state">
      <van-loading type="spinner" color="#1f8f63">正在加载订单</van-loading>
    </view>
    <view v-else-if="listError && orders.length === 0" class="order-state">
      <van-empty :description="listError" />
      <van-button size="small" type="primary" @click="load">重新加载</van-button>
    </view>
    <view v-else-if="orders.length === 0" class="order-state">
      <van-empty description="当前分类还没有订单" />
      <van-button size="small" type="primary" @click="goShopping">去逛逛</van-button>
    </view>
    <view v-else class="order-list">
      <view v-for="order in orders" :key="order.id" class="order-card" @click="openDetail(order)">
        <view class="order-card__heading">
          <view class="store-heading">
            <image
              v-if="order.store.logoUrl"
              class="store-logo"
              :src="resolveApiAssetUrl(order.store.logoUrl)"
              mode="aspectFill"
            />
            <view v-else class="store-logo store-logo--fallback">店</view>
            <text class="store-name">{{ order.store.name }}</text>
          </view>
          <text class="order-status">{{ order.statusLabel }}</text>
        </view>
        <view class="product-row">
          <view class="product-images">
            <view
              v-for="item in order.productSummary.items"
              :key="item.productId"
              class="product-image-wrap"
            >
              <image
                v-if="item.imageUrl"
                class="product-image"
                :src="resolveApiAssetUrl(item.imageUrl)"
                mode="aspectFill"
              />
              <view v-else class="product-image product-image--fallback">{{
                item.name.slice(0, 1)
              }}</view>
            </view>
          </view>
          <view class="product-summary">
            <text>共 {{ order.productSummary.totalQuantity }} 件</text>
            <text>¥{{ order.payableAmount }}</text>
          </view>
        </view>
        <view class="order-card__footer">
          <text>{{ order.isExpired ? '支付已超时' : formatTime(order.createdAt) }}</text>
          <text>订单号 {{ order.orderNo }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.orders-page {
  min-height: 100vh;
  padding-bottom: 32rpx;
}
.status-tabs {
  position: sticky;
  z-index: 4;
  top: 0;
  background: #ffffff;
  border-bottom: 1rpx solid #e4ece8;
  white-space: nowrap;
}
.status-tabs__inner {
  display: inline-flex;
  gap: 8rpx;
  padding: 20rpx 24rpx;
}
.status-tab {
  padding: 14rpx 24rpx;
  color: #65746d;
  font-size: 24rpx;
  background: #f3f7f5;
  border-radius: 28rpx;
}
.status-tab--active {
  color: #ffffff;
  background: #1f8f63;
}
.order-state {
  display: flex;
  min-height: 65vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.order-list {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
  padding: 28rpx;
}
.order-card {
  padding: 26rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}
.order-card__heading,
.store-heading,
.product-row,
.product-images,
.product-summary,
.order-card__footer {
  display: flex;
  align-items: center;
}
.order-card__heading,
.product-row,
.order-card__footer {
  justify-content: space-between;
}
.store-heading {
  min-width: 0;
  gap: 14rpx;
}
.store-logo {
  display: flex;
  width: 54rpx;
  height: 54rpx;
  flex: 0 0 54rpx;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
}
.store-logo--fallback {
  color: #1f8f63;
  background: #e8f6f0;
  font-size: 22rpx;
  font-weight: 700;
}
.store-name {
  overflow: hidden;
  font-size: 28rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-status {
  color: #1f8f63;
  font-size: 24rpx;
}
.product-row {
  margin-top: 24rpx;
  padding: 22rpx 0;
  border-top: 1rpx solid #edf2ef;
  border-bottom: 1rpx solid #edf2ef;
}
.product-images {
  gap: 12rpx;
}
.product-image {
  display: flex;
  width: 92rpx;
  height: 92rpx;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
}
.product-image--fallback {
  color: #1f8f63;
  background: #e8f6f0;
  font-size: 28rpx;
  font-weight: 700;
}
.product-summary {
  flex-direction: column;
  align-items: flex-end;
  gap: 10rpx;
  font-size: 24rpx;
}
.product-summary text:last-child {
  color: #d94f3d;
  font-size: 30rpx;
  font-weight: 700;
}
.order-card__footer {
  margin-top: 18rpx;
  color: #829087;
  font-size: 21rpx;
}
</style>
