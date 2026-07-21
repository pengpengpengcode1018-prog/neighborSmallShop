import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  createAddress,
  listAddresses,
  removeAddress,
  setDefaultAddress,
  updateAddress,
} from '../api/address';
import type { AddressInput, AddressListResult, AddressView } from '../types/domain';
import { ApiRequestError } from '../utils/request';

function addressErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'ADDRESS_NOT_FOUND') return '收货地址已不存在，请刷新';
    if (error.code === 'COMMUNITY_NOT_FOUND') return '所选小区已停用，请重新选择';
    if (error.code === 'VALIDATION_ERROR') return '请检查收货地址信息';
    return error.message;
  }
  return '地址操作失败，请稍后重试';
}

export const useAddressStore = defineStore('address', () => {
  const addresses = ref<AddressView[]>([]);
  const isLoading = ref(false);
  const mutationCount = ref(0);
  const loadError = ref<string | null>(null);
  const mutationError = ref<string | null>(null);
  const isMutating = computed(() => mutationCount.value > 0);

  function reset(): void {
    addresses.value = [];
    isLoading.value = false;
    mutationCount.value = 0;
    loadError.value = null;
    mutationError.value = null;
  }

  async function load(token: string): Promise<void> {
    if (isLoading.value) return;
    isLoading.value = true;
    loadError.value = null;
    try {
      addresses.value = (await listAddresses(token)).list;
    } catch (error) {
      loadError.value = addressErrorMessage(error);
    } finally {
      isLoading.value = false;
    }
  }

  async function mutate(operation: () => Promise<AddressListResult>): Promise<AddressView[]> {
    mutationCount.value += 1;
    mutationError.value = null;
    try {
      const confirmed = await operation();
      addresses.value = confirmed.list;
      return confirmed.list;
    } catch (error) {
      mutationError.value = addressErrorMessage(error);
      throw error;
    } finally {
      mutationCount.value -= 1;
    }
  }

  function create(
    token: string,
    input: AddressInput & { isDefault: boolean },
  ): Promise<AddressView[]> {
    return mutate(() => createAddress(token, input));
  }

  function update(token: string, addressId: string, input: AddressInput): Promise<AddressView[]> {
    return mutate(() => updateAddress(token, addressId, input));
  }

  function setDefault(token: string, addressId: string): Promise<AddressView[]> {
    return mutate(() => setDefaultAddress(token, addressId));
  }

  function remove(token: string, addressId: string): Promise<AddressView[]> {
    return mutate(() => removeAddress(token, addressId));
  }

  return {
    addresses,
    isLoading,
    isMutating,
    loadError,
    mutationError,
    load,
    create,
    update,
    setDefault,
    remove,
    reset,
  };
});
