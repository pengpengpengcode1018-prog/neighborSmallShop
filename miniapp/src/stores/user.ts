import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  bindWechatPhone as bindWechatPhoneRequest,
  getUserProfile,
  loginWithWechatCode,
  updateUserProfile as updateUserProfileRequest,
  type UpdateUserProfileInput,
} from '../api/auth';
import type { UserProfile } from '../types/domain';
import { ApiRequestError } from '../utils/request';
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken as persistAccessToken,
} from '../utils/auth';
import { useCommunityStore } from './community';
import { useCartStore } from './cart';
import { useAddressStore } from './address';
import { useOrderStore } from './order';

function requestWechatCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success(result) {
        if (result.code) {
          resolve(result.code);
          return;
        }
        reject(new Error('WECHAT_CODE_MISSING'));
      },
      fail() {
        reject(new Error('WECHAT_LOGIN_CANCELLED'));
      },
    });
  });
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'WECHAT_LOGIN_FAILED') return '登录凭证已失效，请重新尝试';
    if (error.code === 'SERVICE_UNAVAILABLE') return '微信登录服务暂时不可用，请稍后重试';
    return error.message;
  }
  return '未能完成微信登录，请重试';
}

function phoneErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'WECHAT_PHONE_FAILED') return '手机号授权已失效，请重新授权';
    if (error.code === 'PHONE_ALREADY_BOUND') return '该手机号已绑定其他账号，请联系平台处理';
    if (error.code === 'RATE_LIMITED') return '授权操作过于频繁，请稍后重试';
    if (error.code === 'SERVICE_UNAVAILABLE') return '微信手机号服务暂时不可用，请稍后重试';
    return error.message;
  }
  return '未能完成手机号授权，请重试';
}

function profileErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'PAYLOAD_TOO_LARGE') return '头像文件过大，请重新选择';
    if (error.code === 'VALIDATION_ERROR') return '昵称或头像格式不正确，请重新填写';
    return error.message;
  }
  return '未能保存居民资料，请重试';
}

export const useUserStore = defineStore('user', () => {
  const accessToken = ref<string | null>(getAccessToken());
  const profile = ref<UserProfile | null>(null);
  const isRestoring = ref(false);
  const isLoggingIn = ref(false);
  const loginError = ref<string | null>(null);
  const isBindingPhone = ref(false);
  const phoneError = ref<string | null>(null);
  const isUpdatingProfile = ref(false);
  const profileError = ref<string | null>(null);
  const isAuthenticated = computed(() => accessToken.value !== null && profile.value !== null);

  async function setSession(token: string, user: UserProfile): Promise<void> {
    accessToken.value = token;
    profile.value = user;
    persistAccessToken(token);
    const syncedProfile = await useCommunityStore().syncAfterLogin(user.currentCommunity, token);
    if (syncedProfile) profile.value = syncedProfile;
  }

  function applyProfile(user: UserProfile): void {
    profile.value = user;
  }

  function clearSession(): void {
    accessToken.value = null;
    profile.value = null;
    phoneError.value = null;
    profileError.value = null;
    clearAccessToken();
    useCartStore().reset();
    useAddressStore().reset();
    useOrderStore().reset();
  }

  async function restoreSession(): Promise<void> {
    if (!accessToken.value || isRestoring.value || profile.value) return;
    isRestoring.value = true;
    try {
      const restoredProfile = await getUserProfile(accessToken.value);
      profile.value = restoredProfile;
      const syncedProfile = await useCommunityStore().syncAfterLogin(
        restoredProfile.currentCommunity,
        accessToken.value,
      );
      if (syncedProfile) profile.value = syncedProfile;
    } catch {
      clearSession();
    } finally {
      isRestoring.value = false;
    }
  }

  async function loginWithWechat(): Promise<void> {
    if (isLoggingIn.value) return;
    isLoggingIn.value = true;
    loginError.value = null;
    try {
      const code = await requestWechatCode();
      const session = await loginWithWechatCode(code);
      await setSession(session.token, session.user);
    } catch (error) {
      loginError.value = loginErrorMessage(error);
    } finally {
      isLoggingIn.value = false;
    }
  }

  async function bindWechatPhone(code: string | undefined): Promise<boolean> {
    if (!code) {
      phoneError.value = '你已取消手机号授权，可继续浏览并稍后重试';
      return false;
    }
    if (!accessToken.value || isBindingPhone.value) return false;
    isBindingPhone.value = true;
    phoneError.value = null;
    try {
      profile.value = await bindWechatPhoneRequest(accessToken.value, code);
      return true;
    } catch (error) {
      phoneError.value = phoneErrorMessage(error);
      return false;
    } finally {
      isBindingPhone.value = false;
    }
  }

  async function saveProfile(input: UpdateUserProfileInput): Promise<boolean> {
    if (!accessToken.value || isUpdatingProfile.value) return false;
    isUpdatingProfile.value = true;
    profileError.value = null;
    try {
      profile.value = await updateUserProfileRequest(accessToken.value, input);
      return true;
    } catch (error) {
      profileError.value = profileErrorMessage(error);
      return false;
    } finally {
      isUpdatingProfile.value = false;
    }
  }

  return {
    accessToken,
    profile,
    isAuthenticated,
    isRestoring,
    isLoggingIn,
    loginError,
    isBindingPhone,
    phoneError,
    isUpdatingProfile,
    profileError,
    restoreSession,
    loginWithWechat,
    bindWechatPhone,
    saveProfile,
    applyProfile,
    clearSession,
  };
});
