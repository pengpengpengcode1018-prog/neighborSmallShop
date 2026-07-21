import { http } from './http';
import type { ApiSuccess, PageResult } from '../types/api';

export type EnableStatus = 'ENABLED' | 'DISABLED';
export type ProductStatus = 'ON_SALE' | 'SOLD_OUT' | 'OFF_SHELF';

export interface ProductCategory {
  id: string;
  storeId: string;
  name: string;
  status: EnableStatus;
  sortOrder: number;
}

export interface CategoryInput {
  storeId: string;
  name: string;
  status: EnableStatus;
  sortOrder: number;
}

export interface Product {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  description: string | null;
  detail: string | null;
  price: string;
  originalPrice: string | null;
  stock: number;
  purchaseLimit: number | null;
  stockWarningThreshold: number;
  isHot: boolean;
  status: ProductStatus;
  sortOrder: number;
  category: ProductCategory;
}

export interface ProductInput {
  storeId: string;
  categoryId: string;
  name: string;
  description?: string | undefined;
  detail?: string | undefined;
  price: string;
  originalPrice?: string | undefined;
  stock: number;
  purchaseLimit?: number | undefined;
  stockWarningThreshold: number;
  isHot: boolean;
  status: ProductStatus;
  sortOrder: number;
}

export async function listCategories(storeId: string): Promise<ProductCategory[]> {
  const response = await http.get<ApiSuccess<ProductCategory[]>>('/admin/categories', {
    params: { storeId },
  });
  return response.data.data;
}

export async function createCategory(input: CategoryInput): Promise<ProductCategory> {
  const response = await http.post<ApiSuccess<ProductCategory>>('/admin/categories', input);
  return response.data.data;
}

export async function updateCategory(id: string, input: CategoryInput): Promise<ProductCategory> {
  const response = await http.put<ApiSuccess<ProductCategory>>(`/admin/categories/${id}`, input);
  return response.data.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await http.delete(`/admin/categories/${id}`);
}

export async function listProducts(params: {
  storeId: string;
  page: number;
  pageSize: number;
  keyword?: string;
  categoryId?: string;
  status?: ProductStatus;
}): Promise<PageResult<Product>> {
  const response = await http.get<ApiSuccess<PageResult<Product>>>('/admin/products', { params });
  return response.data.data;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const response = await http.post<ApiSuccess<Product>>('/admin/products', input);
  return response.data.data;
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const response = await http.put<ApiSuccess<Product>>(`/admin/products/${id}`, input);
  return response.data.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await http.delete(`/admin/products/${id}`);
}
