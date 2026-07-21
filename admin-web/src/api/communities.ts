import { http } from './http';
import type { ApiSuccess, PageResult } from '../types/api';

export type CommunityStatus = 'ENABLED' | 'DISABLED';

export interface Community {
  id: string;
  name: string;
  city: string;
  district: string;
  detailedAddress: string;
  status: CommunityStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityInput {
  name: string;
  city: string;
  district: string;
  detailedAddress: string;
  status: CommunityStatus;
  sortOrder: number;
}

export async function listCommunities(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: CommunityStatus;
}): Promise<PageResult<Community>> {
  const response = await http.get<ApiSuccess<PageResult<Community>>>('/admin/communities', {
    params,
  });
  return response.data.data;
}

export async function createCommunity(input: CommunityInput): Promise<Community> {
  const response = await http.post<ApiSuccess<Community>>('/admin/communities', input);
  return response.data.data;
}

export async function updateCommunity(id: string, input: CommunityInput): Promise<Community> {
  const response = await http.put<ApiSuccess<Community>>(`/admin/communities/${id}`, input);
  return response.data.data;
}

export async function updateCommunityStatus(
  id: string,
  status: CommunityStatus,
): Promise<Community> {
  const response = await http.patch<ApiSuccess<Community>>(`/admin/communities/${id}/status`, {
    status,
  });
  return response.data.data;
}

export async function deleteCommunity(id: string): Promise<void> {
  await http.delete(`/admin/communities/${id}`);
}
