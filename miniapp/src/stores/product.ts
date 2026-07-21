import { defineStore } from 'pinia';
import { ref } from 'vue';

import { getProduct, listProducts } from '../api/product';
import type { ProductCategorySummary, ProductDetail, ProductSummary } from '../types/domain';
import { ApiRequestError } from '../utils/request';

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'COMMUNITY_NOT_FOUND') return '当前小区已停用，请重新选择';
    if (error.code === 'STORE_NOT_DELIVERABLE') return '该店铺暂不配送至当前小区';
    if (error.code === 'STORE_NOT_FOUND') return '店铺不存在或已停用';
    if (error.code === 'CATEGORY_NOT_FOUND') return '商品分类不存在或已停用';
    if (error.code === 'PRODUCT_NOT_FOUND') return '商品不存在或已下架';
    return error.message;
  }
  return '商品加载失败，请稍后重试';
}

export const useProductStore = defineStore('product', () => {
  const categories = ref<ProductCategorySummary[]>([]);
  const products = ref<ProductSummary[]>([]);
  const selectedCategoryId = ref<string | null>(null);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);
  const detail = ref<ProductDetail | null>(null);
  const isDetailLoading = ref(false);
  const detailError = ref<string | null>(null);
  let listRequestVersion = 0;
  let detailRequestVersion = 0;

  async function loadCatalog(
    storeId: string,
    communityId?: string,
    categoryId?: string,
  ): Promise<void> {
    const version = ++listRequestVersion;
    selectedCategoryId.value = categoryId ?? null;
    isLoading.value = true;
    loadError.value = null;
    try {
      const result = await listProducts(storeId, {
        ...(communityId ? { communityId } : {}),
        ...(categoryId ? { categoryId } : {}),
        page: 1,
        pageSize: 100,
      });
      if (version !== listRequestVersion) return;
      categories.value = result.categories;
      products.value = result.list;
    } catch (error) {
      if (version !== listRequestVersion) return;
      categories.value = [];
      products.value = [];
      loadError.value = errorMessage(error);
    } finally {
      if (version === listRequestVersion) isLoading.value = false;
    }
  }

  async function loadDetail(productId: string, communityId?: string): Promise<void> {
    const version = ++detailRequestVersion;
    detail.value = null;
    isDetailLoading.value = true;
    detailError.value = null;
    try {
      const result = await getProduct(productId, communityId);
      if (version === detailRequestVersion) detail.value = result;
    } catch (error) {
      if (version === detailRequestVersion) detailError.value = errorMessage(error);
    } finally {
      if (version === detailRequestVersion) isDetailLoading.value = false;
    }
  }

  return {
    categories,
    products,
    selectedCategoryId,
    isLoading,
    loadError,
    detail,
    isDetailLoading,
    detailError,
    loadCatalog,
    loadDetail,
  };
});
