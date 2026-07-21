<script setup lang="ts">
import { computed } from 'vue';

import type { CartView } from '../types/domain';

const props = withDefaults(defineProps<{ cart: CartView; busy?: boolean; actionText?: string }>(), {
  busy: false,
  actionText: '查看购物车',
});
const emit = defineEmits<{ open: []; action: [] }>();

const hint = computed(() => {
  const summary = props.cart.summary;
  if (summary.blockedReason === 'MINIMUM_ORDER_NOT_REACHED') {
    return `还差 ¥${summary.amountToMinimum} 起送`;
  }
  if (summary.blockedReason === 'ITEM_UNAVAILABLE') return '有商品已失效';
  if (summary.blockedReason === 'COMMUNITY_REQUIRED') return '请先选择配送小区';
  if (summary.blockedReason === 'STORE_UNAVAILABLE') return '店铺当前不可下单';
  return `另需配送费 ¥${summary.deliveryFee}`;
});
</script>

<template>
  <view class="cart-bar">
    <view class="cart-bar__summary" @click="emit('open')">
      <view class="cart-bar__icon-shell">
        <text class="cart-bar__icon">袋</text>
        <text v-if="cart.summary.itemCount" class="cart-bar__badge">
          {{ cart.summary.itemCount > 99 ? '99+' : cart.summary.itemCount }}
        </text>
      </view>
      <view>
        <text class="cart-bar__amount">¥{{ cart.summary.merchandiseTotal }}</text>
        <text class="cart-bar__hint">{{ hint }}</text>
      </view>
    </view>
    <button class="cart-bar__button" :loading="busy" :disabled="busy" @click="emit('action')">
      {{ actionText }}
    </button>
  </view>
</template>

<style scoped lang="scss">
.cart-bar {
  position: fixed;
  z-index: 30;
  right: 24rpx;
  bottom: calc(20rpx + env(safe-area-inset-bottom));
  left: 24rpx;
  display: flex;
  min-height: 104rpx;
  align-items: stretch;
  overflow: hidden;
  color: #ffffff;
  background: #20362d;
  border-radius: 56rpx;
  box-shadow: 0 12rpx 34rpx rgb(22 54 41 / 24%);
}

.cart-bar__summary {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 22rpx;
  padding: 12rpx 12rpx 12rpx 24rpx;
}

.cart-bar__icon-shell {
  position: relative;
  display: flex;
  width: 72rpx;
  height: 72rpx;
  flex: 0 0 72rpx;
  align-items: center;
  justify-content: center;
  color: #1f8f63;
  background: #ffffff;
  border-radius: 50%;
}

.cart-bar__icon {
  font-size: 26rpx;
  font-weight: 700;
}

.cart-bar__badge {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  min-width: 34rpx;
  height: 34rpx;
  padding: 0 8rpx;
  color: #ffffff;
  font-size: 20rpx;
  line-height: 34rpx;
  text-align: center;
  background: #d94f3d;
  border-radius: 18rpx;
}

.cart-bar__amount,
.cart-bar__hint {
  display: block;
}

.cart-bar__amount {
  font-size: 32rpx;
  font-weight: 700;
}

.cart-bar__hint {
  margin-top: 4rpx;
  color: #c8d6d0;
  font-size: 20rpx;
}

.cart-bar__button {
  display: flex;
  min-width: 190rpx;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0 30rpx;
  color: #ffffff;
  font-size: 27rpx;
  font-weight: 650;
  background: #1f8f63;
  border: 0;
  border-radius: 0;
}

.cart-bar__button::after {
  border: 0;
}

.cart-bar__button[disabled] {
  color: #dce7e2;
  background: #60776d;
}
</style>
