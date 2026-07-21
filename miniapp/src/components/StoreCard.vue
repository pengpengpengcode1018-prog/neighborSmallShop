<script setup lang="ts">
import { computed } from 'vue';

import type { StoreSummary } from '../types/domain';

const props = defineProps<{ store: StoreSummary }>();
const emit = defineEmits<{ select: [store: StoreSummary] }>();

const statusText = computed(() => (props.store.status === 'OPEN' ? '营业中' : '暂停接单'));
const statusType = computed(() => (props.store.status === 'OPEN' ? 'success' : 'warning'));
const deliveryText = computed(() => {
  if (!props.store.isDeliverable) return '选择小区后确认配送';
  return `约 ${props.store.estimatedDeliveryMinutes} 分钟送达`;
});
</script>

<template>
  <view class="store-card" @click="emit('select', store)">
    <view v-if="store.logoUrl" class="store-card__logo-shell">
      <image class="store-card__logo" mode="aspectFill" :src="store.logoUrl" />
    </view>
    <view v-else class="store-card__logo-shell store-card__logo-shell--fallback">
      <text>{{ store.name.slice(0, 1) }}</text>
    </view>
    <view class="store-card__content">
      <view class="store-card__heading">
        <text class="store-card__name">{{ store.name }}</text>
        <van-tag :type="statusType">{{ statusText }}</van-tag>
      </view>
      <text v-if="store.announcement" class="store-card__announcement">
        {{ store.announcement }}
      </text>
      <view class="store-card__facts">
        <text>起送 ¥{{ store.minimumOrderAmount }}</text>
        <text>配送 ¥{{ store.deliveryFee }}</text>
      </view>
      <text class="store-card__delivery">{{ deliveryText }}</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.store-card {
  display: flex;
  gap: 24rpx;
  padding: 28rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.store-card__logo-shell {
  display: flex;
  width: 132rpx;
  height: 132rpx;
  flex: 0 0 132rpx;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: #1f8f63;
  font-size: 44rpx;
  font-weight: 700;
  background: #e7f5ef;
  border-radius: 20rpx;
}

.store-card__logo {
  width: 100%;
  height: 100%;
}

.store-card__content {
  min-width: 0;
  flex: 1;
}

.store-card__heading,
.store-card__facts {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.store-card__name {
  overflow: hidden;
  font-size: 31rpx;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-card__announcement,
.store-card__delivery {
  display: block;
  overflow: hidden;
  color: #6b7a73;
  font-size: 24rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-card__announcement {
  margin-top: 12rpx;
}

.store-card__facts {
  margin-top: 20rpx;
  color: #344a40;
  font-size: 23rpx;
  justify-content: flex-start;
}

.store-card__delivery {
  margin-top: 10rpx;
  color: #1f8f63;
}
</style>
