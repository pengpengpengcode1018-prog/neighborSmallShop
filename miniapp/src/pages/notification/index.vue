<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';

import { useNotificationStore } from '../../stores/notification';
import { useUserStore } from '../../stores/user';
import type { SubscriptionDecision, SubscriptionGroup } from '../../types/domain';

const userStore = useUserStore();
const notificationStore = useNotificationStore();
const { settings, loading, reporting, error } = storeToRefs(notificationStore);

onLoad(() => {
  void initialize();
});

async function initialize(): Promise<void> {
  await userStore.restoreSession();
  if (!userStore.accessToken) {
    void uni.redirectTo({ url: '/pages/home/index' });
    return;
  }
  await notificationStore.load(userStore.accessToken);
}

function requestWechatTemplates(templateIds: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      success: (result) => resolve(result as unknown as Record<string, unknown>),
      fail: reject,
    });
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error('wechat_mini_program_required'));
    // #endif
  });
}

async function subscribe(group: SubscriptionGroup): Promise<void> {
  if (!userStore.accessToken || reporting.value) return;
  const templates = group.templates.slice(0, settings.value?.maxTemplatesPerRequest ?? 5);
  try {
    const result = await requestWechatTemplates(templates.map((item) => item.templateId));
    const decisions = new Set<SubscriptionDecision>(['accept', 'reject', 'ban', 'filter']);
    const reported = templates.flatMap((template) => {
      const value = result[template.templateId];
      return typeof value === 'string' && decisions.has(value as SubscriptionDecision)
        ? [{ templateId: template.templateId, decision: value as SubscriptionDecision }]
        : [];
    });
    const saved = await notificationStore.report(userStore.accessToken, reported);
    if (!saved) {
      uni.showToast({ title: error.value ?? '授权结果保存失败', icon: 'none' });
      return;
    }
    const accepted = reported.filter((item) => item.decision === 'accept').length;
    uni.showToast({
      title: accepted > 0 ? `已订阅 ${accepted} 类通知` : '未新增通知授权',
      icon: accepted > 0 ? 'success' : 'none',
    });
  } catch {
    uni.showToast({ title: '请在微信小程序中主动开启通知', icon: 'none' });
  }
}

function availableCount(group: SubscriptionGroup): number {
  const templateIds = new Set(group.templates.map((item) => item.templateId));
  return (
    settings.value?.consents
      .filter((item) => templateIds.has(item.templateId))
      .reduce((total, item) => total + item.reportedAvailableCount, 0) ?? 0
  );
}
</script>

<template>
  <view class="notification-page">
    <view class="intro-card">
      <text class="intro-card__eyebrow">微信订阅消息</text>
      <text class="intro-card__title">重要进度，及时知道</text>
      <text class="intro-card__description">
        微信采用单次订阅：每次同意通常可接收对应模板的一条消息。只有点击下方按钮时才会弹出授权。
      </text>
    </view>

    <view v-if="loading" class="page-state">
      <van-loading type="spinner" color="#1f8f63">正在加载通知设置</van-loading>
    </view>
    <view v-else-if="error && !settings" class="page-state">
      <van-empty :description="error" />
      <van-button size="small" type="primary" @click="initialize">重新加载</van-button>
    </view>
    <view v-else-if="settings && settings.groups.length === 0" class="page-state">
      <van-empty description="通知模板尚未配置，请稍后再来" />
    </view>
    <template v-else-if="settings">
      <view v-for="group in settings.groups" :key="group.key" class="group-card">
        <view class="group-card__heading">
          <view>
            <text class="group-card__title">{{ group.title }}</text>
            <text class="group-card__count">已报告可用次数 {{ availableCount(group) }}</text>
          </view>
          <button class="subscribe-button" :disabled="reporting" @click="subscribe(group)">
            {{ reporting ? '保存中…' : '主动订阅' }}
          </button>
        </view>
        <view class="scene-list">
          <text v-for="template in group.templates" :key="template.templateId">
            {{ template.label }}
          </text>
        </view>
      </view>
      <view class="notice-card">
        <text>说明</text>
        <text>消息只是进度提醒，订单与退款结果始终以“我的订单”页面为准。</text>
        <text>若微信中关闭了订阅总开关，发送时可能仍会失败，可重新点击按钮确认。</text>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.notification-page {
  min-height: 100vh;
  padding: 28rpx;
}
.intro-card {
  padding: 38rpx 32rpx;
  color: #ffffff;
  background: linear-gradient(135deg, #176b4d, #39a778);
  border-radius: 26rpx;
}
.intro-card__eyebrow,
.intro-card__title,
.intro-card__description,
.group-card__title,
.group-card__count,
.scene-list text,
.notice-card text {
  display: block;
}
.intro-card__eyebrow {
  font-size: 22rpx;
  font-weight: 700;
  opacity: 0.78;
}
.intro-card__title {
  margin-top: 12rpx;
  font-size: 40rpx;
  font-weight: 750;
}
.intro-card__description {
  margin-top: 18rpx;
  font-size: 24rpx;
  line-height: 1.7;
  opacity: 0.9;
}
.page-state {
  display: flex;
  min-height: 55vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.group-card,
.notice-card {
  margin-top: 22rpx;
  padding: 30rpx;
  background: #ffffff;
  border: 1rpx solid #e2ece7;
  border-radius: 24rpx;
}
.group-card__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}
.group-card__title {
  font-size: 30rpx;
  font-weight: 700;
}
.group-card__count {
  margin-top: 8rpx;
  color: #74837b;
  font-size: 21rpx;
}
.subscribe-button {
  margin: 0;
  padding: 0 30rpx;
  color: #ffffff;
  font-size: 24rpx;
  line-height: 68rpx;
  background: #1f8f63;
  border-radius: 36rpx;
}
.subscribe-button::after {
  border: 0;
}
.subscribe-button[disabled] {
  opacity: 0.55;
}
.scene-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 24rpx;
}
.scene-list text {
  padding: 9rpx 16rpx;
  color: #35755d;
  font-size: 22rpx;
  background: #edf8f3;
  border-radius: 24rpx;
}
.notice-card text:first-child {
  color: #273a31;
  font-size: 25rpx;
  font-weight: 700;
}
.notice-card text:not(:first-child) {
  margin-top: 12rpx;
  color: #728079;
  font-size: 22rpx;
  line-height: 1.6;
}
</style>
