import { ERROR_CODES } from '../constants/error-codes.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../middlewares/error.middleware.js';
import type { AuditActor } from '../repositories/audit.repository.js';
import {
  InvalidCommunityReferenceError,
  storeRepository,
  type StoreWriteInput,
} from '../repositories/store.repository.js';
import { mediaService } from './media.service.js';

function notFound() {
  return new HttpError(404, ERROR_CODES.NOT_FOUND, '店铺不存在');
}

function serialize<
  T extends {
    minimumOrderAmount: Prisma.Decimal;
    defaultDeliveryFee: Prisma.Decimal;
    communities?: unknown;
  },
>(store: T) {
  return {
    ...store,
    minimumOrderAmount: store.minimumOrderAmount.toFixed(2),
    defaultDeliveryFee: store.defaultDeliveryFee.toFixed(2),
  };
}

async function translateReferences<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof InvalidCommunityReferenceError) {
      throw new HttpError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        '配送范围包含不存在、停用或已删除的小区',
      );
    }
    throw error;
  }
}

export const storeService = {
  async list(
    page: number,
    pageSize: number,
    keyword?: string,
    status?: 'OPEN' | 'PAUSED' | 'DISABLED',
  ) {
    const result = await storeRepository.list(page, pageSize, keyword, status);
    return {
      list: result.list.map(serialize),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  },
  async create(input: StoreWriteInput, actor: AuditActor) {
    await mediaService.assertManagedUrls([input.logoUrl, input.coverUrl]);
    return serialize(await translateReferences(() => storeRepository.create(input, actor)));
  },
  async update(id: string, input: StoreWriteInput, actor: AuditActor) {
    if (!(await storeRepository.find(id))) throw notFound();
    await mediaService.assertManagedUrls([input.logoUrl, input.coverUrl]);
    return serialize(await translateReferences(() => storeRepository.update(id, input, actor)));
  },
  async updateStatus(id: string, status: 'OPEN' | 'PAUSED' | 'DISABLED', actor: AuditActor) {
    if (!(await storeRepository.find(id))) throw notFound();
    return serialize(await storeRepository.updateStatus(id, status, actor));
  },
  async remove(id: string, actor: AuditActor) {
    const existing = await storeRepository.find(id);
    if (!existing) throw notFound();
    return serialize(await storeRepository.softDelete(id, actor, existing.name));
  },
};
