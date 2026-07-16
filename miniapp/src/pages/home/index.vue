<script setup lang="ts">
import { storeToRefs } from 'pinia';

import { useCommunityStore } from '../../stores/community';

const communityStore = useCommunityStore();
const { currentCommunityName } = storeToRefs(communityStore);
</script>

<template>
  <view class="page-shell">
    <view class="hero">
      <van-tag type="success" plain>工程基线</van-tag>
      <text class="hero__title">近邻小铺子</text>
      <text class="hero__subtitle">社区好物，送到家门口</text>
    </view>

    <van-notice-bar
      left-icon="info-o"
      text="当前是初始化页面，微信登录、店铺数据和支付将在后续计划中接入。"
    />

    <view class="status-card">
      <text class="status-card__label">当前小区</text>
      <text class="status-card__value">{{ currentCommunityName }}</text>
      <van-button type="primary" block disabled>选择小区（尚未实现）</van-button>
    </view>

    <view class="empty-card">
      <van-empty description="完成小区和店铺接口后，这里将展示可配送店铺" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.page-shell {
  padding: 32rpx;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 48rpx 8rpx 36rpx;
}

.hero__title {
  margin-top: 20rpx;
  font-size: 56rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
}

.hero__subtitle {
  margin-top: 8rpx;
  color: #6b7a73;
  font-size: 28rpx;
}

.status-card,
.empty-card {
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

.status-card__value {
  margin: 8rpx 0 28rpx;
  font-size: 34rpx;
  font-weight: 600;
}

.empty-card {
  padding-top: 0;
}
</style>
