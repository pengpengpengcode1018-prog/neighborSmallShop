<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { onMounted } from 'vue';

import { useCommunityStore } from '../../stores/community';
import { useUserStore } from '../../stores/user';
import type { CommunitySummary } from '../../types/domain';

const communityStore = useCommunityStore();
const userStore = useUserStore();
const {
  communities,
  currentCommunity,
  isLoading,
  loadError,
  selectingCommunityId,
  selectionError,
} = storeToRefs(communityStore);

function retry(): void {
  void communityStore.loadCommunities();
}

async function choose(community: CommunitySummary): Promise<void> {
  try {
    const profile = await communityStore.selectCommunity(community, userStore.accessToken);
    if (profile) userStore.applyProfile(profile);
    uni.showToast({ title: '小区已更新', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 350);
  } catch {
    // The store exposes a stable, user-facing error beside the list.
  }
}

onMounted(() => {
  if (communities.value.length === 0) retry();
});
</script>

<template>
  <view class="page-shell">
    <view class="intro-card">
      <text class="intro-card__title">选择配送小区</text>
      <text class="intro-card__description">
        仅展示平台当前启用的小区；你可以随时切换，结算前必须完成选择。
      </text>
    </view>

    <view v-if="isLoading" class="state-card">
      <van-loading type="spinner" color="#1f8f63">正在加载配送小区</van-loading>
    </view>

    <view v-else-if="loadError" class="state-card">
      <text class="state-card__error">{{ loadError }}</text>
      <van-button type="primary" plain block @click="retry">重新加载</van-button>
    </view>

    <view v-else-if="communities.length === 0" class="state-card">
      <van-empty description="暂时没有可选择的配送小区" />
    </view>

    <view v-else class="community-list">
      <button
        v-for="community in communities"
        :key="community.id"
        class="community-option"
        :class="{ 'community-option--selected': currentCommunity?.id === community.id }"
        :disabled="selectingCommunityId !== null"
        @click="choose(community)"
      >
        <view class="community-option__heading">
          <text class="community-option__name">{{ community.name }}</text>
          <van-tag v-if="currentCommunity?.id === community.id" type="success">当前</van-tag>
        </view>
        <text class="community-option__region"
          >{{ community.city }} · {{ community.district }}</text
        >
        <text class="community-option__address">{{ community.detailedAddress }}</text>
        <van-loading
          v-if="selectingCommunityId === community.id"
          class="community-option__loading"
          size="32rpx"
          color="#1f8f63"
        >
          正在保存
        </van-loading>
      </button>
    </view>

    <text v-if="selectionError" class="selection-error">{{ selectionError }}</text>
  </view>
</template>

<style scoped lang="scss">
.page-shell {
  padding: 32rpx;
}

.intro-card,
.state-card,
.community-option {
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.intro-card,
.state-card {
  padding: 32rpx;
}

.intro-card__title,
.intro-card__description,
.state-card__error,
.community-option__region,
.community-option__address,
.selection-error {
  display: block;
}

.intro-card__title {
  font-size: 38rpx;
  font-weight: 700;
}

.intro-card__description {
  margin-top: 16rpx;
  color: #6b7a73;
  font-size: 26rpx;
  line-height: 1.65;
}

.state-card {
  margin-top: 24rpx;
  text-align: center;
}

.state-card__error {
  margin-bottom: 24rpx;
  color: #c33b31;
  font-size: 26rpx;
}

.community-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-top: 24rpx;
}

.community-option {
  position: relative;
  width: 100%;
  margin: 0;
  padding: 30rpx 32rpx;
  color: #21302a;
  line-height: 1.4;
  text-align: left;
}

.community-option::after {
  border: 0;
}

.community-option--selected {
  border-color: #1f8f63;
  box-shadow: 0 8rpx 24rpx rgb(31 143 99 / 10%);
}

.community-option__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.community-option__name {
  font-size: 32rpx;
  font-weight: 600;
}

.community-option__region {
  margin-top: 14rpx;
  color: #4f6259;
  font-size: 25rpx;
}

.community-option__address {
  margin-top: 8rpx;
  color: #84918b;
  font-size: 24rpx;
}

.community-option__loading {
  margin-top: 16rpx;
}

.selection-error {
  margin: 24rpx 8rpx 0;
  color: #c33b31;
  font-size: 24rpx;
}
</style>
