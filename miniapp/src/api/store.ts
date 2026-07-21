import type { StoreListResult, StoreSummary } from '../types/domain';
import { request } from '../utils/request';

export interface StoreListQuery {
  communityId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

function queryString(query: StoreListQuery): string {
  const entries: string[] = [];
  if (query.communityId) entries.push(`communityId=${encodeURIComponent(query.communityId)}`);
  if (query.keyword) entries.push(`keyword=${encodeURIComponent(query.keyword)}`);
  if (query.page) entries.push(`page=${query.page}`);
  if (query.pageSize) entries.push(`pageSize=${query.pageSize}`);
  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

export function listStores(query: StoreListQuery = {}): Promise<StoreListResult> {
  return request<StoreListResult>(`/stores${queryString(query)}`);
}

export function getStore(storeId: string, communityId?: string): Promise<StoreSummary> {
  const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
  return request<StoreSummary>(`/stores/${encodeURIComponent(storeId)}${query}`);
}
