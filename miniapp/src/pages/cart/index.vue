<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';

import CartBar from '../../components/CartBar.vue';
import { useCartStore } from '../../stores/cart';
import { useUserStore } from '../../stores/user';
import type { CartItem } from '../../types/domain';
import { resolveApiAssetUrl } from '../../utils/request';

const cartStore = useCartStore();
const { cart, isLoading, isMutating, loadError, mutationError } = storeToRefs(cartStore);
const userStore = useUserStore();

async function load(): Promise<void> {
  await userStore.restoreSession();
  if (!userStore.accessToken) {
    void uni.redirectTo({ url: '/pages/home/index' });
    return;
  }
  await cartStore.load(userStore.accessToken);
}

onShow(() => void load());

async function changeQuantity(item: CartItem, quantity: number): Promise<void> {
  if (!userStore.accessToken || quantity < 1 || isMutating.value) return;
  try {
    await cartStore.updateQuantity(userStore.accessToken, item.id, quantity);
  } catch {
    uni.showToast({ title: mutationError.value ?? '更新失败', icon: 'none' });
  }
}

async function removeItem(item: CartItem): Promise<void> {
  if (!userStore.accessToken || isMutating.value) return;
  try {
    await cartStore.removeItem(userStore.accessToken, item.id);
  } catch {
    uni.showToast({ title: mutationError.value ?? '删除失败', icon: 'none' });
  }
}

