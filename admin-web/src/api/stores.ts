import { http } from './http';
import type { Community } from './communities';
import type { ApiSuccess, PageResult } from '../types/api';

export type StoreStatus = 'OPEN' | 'PAUSED' | 'DISABLED';

export interface StoreCommunity {
  communityId: string;
  community: Community;
}

export interface Store {
  id: string;
  name: string;
  phone: string;
  address: string;
  description: string | null;
  announcement: string | null;
  businessStartTime: string;
  businessEndTime: string;
  minimumOrderAmount: string;
  defaultDeliveryFee: string;
  estimatedDeliveryMinutes: number;
  status: StoreStatus;
  sortOrder: number;
  communities: StoreCommunity[];
}

export interface StoreInput {
  name: string;
  phone: string;
  address: string;
  description?: string;
  announcement?: string;
  businessStartTime: string;
  businessEndTime: string;
  minimumOrderAmount: string;
  defaultDeliveryFee: string;
  estimatedDeliveryMinutes: number;
  status: StoreStatus;
  sortOrder: number;
  communityIds: string[];
}

export async function listStores(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: StoreStatus;
}): Promise<PageResult<Store>> {
  const response = await http.get<ApiSuccess<PageResult<Store>>>('/admin/stores', { params });
  return response.data.data;
}

export async function createStore(input: StoreInput): Promise<Store> {
  const response = await http.post<ApiSuccess<Store>>('/admin/stores', input);
  return response.data.data;
}

export async function updateStore(id: string, input: StoreInput): Promise<Store> {
  const response = await http.put<ApiSuccess<Store>>(`/admin/stores/${id}`, input);
  return response.data.data;
}

export async function updateStoreStatus(id: string, status: StoreStatus): Promise<Store> {
  const response = await http.patch<ApiSuccess<Store>>(`/admin/stores/${id}/status`, { status });
  return response.data.data;
}

export async function deleteStore(id: string): Promise<void> {
  await http.delete(`/admin/stores/${id}`);
}
