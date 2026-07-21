import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoreListResult, StoreSummary } from '../src/types/domain';
import { ApiRequestError } from '../src/utils/request';

const api = vi.hoisted(() => ({
  getStore: vi.fn(),
  listStores: vi.fn(),
}));

vi.mock('../src/api/store', () => api);

import { useStoreStore } from '../src/stores/store';

const openStore: StoreSummary = {
  id: 'store-open',
  name: '阳光生鲜',
  logoUrl: null,
  coverUrl: null,
  description: '社区生鲜店',
  announcement: '今日新鲜到货',
  phone: '13800000000',
  address: '阳光路 1 号',
  businessStartTime: '08:00',
  businessEndTime: '22:00',
  minimumOrderAmount: '20.00',
  deliveryFee: '3.00',
  estimatedDeliveryMinutes: 30,
  asapDeliveryEnabled: true,
  scheduledDeliveryEnabled: true,
  deliverySlots: [],
  status: 'OPEN',
  isDeliverable: false,
  canOrder: false,
  deliveryCommunities: [],
};

function result(list: StoreSummary[]): StoreListResult {
  return { list, page: 1, pageSize: 20, total: list.length, totalPages: list.length ? 1 : 0 };
}

describe('miniapp resident store', () => {
  beforeEach(() => {
    api.getStore.mockReset();
    api.listStores.mockReset();
    setActivePinia(createPinia());
  });

  it('loads guest-visible stores without a community delivery context', async () => {
    api.listStores.mockResolvedValueOnce(result([openStore]));
    const store = useStoreStore();

    await store.loadStores();

    expect(api.listStores).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(store.stores).toEqual([openStore]);
    expect(store.stores[0].canOrder).toBe(false);
  });

  it('passes the selected community and trimmed name search to the server', async () => {
    const deliverable = { ...openStore, isDeliverable: true, canOrder: true };
    api.listStores.mockResolvedValueOnce(result([deliverable]));
    const store = useStoreStore();
    store.keyword = '  阳光  ';

    await store.loadStores('community-current');

    expect(api.listStores).toHaveBeenCalledWith({
      communityId: 'community-current',
      keyword: '阳光',
      page: 1,
      pageSize: 20,
    });
    expect(store.stores[0]).toEqual(deliverable);
  });

  it('keeps only the newest response when the community changes quickly', async () => {
    let resolveOld: ((value: StoreListResult) => void) | undefined;
    api.listStores
      .mockImplementationOnce(
        () =>
          new Promise<StoreListResult>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(result([{ ...openStore, id: 'new-context' }]));
    const store = useStoreStore();

    const oldRequest = store.loadStores('community-old');
    await store.loadStores('community-new');
    resolveOld?.(result([{ ...openStore, id: 'old-context' }]));
    await oldRequest;

    expect(store.stores[0].id).toBe('new-context');
  });

  it('clears stale stores and exposes recoverable errors', async () => {
    api.listStores.mockResolvedValueOnce(result([openStore]));
    const store = useStoreStore();
    await store.loadStores();

    api.listStores.mockRejectedValueOnce(
      new ApiRequestError('COMMUNITY_NOT_FOUND', 'community invalid'),
    );
    await store.loadStores('disabled-community');

    expect(store.stores).toEqual([]);
    expect(store.loadError).toBe('当前小区已停用，请重新选择');
    expect(store.isLoading).toBe(false);
  });

  it('loads store details in the same community context', async () => {
    api.getStore.mockResolvedValueOnce(openStore);
    const store = useStoreStore();

    await store.loadDetail(openStore.id, 'community-current');

    expect(api.getStore).toHaveBeenCalledWith(openStore.id, 'community-current');
    expect(store.detail).toEqual(openStore);
    expect(store.detailError).toBeNull();
  });
});
