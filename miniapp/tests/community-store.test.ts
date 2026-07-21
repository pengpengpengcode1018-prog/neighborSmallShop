import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommunitySummary, UserProfile } from '../src/types/domain';
import { ApiRequestError } from '../src/utils/request';

const api = vi.hoisted(() => ({
  listAvailableCommunities: vi.fn(),
  updateCurrentCommunity: vi.fn(),
}));

vi.mock('../src/api/community', () => api);

import { useCommunityStore } from '../src/stores/community';

const first: CommunitySummary = {
  id: 'community-first',
  name: '阳光小区',
  city: '测试市',
  district: '一区',
  detailedAddress: '阳光路 1 号',
};
const second: CommunitySummary = {
  id: 'community-second',
  name: '幸福花园',
  city: '测试市',
  district: '二区',
  detailedAddress: '幸福路 2 号',
};

function profile(currentCommunity: CommunitySummary | null): UserProfile {
  return {
    id: 'test-user',
    nickname: null,
    avatarUrl: null,
    phone: null,
    phoneBound: false,
    currentCommunity,
  };
}

const storage = new Map<string, unknown>();

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
  },
});

describe('miniapp community selection store', () => {
  beforeEach(() => {
    storage.clear();
    api.listAvailableCommunities.mockReset();
    api.updateCurrentCommunity.mockReset();
    setActivePinia(createPinia());
  });

  it('restores a valid local selection and clears it after the public list invalidates it', async () => {
    storage.set('nearby-shop-current-community', first);
    api.listAvailableCommunities.mockResolvedValueOnce({ list: [first, second] });
    const store = useCommunityStore();
    await store.loadCommunities();
    expect(store.currentCommunity).toEqual(first);

    api.listAvailableCommunities.mockResolvedValueOnce({ list: [second] });
    await store.loadCommunities();
    expect(store.currentCommunity).toBeNull();
    expect(storage.has('nearby-shop-current-community')).toBe(false);
    expect(store.selectionNotice).toBe('原小区已停用，请重新选择');
  });

  it('persists a guest selection without calling the protected endpoint', async () => {
    const store = useCommunityStore();
    await store.selectCommunity(first);
    expect(store.currentCommunity).toEqual(first);
    expect(storage.get('nearby-shop-current-community')).toEqual(first);
    expect(api.updateCurrentCommunity).not.toHaveBeenCalled();
  });

  it('uses the account selection on login and only uploads local state when the account is empty', async () => {
    storage.set('nearby-shop-current-community', first);
    const store = useCommunityStore();

    await store.syncAfterLogin(second, 'service-token');
    expect(store.currentCommunity).toEqual(second);
    expect(api.updateCurrentCommunity).not.toHaveBeenCalled();

    api.updateCurrentCommunity.mockResolvedValueOnce(profile(second));
    setActivePinia(createPinia());
    storage.set('nearby-shop-current-community', first);
    const emptyAccount = useCommunityStore();
    const synced = await emptyAccount.syncAfterLogin(null, 'service-token');
    expect(api.updateCurrentCommunity).toHaveBeenCalledWith('service-token', first.id);
    expect(synced).toEqual(profile(second));
    expect(emptyAccount.currentCommunity).toEqual(second);
  });

  it('preserves the previous selection when an authenticated update has a network failure', async () => {
    storage.set('nearby-shop-current-community', first);
    api.updateCurrentCommunity.mockRejectedValueOnce(
      new ApiRequestError('NETWORK_ERROR', '网络连接失败，请稍后重试'),
    );
    const store = useCommunityStore();

    await expect(store.selectCommunity(second, 'service-token')).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(store.currentCommunity).toEqual(first);
    expect(storage.get('nearby-shop-current-community')).toEqual(first);
    expect(store.selectionError).toBe('网络连接失败，请稍后重试');
  });
});
