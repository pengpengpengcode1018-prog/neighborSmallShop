<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

import { useUserStore } from '../../stores/user';
import { resolveApiAssetUrl } from '../../utils/request';

const userStore = useUserStore();
const {
  isAuthenticated,
  isLoggingIn,
  isRestoring,
  loginError,
  profile,
  isBindingPhone,
  phoneError,
  isUpdatingProfile,
  profileError,
} = storeToRefs(userStore);
const profileEditorOpen = ref(false);
const nicknameDraft = ref('');
const avatarPreview = ref('');
const pendingAvatarBase64 = ref<string | null>(null);
const displayName = computed(() => profile.value?.nickname?.trim() || '微信用户');
const displayAvatar = computed(() => resolveApiAssetUrl(profile.value?.avatarUrl));
const profileInitial = computed(() => displayName.value.slice(0, 1));

function login(): void {
  void userStore.loginWithWechat();
}

interface PhoneNumberEvent {
  detail: { code?: string; errMsg?: string };
}

async function authorizePhone(event: PhoneNumberEvent): Promise<void> {
  const success = await userStore.bindWechatPhone(event.detail.code);
  uni.showToast({
    title: success ? '手机号已绑定' : (userStore.phoneError ?? '授权未完成'),
    icon: success ? 'success' : 'none',
  });
}

interface ChooseAvatarEvent {
  detail: { avatarUrl?: string };
}

function compressAvatar(sourcePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: sourcePath,
      quality: 70,
      success: ({ tempFilePath }) => resolve(tempFilePath),
      fail: reject,
    });
  });
}

function readAvatarBase64(filePath: string): string {
  const data = wx.getFileSystemManager().readFileSync(filePath, 'base64');
  if (typeof data !== 'string') throw new Error('AVATAR_READ_FAILED');
  return data;
}

function openProfileEditor(): void {
  nicknameDraft.value = profile.value?.nickname ?? '';
  avatarPreview.value = displayAvatar.value;
  pendingAvatarBase64.value = null;
  profileEditorOpen.value = true;
}

function closeProfileEditor(): void {
  if (isUpdatingProfile.value) return;
  profileEditorOpen.value = false;
}

async function chooseAvatar(event: ChooseAvatarEvent): Promise<void> {
  const sourcePath = event.detail.avatarUrl;
  if (!sourcePath) return;

  uni.showLoading({ title: '正在处理头像' });
  try {
    const compressedPath = await compressAvatar(sourcePath);
    const base64 = readAvatarBase64(compressedPath);
    if (Math.floor((base64.length * 3) / 4) > 512 * 1024) {
      throw new Error('AVATAR_TOO_LARGE');
    }
    avatarPreview.value = compressedPath;
    pendingAvatarBase64.value = base64;
  } catch (error) {
    uni.showToast({
      title:
        error instanceof Error && error.message === 'AVATAR_TOO_LARGE'
          ? '头像文件过大，请重新选择'
          : '未能读取头像',
      icon: 'none',
    });
  } finally {
    uni.hideLoading();
  }
}

async function saveResidentProfile(): Promise<void> {
  const nickname = nicknameDraft.value.trim();
  const input = {
    ...(nickname ? { nickname } : {}),
    ...(pendingAvatarBase64.value ? { avatarBase64: pendingAvatarBase64.value } : {}),
  };
  if (!input.nickname && !input.avatarBase64) {
    uni.showToast({ title: '请填写昵称或选择头像', icon: 'none' });
    return;
  }

  const success = await userStore.saveProfile(input);
  uni.showToast({
    title: success ? '居民资料已保存' : (userStore.profileError ?? '保存失败'),
    icon: success ? 'success' : 'none',
  });
  if (success) profileEditorOpen.value = false;
}

function openAddresses(): void {
  void uni.navigateTo({ url: '/pages/address/index' });
}

function openOrders(): void {
  void uni.switchTab({ url: '/pages/order/index' });
}
</script>

