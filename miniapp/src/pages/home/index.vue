<script setup lang="ts">
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';
import { watch } from 'vue';

import StoreCard from '../../components/StoreCard.vue';
import { useCommunityStore } from '../../stores/community';
import { useStoreStore } from '../../stores/store';
import type { StoreSummary } from '../../types/domain';

const communityStore = useCommunityStore();
const { currentCommunity, currentCommunityName, selectionNotice } = storeToRefs(communityStore);
const storeStore = useStoreStore();
const { stores, keyword, isLoading, loadError } = storeToRefs(storeStore);

watch(
  () => currentCommunity.value?.id,
  (communityId) => void storeStore.loadStores(communityId),
  { immediate: true },
);

onPullDownRefresh(async () => {
  await storeStore.loadStores(currentCommunity.value?.id);
  uni.stopPullDownRefresh();
});

function openCommunitySelection(): void {
  void uni.navigateTo({ url: '/pages/community/index' });
}

function searchStores(): void {
  void storeStore.loadStores(currentCommunity.value?.id);
}

function openStore(store: StoreSummary): void {
  const communityQuery = currentCommunity.value?.id
    ? `&communityId=${encodeURIComponent(currentCommunity.value.id)}`
    : '';
  void uni.navigateTo({
    url: `/pages/store/index?id=${encodeURIComponent(store.id)}${communityQuery}`,
  });
}
</script>

<template>
  <view class="page-shell">
    <view class="status-card">
      <text class="status-card__label">当前小区</text>
      <view class="status-card__main">
        <text class="status-card__value">{{ currentCommunityName }}</text>
        <van-button type="primary" size="small" @click="openCommunitySelection">
          {{ currentCommunityName === '请先选择配送小区' ? '选择小区' : '切换小区' }}
        </van-button>
      </view>
      <text v-if="selectionNotice" class="status-card__notice">{{ selectionNotice }}</text>
    </view>

    <view class="store-section">
      <view class="store-section__heading">
        <view>
          <text class="store-section__title">附近店铺</text>
          <text class="store-section__hint">
            {{ currentCommunity ? '仅展示配送至当前小区的店铺' : '选择小区后可确认配送范围' }}
          </text>
        </view>
      </view>

      <van-search
        v-model="keyword"
        shape="round"
        placeholder="搜索店铺名称"
        show-action
        @search="searchStores"
        @clear="searchStores"
      >
        <template #action>
          <view class="search-action" @click="searchStores">搜索</view>
        </template>
      </van-search>

      <view v-if="isLoading" class="store-section__state">
        <van-loading type="spinner" color="#1f8f63">正在加载店铺</van-loading>
      </view>
      <view v-else-if="loadError" class="store-section__state">
        <van-empty :description="loadError" />
        <van-button size="small" type="primary" @click="searchStores">重新加载</van-button>
      </view>
      <view v-else-if="stores.length === 0" class="store-section__state">
        <van-empty description="没有找到符合条件的店铺" />
      </view>
      <view v-else class="store-list">
        <StoreCard v-for="store in stores" :key="store.id" :store="store" @select="openStore" />
      </view>
    </view>

    <view class="hero">
      <text class="hero__title">近邻小铺子</text>
      <text class="hero__subtitle">社区好物，送到家门口</text>
    </view>
  </view>
</template>

<style scoped lang="scss">
.page-shell {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  padding: 32rpx;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: auto;
  padding: 56rpx 8rpx 20rpx;
  color: #91a099;
  opacity: 0.45;
  pointer-events: none;
  text-align: center;
}

.hero__title {
  font-size: 30rpx;
  font-weight: 500;
  letter-spacing: 6rpx;
}

.hero__subtitle {
  margin-top: 6rpx;
  font-size: 20rpx;
  letter-spacing: 2rpx;
}

.status-card,
.store-section {
  margin-top: 28rpx;
  padding: 32rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.status-card__label,
.status-card__value {
  display: block;
}

.status-card__label {
  color: #7a8882;
  font-size: 24rpx;
}

.status-card__main {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 8rpx;
}

.status-card__value {
  min-width: 0;
  flex: 1;
  font-size: 34rpx;
  font-weight: 600;
}

.status-card__notice {
  display: block;
  margin-top: 16rpx;
  color: #b56a16;
  font-size: 24rpx;
}

.store-section {
  padding: 0;
  overflow: hidden;
}

.store-section__heading {
  padding: 32rpx 32rpx 8rpx;
}

.store-section__title,
.store-section__hint {
  display: block;
}

.store-section__title {
  font-size: 34rpx;
  font-weight: 650;
}

.store-section__hint {
  margin-top: 8rpx;
  color: #6b7a73;
  font-size: 24rpx;
}

.search-action {
  color: #1f8f63;
  font-size: 26rpx;
}

.store-section__state {
  display: flex;
  min-height: 260rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24rpx 32rpx 40rpx;
}

.store-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 12rpx 20rpx 24rpx;
}
</style>
