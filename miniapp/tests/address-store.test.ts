import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddressInput, AddressListResult, AddressView } from '../src/types/domain';
import { ApiRequestError } from '../src/utils/request';

const api = vi.hoisted(() => ({
  listAddresses: vi.fn(),
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  setDefaultAddress: vi.fn(),
  removeAddress: vi.fn(),
}));

vi.mock('../src/api/address', () => api);

import { useAddressStore } from '../src/stores/address';

const input: AddressInput = {
  recipientName: '张三',
  phone: '13812345678',
  communityId: 'community-current',
  building: '1号楼',
  unit: '2单元',
  room: '301室',
  detail: '东门进入',
  label: 'HOME',
};

function address(overrides: Partial<AddressView> = {}): AddressView {
  return {
    id: 'address-current',
    recipientName: input.recipientName,
    phone: input.phone,
    community: {
      id: input.communityId,
      name: '阳光小区',
      city: '测试市',
      district: '一区',
      detailedAddress: '阳光路 1 号',
    },
    building: input.building,
    unit: input.unit,
    room: input.room,
    detail: input.detail,
    label: input.label,
    isDefault: true,
    available: true,
    unavailableReason: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

function result(list: AddressView[]): AddressListResult {
  return { list };
}

describe('miniapp resident address store', () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset();
    setActivePinia(createPinia());
  });

  it('loads only the authenticated resident address list', async () => {
    api.listAddresses.mockResolvedValueOnce(result([address()]));
    const store = useAddressStore();
    await store.load('service-token');
    expect(api.listAddresses).toHaveBeenCalledWith('service-token');
    expect(store.addresses).toEqual([address()]);
    expect(store.loadError).toBeNull();
  });

  it('applies server-confirmed create and update results', async () => {
    const created = address();
    const updated = address({ recipientName: '李四', label: 'COMPANY' });
    api.createAddress.mockResolvedValueOnce(result([created]));
    api.updateAddress.mockResolvedValueOnce(result([updated]));
    const store = useAddressStore();
    await store.create('service-token', { ...input, isDefault: false });
    expect(api.createAddress).toHaveBeenCalledWith('service-token', {
      ...input,
      isDefault: false,
    });
    expect(store.addresses[0]).toEqual(created);
    await store.update('service-token', created.id, { ...input, recipientName: '李四' });
    expect(store.addresses[0]).toEqual(updated);
  });

  it('keeps the last confirmed list when a mutation has a network failure', async () => {
    api.listAddresses.mockResolvedValueOnce(result([address()]));
    api.updateAddress.mockRejectedValueOnce(
      new ApiRequestError('NETWORK_ERROR', '网络连接失败，请稍后重试'),
    );
    const store = useAddressStore();
    await store.load('service-token');
    await expect(
      store.update('service-token', 'address-current', { ...input, recipientName: '未确认' }),
    ).rejects.toBeInstanceOf(ApiRequestError);
    expect(store.addresses).toEqual([address()]);
    expect(store.mutationError).toBe('网络连接失败，请稍后重试');
  });

  it('uses complete server lists after setting default and deleting', async () => {
    const secondary = address({ id: 'address-secondary', isDefault: false });
    api.setDefaultAddress.mockResolvedValueOnce(
      result([{ ...secondary, isDefault: true }, address({ isDefault: false })]),
    );
    api.removeAddress.mockResolvedValueOnce(result([address()]));
    const store = useAddressStore();
    await store.setDefault('service-token', secondary.id);
    expect(store.addresses[0]).toMatchObject({ id: secondary.id, isDefault: true });
    await store.remove('service-token', secondary.id);
    expect(store.addresses).toEqual([address()]);
  });

  it('maps unavailable-community recovery and clears sensitive state on reset', async () => {
    api.setDefaultAddress.mockRejectedValueOnce(
      new ApiRequestError('COMMUNITY_NOT_FOUND', 'community unavailable'),
    );
    const store = useAddressStore();
    await expect(store.setDefault('service-token', 'address-current')).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(store.mutationError).toBe('所选小区已停用，请重新选择');
    store.addresses = [address()];
    store.reset();
    expect(store.addresses).toEqual([]);
  });
});
