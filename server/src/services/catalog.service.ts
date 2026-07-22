import { Prisma } from '../generated/prisma/client.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  catalogRepository,
  CategoryHasProductsError,
  InvalidCatalogReferenceError,
  ProductCannotBeOnSaleError,
  type CategoryWriteInput,
  type ProductWriteInput,
} from '../repositories/catalog.repository.js';
import type { AuditActor } from '../repositories/audit.repository.js';
import { mediaService } from './media.service.js';

function translate(error: unknown): never {
  if (error instanceof InvalidCatalogReferenceError) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '店铺或商品分类无效');
  }
  if (error instanceof ProductCannotBeOnSaleError) {
    throw new HttpError(409, ERROR_CODES.CONFLICT, '零库存、停用分类或停用店铺下的商品不能上架');
  }
  if (error instanceof CategoryHasProductsError) {
    throw new HttpError(409, ERROR_CODES.CONFLICT, '分类下仍有商品，不能删除');
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new HttpError(409, ERROR_CODES.CONFLICT, '同一店铺下已存在同名分类');
  }
  throw error;
}

async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return translate(error);
  }
}

function serializeProduct<
  T extends {
    price: Prisma.Decimal;
    originalPrice: Prisma.Decimal | null;
    galleryImageUrls: Prisma.JsonValue | null;
  },
>(item: T) {
  return {
    ...item,
    galleryImageUrls: Array.isArray(item.galleryImageUrls)
      ? [
          ...new Set(
            item.galleryImageUrls.filter((value): value is string => typeof value === 'string'),
          ),
        ]
      : [],
    price: item.price.toFixed(2),
    originalPrice: item.originalPrice?.toFixed(2) ?? null,
  };
}

export const catalogService = {
  listCategories: catalogRepository.listCategories,
  createCategory(input: CategoryWriteInput, actor: AuditActor) {
    return safe(() => catalogRepository.createCategory(input, actor));
  },
  async updateCategory(id: string, input: CategoryWriteInput, actor: AuditActor) {
    const existing = await catalogRepository.findCategory(id);
    if (!existing) throw new HttpError(404, ERROR_CODES.NOT_FOUND, '商品分类不存在');
    if (existing.storeId !== input.storeId) {
      throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '不能跨店铺移动分类');
    }
    return safe(() => catalogRepository.updateCategory(id, input, actor));
  },
  async removeCategory(id: string, actor: AuditActor) {
    const existing = await catalogRepository.findCategory(id);
    if (!existing) throw new HttpError(404, ERROR_CODES.NOT_FOUND, '商品分类不存在');
    return safe(() => catalogRepository.softDeleteCategory(id, actor, existing.name));
  },
  async listProducts(
    storeId: string,
    page: number,
    pageSize: number,
    keyword?: string,
    categoryId?: string,
    status?: 'ON_SALE' | 'SOLD_OUT' | 'OFF_SHELF',
  ) {
    const result = await catalogRepository.listProducts(
      storeId,
      page,
      pageSize,
      keyword,
      categoryId,
      status,
    );
    return {
      list: result.list.map(serializeProduct),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  },
  async createProduct(input: ProductWriteInput, actor: AuditActor) {
    await mediaService.assertManagedUrls([input.mainImageUrl, ...(input.galleryImageUrls ?? [])]);
    return serializeProduct(await safe(() => catalogRepository.createProduct(input, actor)));
  },
  async updateProduct(id: string, input: ProductWriteInput, actor: AuditActor) {
    const existing = await catalogRepository.findProduct(id);
    if (!existing) throw new HttpError(404, ERROR_CODES.NOT_FOUND, '商品不存在');
    if (existing.storeId !== input.storeId) {
      throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '不能跨店铺移动商品');
    }
    await mediaService.assertManagedUrls([input.mainImageUrl, ...(input.galleryImageUrls ?? [])]);
    return serializeProduct(await safe(() => catalogRepository.updateProduct(id, input, actor)));
  },
  async removeProduct(id: string, actor: AuditActor) {
    const existing = await catalogRepository.findProduct(id);
    if (!existing) throw new HttpError(404, ERROR_CODES.NOT_FOUND, '商品不存在');
    return serializeProduct(await catalogRepository.softDeleteProduct(id, actor, existing.name));
  },
};
