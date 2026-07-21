import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '../src/utils/request';

const api = vi.hoisted(() => ({
  bindWechatPhone: vi.fn(),
  getUserProfile: vi.fn(),
  loginWithWechatCode: vi.fn(),
  updateUserProfile: vi.fn(),
}));

vi.mock('../src/api/auth', () => api);

import { useUserStore } from '../src/stores/user';

const profile = {
  id: 'test-user',
  nickname: null,
  avatarUrl: null,
  phone: null,
  phoneBound: false,
  currentCommunity: null,
};

const storage = new Map<string, unknown>();
const login = vi.fn();

Object.assign(globalThis, {
  uni: {
    getStorageSync(key: string) {
      return storage.get(key) ?? '';
    },
    setStorageSync(key: string, value: unknown) {
      storage.set(key, value);
    },
    removeStorageSync(key: string) {
      storage.delete(key);
    },
    login,
  },
});

describe('miniapp user session store', () => {
  beforeEach(() => {
    storage.clear();
    api.getUserProfile.mockReset();
    api.bindWechatPhone.mockReset();
    api.loginWithWechatCode.mockReset();
    api.updateUserProfile.mockReset();
    login.mockReset();
    setActivePinia(createPinia());
  });

  it('logs in with a temporary WeChat code and persists only the service token', async () => {
    login.mockImplementation((options) => {
      options.success({ code: 'temporary-code', errMsg: 'login:ok' });
    });
    api.loginWithWechatCode.mockResolvedValue({
      token: 'service-token',
      expiresIn: 28_800,
      user: profile,
    });
    const store = useUserStore();

    await store.loginWithWechat();

    expect(api.loginWithWechatCode).toHaveBeenCalledWith('temporary-code');
    expect(store.isAuthenticated).toBe(true);
    expect(store.profile).toEqual(profile);
    expect(storage.get('nearby-shop-access-token')).toBe('service-token');
  });

  it('restores a stored session and clears an expired session', async () => {
    storage.set('nearby-shop-access-token', 'stored-token');
    api.getUserProfile.mockResolvedValueOnce(profile);
    const restored = useUserStore();
    await restored.restoreSession();
    expect(restored.isAuthenticated).toBe(true);
    expect(api.getUserProfile).toHaveBeenCalledWith('stored-token');

    setActivePinia(createPinia());
    api.getUserProfile.mockRejectedValueOnce(new ApiRequestError('UNAUTHORIZED', 'expired'));
    const expired = useUserStore();
    await expired.restoreSession();
    expect(expired.isAuthenticated).toBe(false);
    expect(storage.has('nearby-shop-access-token')).toBe(false);
  });

  it('keeps guests recoverable when the provider is unavailable', async () => {
    login.mockImplementation((options) => {
      options.success({ code: 'temporary-code', errMsg: 'login:ok' });
    });
    api.loginWithWechatCode.mockRejectedValue(
      new ApiRequestError('SERVICE_UNAVAILABLE', 'service unavailable'),
    );
    const store = useUserStore();

    await store.loginWithWechat();

    expect(store.isAuthenticated).toBe(false);
    expect(store.loginError).toBe('微信登录服务暂时不可用，请稍后重试');
    expect(store.isLoggingIn).toBe(false);
  });

  it('binds an explicitly authorized phone and keeps refusal recoverable', async () => {
    storage.set('nearby-shop-access-token', 'stored-token');
    const store = useUserStore();
    api.bindWechatPhone.mockResolvedValueOnce({
      ...profile,
      phone: '13800138000',
      phoneBound: true,
    });

    await expect(store.bindWechatPhone('one-time-phone-code')).resolves.toBe(true);
    expect(api.bindWechatPhone).toHaveBeenCalledWith('stored-token', 'one-time-phone-code');
    expect(store.profile).toMatchObject({ phone: '13800138000', phoneBound: true });

    await expect(store.bindWechatPhone(undefined)).resolves.toBe(false);
    expect(store.phoneError).toBe('你已取消手机号授权，可继续浏览并稍后重试');
    expect(api.bindWechatPhone).toHaveBeenCalledTimes(1);
  });

  it('normalizes phone binding conflicts without persisting provider codes', async () => {
    storage.set('nearby-shop-access-token', 'stored-token');
    api.bindWechatPhone.mockRejectedValueOnce(
      new ApiRequestError('PHONE_ALREADY_BOUND', 'raw conflict'),
    );
    const store = useUserStore();

    await expect(store.bindWechatPhone('sensitive-code')).resolves.toBe(false);
    expect(store.phoneError).toBe('该手机号已绑定其他账号，请联系平台处理');
    expect(storage.has('sensitive-code')).toBe(false);
  });

  it('saves user-selected nickname and avatar without affecting authentication', async () => {
    storage.set('nearby-shop-access-token', 'stored-token');
    api.updateUserProfile.mockResolvedValueOnce({
      ...profile,
      nickname: '邻里居民',
      avatarUrl: '/api/v1/users/test-user/avatar?v=1',
    });
    const store = useUserStore();

    await expect(
      store.saveProfile({ nickname: '邻里居民', avatarBase64: 'base64-avatar' }),
    ).resolves.toBe(true);

    expect(api.updateUserProfile).toHaveBeenCalledWith('stored-token', {
      nickname: '邻里居民',
      avatarBase64: 'base64-avatar',
    });
    expect(store.profile).toMatchObject({ nickname: '邻里居民' });
    expect(store.isUpdatingProfile).toBe(false);
  });
});
