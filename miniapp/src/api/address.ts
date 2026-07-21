import type { AddressInput, AddressListResult } from '../types/domain';
import { request } from '../utils/request';

function authorization(token: string) {
  return { authorization: `Bearer ${token}` };
}

export function listAddresses(token: string): Promise<AddressListResult> {
  return request<AddressListResult>('/addresses', { header: authorization(token) });
}

export function createAddress(
  token: string,
  input: AddressInput & { isDefault: boolean },
): Promise<AddressListResult> {
  return request<AddressListResult>('/addresses', {
    method: 'POST',
    header: authorization(token),
    data: input,
  });
}

export function updateAddress(
  token: string,
  addressId: string,
  input: AddressInput,
): Promise<AddressListResult> {
  return request<AddressListResult>(`/addresses/${encodeURIComponent(addressId)}`, {
    method: 'PUT',
    header: authorization(token),
    data: input,
  });
}

export function setDefaultAddress(token: string, addressId: string): Promise<AddressListResult> {
  return request<AddressListResult>(`/addresses/${encodeURIComponent(addressId)}/default`, {
    method: 'PUT',
    header: authorization(token),
  });
}

export function removeAddress(token: string, addressId: string): Promise<AddressListResult> {
  return request<AddressListResult>(`/addresses/${encodeURIComponent(addressId)}`, {
    method: 'DELETE',
    header: authorization(token),
  });
}
