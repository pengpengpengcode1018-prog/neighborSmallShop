import type { ProductDetail, ProductListResult } from '../types/domain';
import { request } from '../utils/request';

export interface ProductListQuery {
  communityId?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

function queryString(query: ProductListQuery): string {
  const entries: string[] = [];
  if (query.communityId) entries.push(`communityId=${encodeURIComponent(query.communityId)}`);
  if (query.categoryId) entries.push(`categoryId=${encodeURIComponent(query.categoryId)}`);
  if (query.page) entries.push(`page=${query.page}`);
  if (query.pageSize) entries.push(`pageSize=${query.pageSize}`);
  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

export function listProducts(
  storeId: string,
  query: ProductListQuery = {},
): Promise<ProductListResult> {
  return request<ProductListResult>(
    `/stores/${encodeURIComponent(storeId)}/products${queryString(query)}`,
  );
}

export function getProduct(productId: string, communityId?: string): Promise<ProductDetail> {
  const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
  return request<ProductDetail>(`/products/${encodeURIComponent(productId)}${query}`);
}
