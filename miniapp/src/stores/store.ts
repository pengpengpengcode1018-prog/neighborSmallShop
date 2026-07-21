import { defineStore } from 'pinia';
import { ref } from 'vue';

import { getStore, listStores } from '../api/store';
import type { StoreSummary } from '../types/domain';
import { ApiRequestError } from '../utils/request';

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'COMMUNITY_NOT_FOUND') return '当前小区已停用，请重新选择';
    if (error.code === 'STORE_NOT_DELIVERABLE') return '该店铺暂不配送至当前小区';
    if (error.code === 'STORE_NOT_FOUND') return '店铺不存在或已停用';
    return error.message;
  }
  return '店铺加载失败，请稍后重试';
}

export const useStoreStore = defineStore('store', () => {
  const stores = ref<StoreSummary[]>([]);
  const keyword = ref('');
  const total = ref(0);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);
  const detail = ref<StoreSummary | null>(null);
  const isDetailLoading = ref(false);
  const detailError = ref<string | null>(null);
  let listRequestVersion = 0;
  let detailRequestVersion = 0;

  async function loadStores(communityId?: string): Promise<void> {
    const version = ++listRequestVersion;
    isLoading.value = true;
    loadError.value = null;
    try {
      const result = await listStores({
        ...(communityId ? { communityId } : {}),
        ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
        page: 1,
        pageSize: 20,
      });
      if (version !== listRequestVersion) return;
      stores.value = result.list;
      total.value = result.total;
    } catch (error) {
      if (version !== listRequestVersion) return;
      stores.value = [];
      total.value = 0;
      loadError.value = errorMessage(error);
    } finally {
      if (version === listRequestVersion) isLoading.value = false;
    }
  }

  async function loadDetail(storeId: string, communityId?: string): Promise<void> {
    const version = ++detailRequestVersion;
    detail.value = null;
    isDetailLoading.value = true;
    detailError.value = null;
    try {
      const result = await getStore(storeId, communityId);
      if (version === detailRequestVersion) detail.value = result;
    } catch (error) {
      if (version === detailRequestVersion) detailError.value = errorMessage(error);
    } finally {
      if (version === detailRequestVersion) isDetailLoading.value = false;
    }
  }

  return {
    stores,
    keyword,
    total,
    isLoading,
    loadError,
    detail,
    isDetailLoading,
    detailError,
    loadStores,
    loadDetail,
  };
});