<template>
  <view class="page-shell">
    <view class="login-card">
      <template v-if="isRestoring">
        <van-loading type="spinner" color="#1f8f63">正在恢复登录状态</van-loading>
      </template>
      <template v-else-if="isAuthenticated">
        <view class="resident-profile">
          <image
            v-if="displayAvatar"
            class="resident-profile__avatar"
            :src="displayAvatar"
            mode="aspectFill"
          />
          <view v-else class="resident-profile__avatar resident-profile__avatar--fallback">
            {{ profileInitial }}
          </view>
          <view class="resident-profile__identity">
            <view class="login-card__heading">
              <van-tag type="success">已登录</van-tag>
              <text class="login-card__title">{{ displayName }}</text>
            </view>
            <text class="resident-profile__hint">微信会话已连接</text>
          </view>
          <button class="resident-profile__edit" @click="openProfileEditor">
            {{ profile?.nickname || profile?.avatarUrl ? '编辑资料' : '完善资料' }}
          </button>
        </view>
        <text class="login-card__description">
          {{ profile?.phoneBound ? '手机号已绑定' : '请授权手机号后使用地址、订单和支付能力' }}
        </text>
        <view v-if="profileEditorOpen" class="profile-editor">
          <text class="profile-editor__title">完善居民资料</text>
          <text class="profile-editor__privacy">
            头像和昵称仅在你主动选择或填写后保存，不完善也可继续使用。
          </text>
          <view class="profile-editor__row">
            <button
              class="profile-editor__avatar-button"
              open-type="chooseAvatar"
              @chooseavatar="chooseAvatar"
            >
              <image
                v-if="avatarPreview"
                class="profile-editor__avatar"
                :src="avatarPreview"
                mode="aspectFill"
              />
              <view v-else class="profile-editor__avatar profile-editor__avatar--empty"
                >选头像</view
              >
            </button>
            <input
              v-model="nicknameDraft"
              class="profile-editor__nickname"
              type="nickname"
              maxlength="64"
              placeholder="填写昵称"
            />
          </view>
          <text v-if="profileError" class="login-card__error">{{ profileError }}</text>
          <view class="profile-editor__actions">
            <view class="profile-editor__action">
              <van-button plain block :disabled="isUpdatingProfile" @click="closeProfileEditor">
                稍后完善
              </van-button>
            </view>
            <view class="profile-editor__action">
              <van-button
                type="primary"
                block
                :loading="isUpdatingProfile"
                @click="saveResidentProfile"
              >
                保存资料
              </van-button>
            </view>
          </view>
        </view>
        <button
          v-if="!profile?.phoneBound"
          class="wechat-phone-button"
          open-type="getPhoneNumber"
          :loading="isBindingPhone"
          @getphonenumber="authorizePhone"
        >
          授权微信手机号
        </button>
        <text v-if="phoneError" class="login-card__error">{{ phoneError }}</text>
        <view class="login-card__actions">
          <van-button type="primary" block @click="openOrders">我的订单</van-button>
          <van-button type="primary" plain block @click="openAddresses">收货地址</van-button>
          <van-button plain block @click="userStore.clearSession">退出登录</van-button>
        </view>
      </template>
      <template v-else>
        <text class="login-card__title">登录后使用完整服务</text>
        <text class="login-card__description">
          先连接微信身份；登录后由你单独点击授权手机号，拒绝授权仍可浏览。
        </text>
        <van-button type="primary" block :loading="isLoggingIn" @click="login">
          微信登录
        </van-button>
        <text v-if="loginError" class="login-card__error">{{ loginError }}</text>
      </template>
    </view>
  </view>
</template>

<style scoped lang="scss">
.page-shell {
  padding: 32rpx;
}

.login-card {
  padding: 32rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.login-card__heading {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.resident-profile {
  display: flex;
  align-items: center;
  gap: 18rpx;
}

.resident-profile__avatar,
.profile-editor__avatar {
  width: 88rpx;
  height: 88rpx;
  flex: 0 0 88rpx;
  border-radius: 50%;
}

.resident-profile__avatar--fallback,
.profile-editor__avatar--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e6f5ef;
  color: #1f8f63;
  font-size: 30rpx;
  font-weight: 650;
}

.resident-profile__identity {
  min-width: 0;
  flex: 1;
}

.resident-profile__hint {
  display: block;
  margin-top: 8rpx;
  color: #7a8882;
  font-size: 23rpx;
}

.resident-profile__edit {
  flex: 0 0 auto;
  margin: 0;
  padding: 12rpx 18rpx;
  border: 1rpx solid #1f8f63;
  border-radius: 10rpx;
  background: #ffffff;
  color: #1f8f63;
  font-size: 23rpx;
  line-height: 1.4;
}

.resident-profile__edit::after,
.profile-editor__avatar-button::after {
  border: 0;
}

.profile-editor {
  margin: 0 0 28rpx;
  padding: 24rpx;
  border: 1rpx solid #dbe8e2;
  border-radius: 16rpx;
  background: #f7fbf9;
}

.profile-editor__title,
.profile-editor__privacy {
  display: block;
}

.profile-editor__title {
  font-size: 28rpx;
  font-weight: 650;
}

.profile-editor__privacy {
  margin-top: 8rpx;
  color: #6b7a73;
  font-size: 23rpx;
  line-height: 1.6;
}

.profile-editor__row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 20rpx;
}

.profile-editor__avatar-button {
  width: 88rpx;
  height: 88rpx;
  flex: 0 0 88rpx;
  margin: 0;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  line-height: normal;
}

.profile-editor__avatar--empty {
  font-size: 20rpx;
  font-weight: 500;
}

.profile-editor__nickname {
  height: 76rpx;
  min-width: 0;
  flex: 1;
  box-sizing: border-box;
  padding: 0 20rpx;
  border: 1rpx solid #d3e0da;
  border-radius: 10rpx;
  background: #ffffff;
  font-size: 27rpx;
}

.profile-editor__actions {
  display: flex;
  gap: 16rpx;
  margin-top: 22rpx;
}

.profile-editor__action {
  min-width: 0;
  flex: 1;
}

.login-card__actions {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.login-card__title,
.login-card__description,
.login-card__error {
  display: block;
}

.wechat-phone-button {
  width: 100%;
  margin: 0 0 20rpx;
  padding: 22rpx 24rpx;
  border: 0;
  border-radius: 10rpx;
  background: #07c160;
  color: #ffffff;
  font-size: 28rpx;
  line-height: 1.4;
}

.wechat-phone-button::after {
  border: 0;
}

.login-card__title {
  font-size: 32rpx;
  font-weight: 600;
}

.login-card__description {
  margin: 16rpx 0 28rpx;
  color: #6b7a73;
  font-size: 26rpx;
  line-height: 1.6;
}

.login-card__error {
  margin-top: 20rpx;
  color: #c33b31;
  font-size: 24rpx;
}
</style>
