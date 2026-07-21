import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  residentProductRepository,
  type ResidentProductRecord,
} from '../repositories/resident-product.repository.js';
import { residentStoreService } from './resident-store.service.js';

function categoryNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.CATEGORY_NOT_FOUND, '商品分类不存在或已停用');
}

function productNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.PRODUCT_NOT_FOUND, '商品不存在或已下架');
}

function displayStatus(product: ResidentProductRecord): 'ON_SALE' | 'SOLD_OUT' {
  return product.status === 'SOLD_OUT' || product.stock === 0 ? 'SOLD_OUT' : 'ON_SALE';
}

function serializeSummary(product: ResidentProductRecord, storeCanOrder: boolean) {
  const status = displayStatus(product);
  return {
    id: product.id,
    storeId: product.storeId,
    categoryId: product.categoryId,
    name: product.name,
    mainImageUrl: product.mainImageUrl,
    description: product.description,
    price: product.price.toFixed(2),
    originalPrice: product.originalPrice?.toFixed(2) ?? null,
    stock: product.stock,
    salesVolume: product.salesVolume,
    purchaseLimit: product.purchaseLimit,
    isHot: product.isHot,
    status,
    canPurchase: storeCanOrder && status === 'ON_SALE',
  };
}

function galleryImages(value: ResidentProductRecord['galleryImageUrls']): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export const residentProductService = {
  async list(
    storeId: string,
    page: number,
    pageSize: number,
    communityId?: string,
    categoryId?: string,
  ) {
    const store = await residentStoreService.detail(storeId, communityId);
    if (categoryId && !(await residentProductRepository.findVisibleCategory(storeId, categoryId))) {
      throw categoryNotFound();
    }
    const [categories, result] = await Promise.all([
      residentProductRepository.listCategories(storeId),
      residentProductRepository.listProducts(storeId, page, pageSize, categoryId),
    ]);
    return {
      categories,
      list: result.list.map((product) => serializeSummary(product, store.canOrder)),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  },

  async detail(id: string, communityId?: string) {
    const product = await residentProductRepository.findVisibleProduct(id);
    if (!product) throw productNotFound();
    const store = await residentStoreService.detail(product.storeId, communityId);
    return {
      ...serializeSummary(product, store.canOrder),
      galleryImageUrls: galleryImages(product.galleryImageUrls),
      detail: product.detail,
      afterSaleNotes: product.afterSaleNotes,
    };
  },
};
