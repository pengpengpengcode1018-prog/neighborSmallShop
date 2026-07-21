import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { listAvailableCommunities, updateCurrentCommunity } from '../api/community';
import type { CommunitySummary, UserProfile } from '../types/domain';
import { ApiRequestError } from '../utils/request';
import { readStorage, removeStorage, writeStorage } from '../utils/storage';

const storageKey = 'nearby-shop-current-community';

function isCommunity(value: CommunitySummary | null): value is CommunitySummary {
  return Boolean(value && typeof value.id === 'string' && typeof value.name === 'string');
}

function selectionErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'COMMUNITY_NOT_FOUND') return '该小区已停用，请重新选择';
    return error.message;
  }
  return '小区选择失败，请稍后重试';
}

export const useCommunityStore = defineStore('community', () => {
  const storedCommunity = readStorage<CommunitySummary>(storageKey);
  const currentCommunity = ref<CommunitySummary | null>(
    isCommunity(storedCommunity) ? storedCommunity : null,
  );
  const communities = ref<CommunitySummary[]>([]);
  const isLoading = ref(false);
  const selectingCommunityId = ref<string | null>(null);
  const loadError = ref<string | null>(null);
  const selectionError = ref<string | null>(null);
  const selectionNotice = ref<string | null>(null);
  const currentCommunityName = computed(() => currentCommunity.value?.name ?? '请先选择配送小区');

  function persistCommunity(community: CommunitySummary): void {
    currentCommunity.value = community;
    writeStorage(storageKey, community);
  }

  function clearCommunity(): void {
    currentCommunity.value = null;
    removeStorage(storageKey);
  }

  async function loadCommunities(): Promise<void> {
    if (isLoading.value) return;
    isLoading.value = true;
    loadError.value = null;
    try {
      const response = await listAvailableCommunities();
      communities.value = response.list;
      if (currentCommunity.value) {
        const refreshed = response.list.find(
          (community) => community.id === currentCommunity.value?.id,
        );
        if (refreshed) {
          persistCommunity(refreshed);
        } else {
          clearCommunity();
          selectionNotice.value = '原小区已停用，请重新选择';
        }
      }
    } catch (error) {
      loadError.value = selectionErrorMessage(error);
    } finally {
      isLoading.value = false;
    }
  }

  async function selectCommunity(
    community: CommunitySummary,
    token?: string | null,
  ): Promise<UserProfile | null> {
    selectionError.value = null;
    selectionNotice.value = null;
    if (!token) {
      persistCommunity(community);
      return null;
    }

    selectingCommunityId.value = community.id;
    try {
      const profile = await updateCurrentCommunity(token, community.id);
      if (!profile.currentCommunity) throw new Error('CURRENT_COMMUNITY_MISSING');
      persistCommunity(profile.currentCommunity);
      return profile;
    } catch (error) {
      selectionError.value = selectionErrorMessage(error);
      throw error;
    } finally {
      selectingCommunityId.value = null;
    }
  }

  async function syncAfterLogin(
    serverCommunity: CommunitySummary | null,
    token: string,
  ): Promise<UserProfile | null> {
    selectionNotice.value = null;
    selectionError.value = null;
    if (serverCommunity) {
      persistCommunity(serverCommunity);
      return null;
    }
    if (!currentCommunity.value) return null;

    try {
      return await selectCommunity(currentCommunity.value, token);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'COMMUNITY_NOT_FOUND') {
        clearCommunity();
        selectionError.value = null;
        selectionNotice.value = '原小区已停用，请重新选择';
      } else {
        selectionNotice.value = '登录成功，本地小区将在网络恢复后同步';
      }
      return null;
    }
  }

  return {
    currentCommunity,
    currentCommunityName,
    communities,
    isLoading,
    selectingCommunityId,
    loadError,
    selectionError,
    selectionNotice,
    loadCommunities,
    selectCommunity,
    syncAfterLogin,
  };
});
