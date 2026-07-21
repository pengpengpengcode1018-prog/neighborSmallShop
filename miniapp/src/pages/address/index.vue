<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

import { useAddressStore } from '../../stores/address';
import { useUserStore } from '../../stores/user';
import type { AddressLabel, AddressView } from '../../types/domain';

const labelNames: Record<AddressLabel, string> = {
  HOME: '家',
  COMPANY: '公司',
  SCHOOL: '学校',
  OTHER: '其他',
};

const addressStore = useAddressStore();
const { addresses, isLoading, isMutating, loadError, mutationError } = storeToRefs(addressStore);
const userStore = useUserStore();
const checkoutContext = ref(false);

onLoad((query) => {
  checkoutContext.value = query?.from === 'cart';
});

onShow(() => void load());

async function load(): Promise<void> {
  await userStore.restoreSession();
  if (!userStore.accessToken) {
    void uni.redirectTo({ url: '/pages/home/index' });
    return;
  }
  await addressStore.load(userStore.accessToken);
}

function addressLine(address: AddressView): string {
  return [address.community.name, address.building, address.unit, address.room, address.detail]
    .filter(Boolean)
    .join(' ');
}

function addAddress(): void {
  void uni.navigateTo({ url: '/pages/address/edit' });
}

function editAddress(address: AddressView): void {
  void uni.navigateTo({ url: `/pages/address/edit?id=${encodeURIComponent(address.id)}` });
}

async function setDefault(address: AddressView): Promise<void> {
  if (!userStore.accessToken || !address.available || isMutating.value) return;
  try {
    await addressStore.setDefault(userStore.accessToken, address.id);
  } catch {
    uni.showToast({ title: mutationError.value ?? '设置失败', icon: 'none' });
  }
}

function confirmDelete(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '删除收货地址？',
      content: '删除后不可恢复，历史订单中的地址快照不会变化。',
      confirmText: '删除',
      confirmColor: '#c33b31',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

async function remove(address: AddressView): Promise<void> {
  if (!userStore.accessToken || isMutating.value || !(await confirmDelete())) return;
  try {
    await addressStore.remove(userStore.accessToken, address.id);
  } catch {
    uni.showToast({ title: mutationError.value ?? '删除失败', icon: 'none' });
  }
}

function selectForCheckout(address: AddressView): void {
  if (!checkoutContext.value) return;
  if (!address.available) {
    uni.showToast({ title: '该地址所属小区已失效', icon: 'none' });
    return;
  }
  void uni.navigateTo({
    url: `/pages/order/confirm?addressId=${encodeURIComponent(address.id)}`,
  });
}
</script>

<template>
  <view class="address-page">
    <van-notice-bar v-if="checkoutContext" left-icon="info-o" text="请选择本次订单的收货地址。" />

    <view v-if="isLoading && addresses.length === 0" class="address-state">
      <van-loading type="spinner" color="#1f8f63">正在加载收货地址</van-loading>
    </view>
    <view v-else-if="loadError && addresses.length === 0" class="address-state">
      <van-empty :description="loadError" />
      <van-button size="small" type="primary" @click="load">重新加载</van-button>
    </view>
    <view v-else-if="addresses.length === 0" class="address-state">
      <van-empty description="还没有收货地址" />
      <van-button size="small" type="primary" @click="addAddress">添加地址</van-button>
    </view>
    <template v-else>
      <view class="address-heading">
        <view>
          <text class="address-heading__title">
            {{ checkoutContext ? '选择收货地址' : '我的收货地址' }}
          </text>
          <text class="address-heading__hint">地址只保存在你的登录账号中</text>
        </view>
        <van-button size="small" type="primary" @click="addAddress">新增</van-button>
      </view>

      <view class="address-list">
        <view
          v-for="address in addresses"
          :key="address.id"
          class="address-card"
          :class="{ 'address-card--unavailable': !address.available }"
          @click="selectForCheckout(address)"
        >
          <view class="address-card__heading">
            <view class="address-card__person">
              <text class="address-card__name">{{ address.recipientName }}</text>
              <text class="address-card__phone">{{ address.phone }}</text>
            </view>
            <view class="address-card__tags">
              <van-tag type="primary" plain>{{ labelNames[address.label] }}</van-tag>
              <van-tag v-if="address.isDefault" type="success">默认</van-tag>
            </view>
          </view>
          <text class="address-card__line">{{ addressLine(address) }}</text>
          <van-notice-bar
            v-if="!address.available"
            left-icon="warning-o"
            text="该小区已停用，请编辑到有效小区或删除地址。"
          />
          <view class="address-card__actions" @click.stop>
            <text
              v-if="!address.isDefault && address.available"
              class="address-action"
              @click="setDefault(address)"
            >
              设为默认
            </text>
            <text class="address-action" @click="editAddress(address)">编辑</text>
            <text class="address-action address-action--danger" @click="remove(address)">
              删除
            </text>
          </view>
        </view>
      </view>
      <text v-if="mutationError" class="address-error">{{ mutationError }}</text>
    </template>
  </view>
</template>

<style scoped lang="scss">
.address-page {
  min-height: 100vh;
  padding: 28rpx;
}

.address-state {
  display: flex;
  min-height: 70vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.address-heading,
.address-card__heading,
.address-card__person,
.address-card__tags,
.address-card__actions {
  display: flex;
  align-items: center;
}

.address-heading {
  justify-content: space-between;
  padding: 24rpx 8rpx;
}

.address-heading__title,
.address-heading__hint,
.address-card__line {
  display: block;
}

.address-heading__title {
  font-size: 38rpx;
  font-weight: 700;
}

.address-heading__hint {
  margin-top: 6rpx;
  color: #74827b;
  font-size: 22rpx;
}

.address-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.address-card {
  padding: 28rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.address-card--unavailable {
  background: #fffaf5;
}

.address-card__heading {
  justify-content: space-between;
  gap: 18rpx;
}

.address-card__person,
.address-card__tags {
  gap: 14rpx;
}

.address-card__name {
  font-size: 31rpx;
  font-weight: 700;
}

.address-card__phone {
  color: #65746d;
  font-size: 25rpx;
}

.address-card__line {
  margin: 22rpx 0;
  color: #34483f;
  font-size: 27rpx;
  line-height: 1.65;
}

.address-card__actions {
  justify-content: flex-end;
  gap: 34rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #edf2ef;
}

.address-action {
  color: #1f8f63;
  font-size: 25rpx;
}

.address-action--danger,
.address-error {
  color: #c33b31;
}

.address-error {
  display: block;
  margin-top: 18rpx;
  font-size: 23rpx;
  text-align: center;
}
</style>