function confirmClear(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '清空购物车？',
      content: '购物车内的商品将全部移除。',
      confirmText: '清空',
      confirmColor: '#c33b31',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

async function clear(): Promise<void> {
  if (!userStore.accessToken || !(await confirmClear())) return;
  try {
    await cartStore.clear(userStore.accessToken);
  } catch {
    uni.showToast({ title: mutationError.value ?? '清空失败', icon: 'none' });
  }
}

function checkout(): void {
  if (!cart.value.summary.canCheckout) {
    uni.showToast({ title: '请先处理购物车提示', icon: 'none' });
    return;
  }
  void uni.navigateTo({ url: '/pages/address/index?from=cart' });
}

function goShopping(): void {
  void uni.redirectTo({ url: '/pages/home/index' });
}
</script>

<template>
  <view class="cart-page">
    <view v-if="isLoading && cart.items.length === 0" class="cart-state">
      <van-loading type="spinner" color="#1f8f63">正在加载购物车</van-loading>
    </view>
    <view v-else-if="loadError && cart.items.length === 0" class="cart-state">
      <van-empty :description="loadError" />
      <van-button size="small" type="primary" @click="load">重新加载</van-button>
    </view>
    <view v-else-if="cart.items.length === 0" class="cart-state">
      <van-empty description="购物车还是空的" />
      <van-button size="small" type="primary" @click="goShopping"> 去逛逛 </van-button>
    </view>
    <template v-else>
      <view class="cart-heading">
        <view>
          <text class="cart-heading__eyebrow">当前店铺</text>
          <text class="cart-heading__name">{{ cart.store?.name }}</text>
        </view>
        <text class="cart-heading__clear" @click="clear">清空</text>
      </view>

      <view class="cart-list">
        <view v-for="item in cart.items" :key="item.id" class="cart-item">
          <image
            v-if="item.imageUrl"
            class="cart-item__image"
            mode="aspectFill"
            :src="resolveApiAssetUrl(item.imageUrl)"
          />
          <view v-else class="cart-item__image cart-item__image--fallback">
            {{ item.name.slice(0, 1) }}
          </view>
          <view class="cart-item__content">
            <text class="cart-item__name">{{ item.name }}</text>
            <text v-if="!item.available" class="cart-item__warning">
              {{
                item.unavailableReason === 'PRODUCT_OFF_SHELF'
                  ? '商品已下架'
                  : item.unavailableReason === 'PRODUCT_STOCK_NOT_ENOUGH'
                    ? '库存不足'
                    : '超过限购数量'
              }}
            </text>
            <view class="cart-item__footer">
              <text class="cart-item__price">¥{{ item.lineTotal }}</text>
              <view v-if="item.available" class="quantity-control">
                <button
                  class="quantity-control__button"
                  :disabled="item.quantity <= 1 || isMutating"
                  @click="changeQuantity(item, item.quantity - 1)"
                >
                  −
                </button>
                <text class="quantity-control__value">{{ item.quantity }}</text>
                <button
                  class="quantity-control__button"
                  :disabled="isMutating"
                  @click="changeQuantity(item, item.quantity + 1)"
                >
                  +
                </button>
              </view>
              <text v-else class="cart-item__remove" @click="removeItem(item)">移除</text>
            </view>
          </view>
        </view>
      </view>

      <view class="price-card">
        <view
          ><text>商品小计</text><text>¥{{ cart.summary.merchandiseTotal }}</text></view
        >
        <view
          ><text>配送费</text><text>¥{{ cart.summary.deliveryFee }}</text></view
        >
        <view class="price-card__total"
          ><text>预计合计</text><text>¥{{ cart.summary.payableTotal }}</text></view
        >
      </view>
      <text v-if="mutationError" class="cart-error">{{ mutationError }}</text>

      <CartBar :cart="cart" :busy="isMutating" action-text="去结算" @action="checkout" />
    </template>
  </view>
</template>

<style scoped lang="scss">
.cart-page {
  min-height: 100vh;
  padding: 28rpx 28rpx 190rpx;
}

.cart-state {
  display: flex;
  min-height: 70vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.cart-heading,
.cart-item,
.cart-item__footer,
.quantity-control,
.price-card > view {
  display: flex;
  align-items: center;
}

.cart-heading {
  justify-content: space-between;
  padding: 24rpx 8rpx;
}

.cart-heading__eyebrow,
.cart-heading__name {
  display: block;
}

.cart-heading__eyebrow {
  color: #74827b;
  font-size: 22rpx;
}

.cart-heading__name {
  margin-top: 6rpx;
  font-size: 36rpx;
  font-weight: 700;
}

.cart-heading__clear,
.cart-item__remove {
  color: #c33b31;
  font-size: 25rpx;
}

.cart-list,
.price-card {
  overflow: hidden;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.cart-item {
  gap: 22rpx;
  padding: 26rpx;
  border-bottom: 1rpx solid #edf2ef;
}

.cart-item:last-child {
  border-bottom: 0;
}

.cart-item__image {
  display: flex;
  width: 136rpx;
  height: 136rpx;
  flex: 0 0 136rpx;
  align-items: center;
  justify-content: center;
  border-radius: 18rpx;
}

.cart-item__image--fallback {
  color: #1f8f63;
  font-size: 40rpx;
  font-weight: 700;
  background: #e7f5ef;
}

.cart-item__content {
  min-width: 0;
  flex: 1;
}

.cart-item__name,
.cart-item__warning {
  display: block;
}

.cart-item__name {
  overflow: hidden;
  font-size: 29rpx;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cart-item__warning {
  margin-top: 8rpx;
  color: #c33b31;
  font-size: 22rpx;
}

.cart-item__footer {
  justify-content: space-between;
  margin-top: 26rpx;
}

.cart-item__price {
  color: #d94f3d;
  font-size: 28rpx;
  font-weight: 700;
}

.quantity-control {
  overflow: hidden;
  border: 1rpx solid #dbe5e0;
  border-radius: 28rpx;
}

.quantity-control__button {
  display: flex;
  width: 58rpx;
  height: 52rpx;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  color: #1f8f63;
  font-size: 31rpx;
  line-height: 1;
  background: #f4f8f6;
  border: 0;
  border-radius: 0;
}

.quantity-control__button::after {
  border: 0;
}

.quantity-control__value {
  min-width: 52rpx;
  font-size: 24rpx;
  text-align: center;
}

.price-card {
  margin-top: 24rpx;
  padding: 24rpx 28rpx;
}

.price-card > view {
  justify-content: space-between;
  padding: 10rpx 0;
  color: #627168;
  font-size: 25rpx;
}

.price-card > .price-card__total {
  color: #21302a;
  font-size: 29rpx;
  font-weight: 700;
}

.cart-error {
  display: block;
  margin-top: 18rpx;
  color: #c33b31;
  font-size: 23rpx;
  text-align: center;
}
</style>
