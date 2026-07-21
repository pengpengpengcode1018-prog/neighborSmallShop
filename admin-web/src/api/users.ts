import type { ApiSuccess } from '../types/api';
import { http } from './http';

export type ResidentUserStatus = 'ACTIVE' | 'DISABLED';

export interface ResidentUserSummary {
  id: string;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  maskedPhone: string | null;
  phoneBound: boolean;
  currentCommunity: { id: string; name: string } | null;
  status: ResidentUserStatus;
  registeredAt: string;
  lastLoginAt: string | null;
  updatedAt: string;
}

export interface ResidentUserQuery {
  keyword?: string;
  status?: ResidentUserStatus;
  phoneBound?: boolean;
  communityId?: string;
  page: number;
  pageSize: number;
}

export interface ResidentUserListResult {
  list: ResidentUserSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function listResidentUsers(query: ResidentUserQuery): Promise<ResidentUserListResult> {
  const response = await http.get<ApiSuccess<ResidentUserListResult>>('/admin/users', {
    params: query,
  });
  return response.data.data;
}

export async function getResidentUser(id: string): Promise<ResidentUserSummary> {
  const response = await http.get<ApiSuccess<ResidentUserSummary>>(`/admin/users/${id}`);
  return response.data.data;
}
