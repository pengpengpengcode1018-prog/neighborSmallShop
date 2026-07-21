import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductDetail, ProductListResult, ProductSummary } from '../src/types/domain';
import { ApiRequestError } from '../src/utils/request';

const api = vi.hoisted(() => ({
  getProduct: vi.fn(),
  listProducts: vi.fn(),
}));

vi.mock('../src/api/product', () => api);

import { useProductStore } from '../src/stores/product';

const product: ProductSummary = {
  id: 'product-on-sale',
  storeId: 'store-current',
  categoryId: 'category-featured',
  name: '鲜牛奶',
  mainImageUrl: null,
  description: '每日新鲜',
  price: '8.50',
  originalPrice: '10.00',
  stock: 12,
  salesVolume: 5,
  purchaseLimit: 3,
  isHot: true,
  status: 'ON_SALE',
  canPurchase: false,
};

function result(list: ProductSummary[]): ProductListResult {
  return {
    categories: [
      { id: 'category-featured', name: '精选' },
      { id: 'category-daily', name: '日常' },
    ],
    list,
    page: 1,
    pageSize: 100,
    total: list.length,
    totalPages: list.length ? 1 : 0,
  };
}

describe('miniapp resident product', () => {
  beforeEach(() => {
    api.getProduct.mockReset();
    api.listProducts.mockReset();
    setActivePinia(createPinia());
  });

  it('loads guest-visible categories and keeps server purchase eligibility', async () => {
    api.listProducts.mockResolvedValueOnce(result([product]));
    const store = useProductStore();

    await store.loadCatalog('store-current');

    expect(api.listProducts).toHaveBeenCalledWith('store-current', {
      page: 1,
      pageSize: 100,
    });
    expect(store.categories).toHaveLength(2);
    expect(store.products[0].canPurchase).toBe(false);
    expect(store.selectedCategoryId).toBeNull();
  });

  it('passes community and category context without calculating eligibility locally', async () => {
    const purchasable = { ...product, canPurchase: true };
    api.listProducts.mockResolvedValueOnce(result([purchasable]));
    const store = useProductStore();

    await store.loadCatalog('store-current', 'community-current', 'category-featured');

    expect(api.listProducts).toHaveBeenCalledWith('store-current', {
      communityId: 'community-current',
      categoryId: 'category-featured',
      page: 1,
      pageSize: 100,
    });
    expect(store.selectedCategoryId).toBe('category-featured');
    expect(store.products[0].canPurchase).toBe(true);
  });

  it('keeps only the newest category response', async () => {
    let resolveOld: ((value: ProductListResult) => void) | undefined;
    api.listProducts
      .mockImplementationOnce(
        () =>
          new Promise<ProductListResult>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(result([{ ...product, id: 'new-category-product' }]));
    const store = useProductStore();

    const oldRequest = store.loadCatalog('store-current', undefined, 'category-featured');
    await store.loadCatalog('store-current', undefined, 'category-daily');
    resolveOld?.(result([{ ...product, id: 'old-category-product' }]));
    await oldRequest;

    expect(store.selectedCategoryId).toBe('category-daily');
    expect(store.products[0].id).toBe('new-category-product');
  });

  it('clears stale catalog data and exposes stable category errors', async () => {
    api.listProducts.mockResolvedValueOnce(result([product]));
    const store = useProductStore();
    await store.loadCatalog('store-current');

    api.listProducts.mockRejectedValueOnce(
      new ApiRequestError('CATEGORY_NOT_FOUND', 'category unavailable'),
    );
    await store.loadCatalog('store-current', undefined, 'category-disabled');

    expect(store.categories).toEqual([]);
    expect(store.products).toEqual([]);
    expect(store.loadError).toBe('商品分类不存在或已停用');
    expect(store.isLoading).toBe(false);
  });

  it('loads complete product details in the same community context', async () => {
    const detail: ProductDetail = {
      ...product,
      galleryImageUrls: ['https://example.test/product.png'],
      detail: '商品图文详情',
      afterSaleNotes: '签收后请及时检查',
    };
    api.getProduct.mockResolvedValueOnce(detail);
    const store = useProductStore();

    await store.loadDetail(product.id, 'community-current');

    expect(api.getProduct).toHaveBeenCalledWith(product.id, 'community-current');
    expect(store.detail).toEqual(detail);
    expect(store.detailError).toBeNull();
  });
});
